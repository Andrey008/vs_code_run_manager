import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { buildConfig } from '../config/configParser';
import { ShellRunner } from '../runners/ShellRunner';
import { LaunchRunner } from '../runners/LaunchRunner';
import { TaskRunner } from '../runners/TaskRunner';
import { DockerRunner } from '../runners/DockerRunner';
import { LogManager } from '../managers/LogManager';
import { topoSort } from '../graph/dependencyGraph';
import { discoverTasks } from '../config/taskDiscovery';
import { migrateFromSelected, normalizeLayout, pruneLayout } from '../layout/activeLayout';
import type { ServicesConfig, ServiceConfig, ServiceGroup, ServiceStatus, ExtensionMessage, WebviewMessage, ServiceMode, DockerComposeServiceConfig, TaskServiceConfig, ActiveLayout } from '../types';

const LAYOUT_KEY = 'activeLayout';
const LEGACY_SELECTED_KEY = 'selectedServices';

/** Appends task groups, suffixing any name that collides with an existing group. */
function mergeGroups(base: ServiceGroup[], extra: ServiceGroup[]): ServiceGroup[] {
  const names = new Set(base.map(g => g.name));
  const merged = [...base];
  for (const group of extra) {
    let name = group.name;
    while (names.has(name)) name = `${name} (tasks)`;
    names.add(name);
    merged.push(name === group.name ? group : { ...group, name });
  }
  return merged;
}

interface Runners {
  shellRunner: ShellRunner;
  launchRunner: LaunchRunner;
  taskRunner: TaskRunner;
  dockerRunner: DockerRunner;
}

type StatusListener = (id: string, status: ServiceStatus) => void;

export class RunManagerPanel implements vscode.WebviewViewProvider {
  static readonly viewType = 'runManager.panel';

  private _view: vscode.WebviewView | undefined;
  private _config: ServicesConfig | null = null;
  private readonly _modes = new Map<string, ServiceMode>();
  private readonly _currentStatuses = new Map<string, ServiceStatus>();
  private readonly _statusListeners = new Set<StatusListener>();

  static register(
    context: vscode.ExtensionContext,
    runners: Runners,
    logManager: LogManager
  ): vscode.Disposable {
    const provider = new RunManagerPanel(context, runners, logManager);
    return vscode.window.registerWebviewViewProvider(
      RunManagerPanel.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    );
  }

