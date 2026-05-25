import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { RunManagerPanel } from './RunManagerPanel';
import type { ServiceConfig, ServiceStatus, WebviewMessage, ExtensionMessage } from '../types';

const flush = () => new Promise(resolve => setImmediate(resolve));

/** Stand-in for a real runner: records calls and lets tests fire status/data events. */
class MockRunner {
  private _statusCb: ((id: string, status: ServiceStatus) => void) | undefined;
  private _dataCb: ((id: string, chunk: string) => void) | undefined;
  readonly statuses = new Map<string, ServiceStatus>();
  start = jest.fn(async (_s: ServiceConfig) => {});
  stop = jest.fn(async (_s: ServiceConfig) => {});
  restart = jest.fn(async (_s: ServiceConfig) => {});
  showTerminal = jest.fn();
  syncWithRunning = jest.fn(async () => {});
  onStatusChange(cb: (id: string, status: ServiceStatus) => void) { this._statusCb = cb; }
  onData(cb: (id: string, chunk: string) => void) { this._dataCb = cb; }
  getStatuses() { return this.statuses; }
  fireStatus(id: string, status: ServiceStatus) {
    this.statuses.set(id, status);
    this._statusCb?.(id, status);
  }
  fireData(id: string, chunk: string) { this._dataCb?.(id, chunk); }
}

const VALID_CONFIG = JSON.stringify({
  groups: [{
    name: 'App',
    services: [
      { id: 'db', name: 'DB', type: 'shell', cmd: 'echo db' },
      { id: 'api', name: 'API', type: 'shell', cmd: 'echo api', dependsOn: ['db'] },
      { id: 'worker', name: 'Worker', type: 'task', taskName: 'run:worker' },
      { id: 'web', name: 'Web', type: 'launch', launchConfig: 'Web' },
      { id: 'cache', name: 'Cache', type: 'docker-compose', file: 'x.yml', service: 'cache' },
    ],
  }],
});

const CYCLIC_CONFIG = JSON.stringify({
  groups: [{
    name: 'Cycle',
    services: [
      { id: 'a', name: 'A', type: 'shell', cmd: 'echo a', dependsOn: ['b'] },
      { id: 'b', name: 'B', type: 'shell', cmd: 'echo b', dependsOn: ['a'] },
    ],
  }],
});

function writeWorkspace(servicesJson: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-panel-'));
  fs.mkdirSync(path.join(dir, '.vscode'));
  fs.writeFileSync(path.join(dir, '.vscode', 'services.json'), servicesJson);
  return dir;
}