  private constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _runners: Runners,
    private readonly _logManager: LogManager
  ) {
    const allRunners = [_runners.shellRunner, _runners.launchRunner, _runners.taskRunner, _runners.dockerRunner];
    for (const runner of allRunners) {
      runner.onStatusChange((id, status) => {
        this._currentStatuses.set(id, status);
        this._statusListeners.forEach(fn => fn(id, status));
        this._postMessage({ type: 'statusUpdate', id, status });
      });
      runner.onData((id, chunk) => this._logManager.append(id, chunk));
    }

    this._logManager.onFlush((id, chunks) => {
      this._postMessage({ type: 'logs', id, chunks });
    });

    const watcher = vscode.workspace.createFileSystemWatcher('**/.vscode/{launch,tasks,services}.json');
    const reload = () => this._loadConfigAndSendInit();
    watcher.onDidChange(reload);
    watcher.onDidCreate(reload);
    watcher.onDidDelete(reload);
    _context.subscriptions.push(watcher);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._context.extensionUri, 'webview', 'dist')],
    };
    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => this._handleWebviewMessage(msg));

    webviewView.onDidDispose(() => {
      this._view = undefined;
      this._statusListeners.clear();
    });
  }

  private _handleWebviewMessage(msg: WebviewMessage): void {
    switch (msg.type) {
      case 'ready':
        this._loadConfigAndSendInit();
        break;
      case 'start':
        this._startWithDeps(msg.id).catch(err =>
          vscode.window.showErrorMessage(`Run Manager: ${(err as Error).message}`)
        );
        break;
      case 'stop':
        this._runOnService(msg.id, (runner, svc) => runner.stop(svc));
        break;
      case 'restart':
        this._runOnService(msg.id, (runner, svc) => runner.restart(svc));
        break;
      case 'startGroup':
        this._startGroup(msg.groupName).catch(err =>
          vscode.window.showErrorMessage(`Run Manager: ${(err as Error).message}`)
        );
        break;
      case 'startServices':
        Promise.allSettled(msg.ids.map(id => this._startWithDeps(id))).catch(() => { /* per-service errors surface individually */ });
        break;
      case 'toggleMode':
        this._modes.set(msg.id, msg.mode);
        break;
      case 'saveLayout':
        this._context.workspaceState.update(LAYOUT_KEY, normalizeLayout(msg.layout));
        break;
      case 'requestLogs': {
        const lines = this._logManager.getBuffer(msg.id);
        if (lines.length > 0) {
          this._postMessage({ type: 'logsReplay', id: msg.id, lines });
        }
        break;
      }
      case 'showTerminal': {
        const svc = this._findService(msg.id);
        if (svc?.type === 'launch') this._runners.launchRunner.showTerminal(msg.id);
        else if (svc?.type === 'task') this._runners.taskRunner.showTerminal(msg.id);
        break;
      }
    }
  }

  private async _startWithDeps(id: string): Promise<void> {
    const allServices = this._config?.groups.flatMap(g => g.services) ?? [];
    const svc = allServices.find(s => s.id === id);
    if (!svc) return;

    let order: string[];
    try {
      order = topoSort(allServices, [id]);
    } catch (err) {
      vscode.window.showErrorMessage(`Run Manager: ${(err as Error).message}`);
      return;
    }

    for (const depId of order) {
      const depSvc = allServices.find(s => s.id === depId)!;
      const status = this._currentStatuses.get(depId) ?? 'stopped';

      if (status !== 'running' && status !== 'ready') {
        const runner = this._routeRunner(depSvc);
        if (runner) {
          const mode = this._modes.get(depId) ?? depSvc.mode ?? 'run';
          await runner.start({ ...depSvc, mode } as ServiceConfig);
        }
      }

      if (depId !== id) {
        await this._waitUntilRunning(depId).catch((err: Error) => {
          throw new Error(`Dependency "${depId}" failed: ${err.message}`);
        });
      }
    }
  }

  private async _startGroup(groupName: string): Promise<void> {
    const group = this._config?.groups.find(g => g.name === groupName);
    if (!group) return;

    await Promise.allSettled(
      group.services.map(svc => this._startWithDeps(svc.id))
    );
  }

  private _waitUntilRunning(id: string, timeoutMs = 30_000): Promise<void> {
    const current = this._currentStatuses.get(id);
    if (current === 'running' || current === 'ready') return Promise.resolve();
    if (current === 'crashed') return Promise.reject(new Error(`service "${id}" crashed`));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timeout waiting for "${id}" to start`));
      }, timeoutMs);

      const handler: StatusListener = (changedId, status) => {
        if (changedId !== id) return;
        if (status === 'running' || status === 'ready') {
          cleanup();
          resolve();
        } else if (status === 'crashed' || status === 'stopped') {
          cleanup();
          reject(new Error(`service "${id}" ${status}`));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this._statusListeners.delete(handler);
      };

      this._statusListeners.add(handler);
    });
  }

  private _runOnService(
    id: string,
    action: (runner: { start: (s: ServiceConfig) => Promise<void>; stop: (s: ServiceConfig) => Promise<void>; restart: (s: ServiceConfig) => Promise<void> }, svc: ServiceConfig) => Promise<void>
  ): void {
    const svc = this._findService(id);
    if (!svc) return;

    const mode = this._modes.get(id) ?? svc.mode ?? 'run';
    const svcWithMode: ServiceConfig = { ...svc, mode } as ServiceConfig;

    const runner = this._routeRunner(svc);
    if (!runner) return;

    action(runner, svcWithMode).catch(err =>
      vscode.window.showErrorMessage(`Run Manager: ${svc.name} — ${(err as Error).message}`)
    );
  }

  private _routeRunner(svc: ServiceConfig) {
    switch (svc.type) {
      case 'shell': return this._runners.shellRunner;
      case 'launch': return this._runners.launchRunner;
      case 'task': return this._runners.taskRunner;
      case 'docker-compose': return this._runners.dockerRunner;
      default: return null;
    }
  }

  private async _loadConfigAndSendInit(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
      vscode.window.showErrorMessage('Run Manager: no workspace folder open.');
      return;
    }

    try {
      this._config = buildConfig(workspaceFolders[0].uri.fsPath);
    } catch (err) {
      vscode.window.showErrorMessage(`Run Manager: invalid services.json — ${(err as Error).message}`);
      this._config = { groups: [] };
    }

    // Merge VS Code tasks (tasks.json + auto-detected npm/gulp/…), grouped by source.
    const explicitTaskNames = new Set(
      this._config.groups
        .flatMap(g => g.services)
        .filter((s): s is TaskServiceConfig => s.type === 'task')
        .map(s => s.taskName)
    );
    const taskGroups = await discoverTasks(explicitTaskNames);
    this._config = { groups: mergeGroups(this._config.groups, taskGroups) };

    const dockerServices = this._config.groups
      .flatMap(g => g.services)
      .filter((s): s is DockerComposeServiceConfig => s.type === 'docker-compose');

    if (dockerServices.length > 0) {
      await this._runners.dockerRunner.syncWithRunning(dockerServices);
    }

    this._sendInit(this._config);
  }

  private _sendInit(config: ServicesConfig): void {
    const allRunners = [
      this._runners.shellRunner, this._runners.launchRunner,
      this._runners.taskRunner, this._runners.dockerRunner,
    ];
    for (const runner of allRunners) {
      for (const [id, status] of runner.getStatuses()) {
        this._currentStatuses.set(id, status);
      }
    }

    const statuses: Record<string, ServiceStatus> = {};
    for (const [id, status] of this._currentStatuses) {
      statuses[id] = status;
    }
    const msg: ExtensionMessage = {
      type: 'init',
      services: config.groups.flatMap(g => g.services),
      groups: config.groups,
      statuses,
      activeLayout: this._resolveLayout(config),
    };
    this._postMessage(msg);
  }

  /**
   * Loads the persisted Active-tab layout, migrating from the legacy flat
   * `selectedServices` list on first run, and prunes service ids that no
   * longer exist in the current config. The pruned result is persisted back.
   */
  private _resolveLayout(config: ServicesConfig): ActiveLayout {
    const validIds = config.groups.flatMap(g => g.services).map(s => s.id);
    const stored = this._context.workspaceState.get<ActiveLayout>(LAYOUT_KEY);
    const base = stored
      ? normalizeLayout(stored)
      : migrateFromSelected(this._context.workspaceState.get<string[]>(LEGACY_SELECTED_KEY, []));
    const layout = pruneLayout(base, validIds);
    this._context.workspaceState.update(LAYOUT_KEY, layout);
    return layout;
  }

  private _findService(id: string): ServiceConfig | undefined {
    return this._config?.groups.flatMap(g => g.services).find(s => s.id === id);
  }

  private _buildHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'webview', 'dist', 'webview.js')
    );

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' 'unsafe-eval';
             style-src 'nonce-${nonce}' 'unsafe-inline';
             img-src ${webview.cspSource} data:;
             font-src ${webview.cspSource} data:;">
  <title>Run Manager</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { overflow: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.initialData = ${JSON.stringify({ groups: [] })};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _postMessage(msg: ExtensionMessage): void {
    this._view?.webview.postMessage(msg);
  }
}