describe('RunManagerPanel', () => {
  let validDir: string;
  let cyclicDir: string;
  let runners: Record<'shellRunner' | 'launchRunner' | 'taskRunner' | 'dockerRunner', MockRunner>;
  let logManager: { onFlush: jest.Mock; getBuffer: jest.Mock; append: jest.Mock };
  let flushCb: ((id: string, chunks: string[]) => void) | undefined;
  let store: Map<string, unknown>;
  let context: vscode.ExtensionContext;
  let provider: RunManagerPanel;
  let postMessage: jest.Mock;
  let msgHandler: (msg: WebviewMessage) => void;
  let disposeHandler: () => void;
  const originalFolders = vscode.workspace.workspaceFolders;

  beforeAll(() => {
    validDir = writeWorkspace(VALID_CONFIG);
    cyclicDir = writeWorkspace(CYCLIC_CONFIG);
  });

  afterAll(() => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = originalFolders;
    fs.rmSync(validDir, { recursive: true, force: true });
    fs.rmSync(cyclicDir, { recursive: true, force: true });
  });

  function useWorkspace(dir: string | undefined) {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders =
      dir ? [{ uri: { fsPath: dir }, name: 'ws', index: 0 }] : undefined;
  }

  function resolveView() {
    postMessage = jest.fn();
    const webviewView = {
      webview: {
        options: {},
        html: '',
        cspSource: 'vscode-webview:',
        asWebviewUri: () => 'webview-uri',
        onDidReceiveMessage: (cb: (m: WebviewMessage) => void) => { msgHandler = cb; return { dispose: jest.fn() }; },
        postMessage,
      },
      onDidDispose: (cb: () => void) => { disposeHandler = cb; return { dispose: jest.fn() }; },
    };
    provider.resolveWebviewView(webviewView as unknown as vscode.WebviewView, {} as never, {} as never);
  }

  async function ready() {
    msgHandler({ type: 'ready' });
    for (let i = 0; i < 4; i++) await flush();
  }

  const sentMessages = () => postMessage.mock.calls.map(c => c[0] as ExtensionMessage);
  const lastInit = () => sentMessages().filter(m => m.type === 'init').at(-1);

  beforeEach(() => {
    jest.clearAllMocks();
    useWorkspace(validDir);

    runners = {
      shellRunner: new MockRunner(),
      launchRunner: new MockRunner(),
      taskRunner: new MockRunner(),
      dockerRunner: new MockRunner(),
    };
    logManager = {
      onFlush: jest.fn((cb: (id: string, chunks: string[]) => void) => { flushCb = cb; }),
      getBuffer: jest.fn(() => [] as string[]),
      append: jest.fn(),
    };
    store = new Map<string, unknown>();
    context = {
      subscriptions: [],
      extensionUri: { fsPath: '/ext' },
      workspaceState: {
        get: jest.fn((key: string, def?: unknown) => (store.has(key) ? store.get(key) : def)),
        update: jest.fn((key: string, val: unknown) => { store.set(key, val); return Promise.resolve(); }),
      },
    } as unknown as vscode.ExtensionContext;

    (vscode.window.registerWebviewViewProvider as jest.Mock).mockImplementation((_vt, p) => {
      provider = p as RunManagerPanel;
      return { dispose: jest.fn() };
    });

    RunManagerPanel.register(
      context,
      runners as unknown as Parameters<typeof RunManagerPanel.register>[1],
      logManager as never
    );
  });

  describe('resolveWebviewView', () => {
    it('builds nonce-CSP HTML and enables scripts', () => {
      resolveView();
      const webview = (provider as unknown as { _view: vscode.WebviewView })._view!.webview;
      expect(webview.html).toContain('<!DOCTYPE html>');
      expect(webview.html).toContain('Content-Security-Policy');
      expect(webview.html).toMatch(/nonce-[a-f0-9]{32}/);
      expect((webview.options as { enableScripts: boolean }).enableScripts).toBe(true);
    });

    it('registers the panel as a context subscription (file watcher)', () => {
      expect(context.subscriptions.length).toBeGreaterThan(0);
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    });
  });

  describe('init', () => {
    it('on "ready" sends an init message with merged config and layout', async () => {
      resolveView();
      await ready();
      const init = lastInit();
      expect(init).toBeDefined();
      expect(init!.services.map(s => s.id).sort()).toEqual(['api', 'cache', 'db', 'web', 'worker']);
      expect(init!.activeLayout.groups.some(g => g.id === 'ungrouped')).toBe(true);
    });

    it('syncs docker services on load', async () => {
      resolveView();
      await ready();
      expect(runners.dockerRunner.syncWithRunning).toHaveBeenCalled();
    });

    it('migrates a legacy selectedServices list into the layout', async () => {
      store.set('selectedServices', ['db', 'api']);
      resolveView();
      await ready();
      const ungrouped = lastInit()!.activeLayout.groups.find(g => g.id === 'ungrouped')!;
      expect(ungrouped.serviceIds.sort()).toEqual(['api', 'db']);
    });

    it('prunes stale ids from a stored layout', async () => {
      store.set('activeLayout', { groups: [{ id: 'ungrouped', name: 'Ungrouped', serviceIds: ['db', 'ghost'] }] });
      resolveView();
      await ready();
      const ungrouped = lastInit()!.activeLayout.groups.find(g => g.id === 'ungrouped')!;
      expect(ungrouped.serviceIds).toEqual(['db']);
    });

    it('reports an error when no workspace folder is open', async () => {
      useWorkspace(undefined);
      resolveView();
      await ready();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('no workspace folder')
      );
    });

    it('reloads config when the file watcher fires', async () => {
      resolveView();
      await ready();
      const watcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
      const reload = (watcher.onDidChange as jest.Mock).mock.calls[0][0];
      postMessage.mockClear();
      reload();
      for (let i = 0; i < 4; i++) await flush();
      expect(sentMessages().some(m => m.type === 'init')).toBe(true);
    });
  });

  describe('start / stop / restart', () => {
    it('starts dependencies before the target service', async () => {
      resolveView();
      await ready();
      msgHandler({ type: 'start', id: 'api' });
      await flush();
      expect(runners.shellRunner.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'db' }));
      runners.shellRunner.fireStatus('db', 'running');
      await flush();
      expect(runners.shellRunner.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'api' }));
    });

    it('surfaces an error when a dependency crashes', async () => {
      resolveView();
      await ready();
      msgHandler({ type: 'start', id: 'api' });
      await flush();
      runners.shellRunner.fireStatus('db', 'crashed');
      await flush();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('db'));
    });

    it('reports a cyclic dependency error', async () => {
      useWorkspace(cyclicDir);
      resolveView();
      await ready();
      msgHandler({ type: 'start', id: 'a' });
      await flush();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Run Manager:'));
      expect(runners.shellRunner.start).not.toHaveBeenCalled();
    });

    it('routes stop and restart to the matching runner', async () => {
      resolveView();
      await ready();
      msgHandler({ type: 'stop', id: 'db' });
      msgHandler({ type: 'restart', id: 'db' });
      await flush();
      expect(runners.shellRunner.stop).toHaveBeenCalledWith(expect.objectContaining({ id: 'db' }));
      expect(runners.shellRunner.restart).toHaveBeenCalledWith(expect.objectContaining({ id: 'db' }));
    });

    it('startServices starts each requested service', async () => {
      resolveView();
      await ready();
      msgHandler({ type: 'startServices', ids: ['worker'] });
      await flush();
      expect(runners.taskRunner.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'worker' }));
    });

    it('startGroup starts every service in the group', async () => {
      resolveView();
      await ready();
      // db pre-running so api's dependency wait resolves immediately.
      runners.shellRunner.fireStatus('db', 'running');
      msgHandler({ type: 'startGroup', groupName: 'App' });
      for (let i = 0; i < 3; i++) await flush();
      expect(runners.shellRunner.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'api' }));
      expect(runners.taskRunner.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'worker' }));
      expect(runners.launchRunner.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'web' }));
      expect(runners.dockerRunner.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'cache' }));
    });

    it('carries the mode from the start message', async () => {
      resolveView();
      await ready();
      msgHandler({ type: 'start', id: 'web', mode: 'debug' });
      await flush();
      expect(runners.launchRunner.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'web', mode: 'debug' }));
    });
  });

  describe('messages', () => {
    it('saveLayout persists a normalized layout', () => {
      resolveView();
      msgHandler({ type: 'saveLayout', layout: { groups: [{ id: 'g1', name: 'A', serviceIds: [] }] } });
      expect(context.workspaceState.update).toHaveBeenCalledWith('activeLayout', expect.objectContaining({
        groups: expect.arrayContaining([expect.objectContaining({ id: 'ungrouped' })]),
      }));
    });

    it('requestLogs replays a non-empty buffer', () => {
      logManager.getBuffer.mockReturnValue(['line-1']);
      resolveView();
      msgHandler({ type: 'requestLogs', id: 'db' });
      expect(sentMessages()).toContainEqual({ type: 'logsReplay', id: 'db', lines: ['line-1'] });
    });

    it('requestLogs sends nothing for an empty buffer', () => {
      resolveView();
      msgHandler({ type: 'requestLogs', id: 'db' });
      expect(sentMessages().some(m => m.type === 'logsReplay')).toBe(false);
    });

    it('showTerminal routes launch and task services to their runners', async () => {
      resolveView();
      await ready();
      msgHandler({ type: 'showTerminal', id: 'web' });
      msgHandler({ type: 'showTerminal', id: 'worker' });
      expect(runners.launchRunner.showTerminal).toHaveBeenCalledWith('web');
      expect(runners.taskRunner.showTerminal).toHaveBeenCalledWith('worker');
    });
  });

  describe('runner events', () => {
    it('forwards runner status changes to the webview', async () => {
      resolveView();
      await ready();
      runners.shellRunner.fireStatus('db', 'running');
      expect(sentMessages()).toContainEqual({ type: 'statusUpdate', id: 'db', status: 'running' });
    });

    it('forwards runner output into the log manager', () => {
      resolveView();
      runners.shellRunner.fireData('db', 'hello');
      expect(logManager.append).toHaveBeenCalledWith('db', 'hello');
    });

    it('forwards batched log flushes to the webview', () => {
      resolveView();
      flushCb!('db', ['chunk']);
      expect(sentMessages()).toContainEqual({ type: 'logs', id: 'db', chunks: ['chunk'] });
    });

    it('stops posting messages after the view is disposed', () => {
      resolveView();
      disposeHandler();
      postMessage.mockClear();
      runners.shellRunner.fireStatus('db', 'running');
      expect(postMessage).not.toHaveBeenCalled();
    });
  });
});
