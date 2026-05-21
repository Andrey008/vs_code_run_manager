import * as vscode from 'vscode';
import { ServiceStateMachine } from '../state/serviceStateMachine';
import type { IRunner, ServiceConfig, ServiceStatus, LaunchServiceConfig } from '../types';

const out = vscode.window.createOutputChannel('Run Manager');
function log(msg: string) { out.appendLine(`[LaunchRunner] ${msg}`); }

type StatusCallback = (id: string, status: ServiceStatus) => void;
type DataCallback = (id: string, chunk: string) => void;

interface SessionEntry {
  session: vscode.DebugSession;
  serviceId: string;
}

export class LaunchRunner implements IRunner {
  private readonly _machines = new Map<string, ServiceStateMachine>();
  private readonly _configs = new Map<string, LaunchServiceConfig>();
  private readonly _sessions = new Map<string, SessionEntry>(); // sessionId → entry
  private readonly _serviceSession = new Map<string, string>(); // serviceId → sessionId
  private readonly _terminals = new Map<string, vscode.Terminal>(); // serviceId → terminal
  private readonly _statusCallbacks: StatusCallback[] = [];
  private readonly _dataCallbacks: DataCallback[] = [];
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _stopFallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private _pendingTerminal: string | null = null; // serviceId whose terminal hasn't opened yet

  constructor() {
    this._disposables.push(
      vscode.debug.onDidStartDebugSession(s => this._onStart(s as vscode.DebugSession)),
      vscode.debug.onDidTerminateDebugSession(s => this._onTerminate(s as vscode.DebugSession)),
      vscode.window.onDidOpenTerminal(t => this._onTerminalOpen(t)),
    );
  }

  onStatusChange(callback: StatusCallback): void {
    this._statusCallbacks.push(callback);
  }

  onData(callback: DataCallback): void {
    this._dataCallbacks.push(callback);
  }

  getStatuses(): Map<string, ServiceStatus> {
    const result = new Map<string, ServiceStatus>();
    for (const [id, machine] of this._machines) result.set(id, machine.status);
    return result;
  }

  async start(service: ServiceConfig): Promise<void> {
    if (service.type !== 'launch') return;
    const svc = service as LaunchServiceConfig;
    const machine = this._getOrCreateMachine(svc.id);
    if (machine.status !== 'stopped') return;

    this._configs.set(svc.id, svc);
    machine.start();

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this._pendingTerminal = svc.id;
    log(`starting "${svc.launchConfig}" (noDebug:false)`);
    const started = await vscode.debug.startDebugging(workspaceFolder, svc.launchConfig, { noDebug: false });
    if (!started) {
      this._pendingTerminal = null;
      log(`startDebugging returned false for "${svc.launchConfig}"`);
      vscode.window.showErrorMessage(`Run Manager: failed to start "${svc.name}" — check launch.json`);
      machine.processExited(1);
      return;
    }
    // Clear the pending slot after 5s in case no terminal opens (non-terminal launch configs)
    setTimeout(() => { if (this._pendingTerminal === svc.id) this._pendingTerminal = null; }, 5000);
  }

  async stop(service: ServiceConfig): Promise<void> {
    const machine = this._machines.get(service.id);
    log(`stop "${service.id}" — machine:${machine?.status ?? 'none'} session:${this._serviceSession.get(service.id) ?? 'none'} terminal:${!!this._terminals.get(service.id)}`);
    if (!machine || machine.status === 'stopped') return;

    // Send Ctrl+C to the integrated terminal — this is what actually kills the JVM.
    // stopDebugging() only disconnects the JDWP debugger; the JVM process lives on.
    const terminal = this._terminals.get(service.id);
    if (terminal) {
      log(`sending Ctrl+C to terminal for "${service.id}"`);
      terminal.sendText('\x03', false);
    }

    const sessionId = this._serviceSession.get(service.id);
    const entry = sessionId ? this._sessions.get(sessionId) : undefined;
    if (entry) {
      // Walk up to the root session to also clean up the debugger UI
      let stopSession = entry.session;
      while (stopSession.parentSession) {
        const parentEntry = this._sessions.get(stopSession.parentSession.id);
        if (parentEntry) stopSession = parentEntry.session;
        else break;
      }
      log(`stopDebugging root session ${stopSession.id} (tracked leaf: ${entry.session.id})`);
      // Don't await — Ctrl+C will cause the session to terminate naturally
      vscode.debug.stopDebugging(stopSession);
      // Fallback: if onDidTerminateDebugSession never fires, force UI update after 5s
      const timer = setTimeout(() => {
        this._stopFallbackTimers.delete(service.id);
        if (machine.status !== 'stopped') machine.stop();
      }, 5000);
      this._stopFallbackTimers.set(service.id, timer);
    } else if (!terminal) {
      log(`no session or terminal found — calling machine.stop() directly`);
      machine.stop();
    }
  }

  showTerminal(id: string): void {
    this._terminals.get(id)?.show();
  }

  async restart(service: ServiceConfig): Promise<void> {
    await this.stop(service);
    await this._waitUntilStopped(service.id);
    await this.start(service);
  }

  private _waitUntilStopped(id: string, timeoutMs = 10_000): Promise<void> {
    const machine = this._machines.get(id);
    if (!machine || machine.status === 'stopped') return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`timeout waiting for "${id}" to stop`));
      }, timeoutMs);

      const unsubscribe = machine.onStatusChange(status => {
        if (status === 'stopped' || status === 'crashed') {
          clearTimeout(timer);
          unsubscribe();
          resolve();
        }
      });
    });
  }

  dispose(): void {
    for (const t of this._stopFallbackTimers.values()) clearTimeout(t);
    this._stopFallbackTimers.clear();
    this._disposables.forEach(d => d.dispose());
    this._disposables.length = 0;
  }

  private _onTerminalOpen(terminal: vscode.Terminal): void {
    if (!this._pendingTerminal) return;
    const serviceId = this._pendingTerminal;
    this._pendingTerminal = null;
    this._terminals.set(serviceId, terminal);
    log(`terminal opened for service "${serviceId}": "${terminal.name}"`);
  }

  private _onStart(session: vscode.DebugSession): void {
    log(`onStart id=${session.id} name="${session.name}" parent=${session.parentSession?.id ?? 'none'}`);

    // If this is a child of a session we're already tracking, remap to the child
    if (session.parentSession) {
      const parentEntry = this._sessions.get(session.parentSession.id);
      if (parentEntry) {
        log(`child session of ${session.parentSession.id} → remapping ${parentEntry.serviceId} to ${session.id}`);
        this._sessions.set(session.id, { session, serviceId: parentEntry.serviceId });
        this._serviceSession.set(parentEntry.serviceId, session.id);
        return;
      }
    }

    for (const [id, config] of this._configs) {
      const machine = this._machines.get(id);
      if (!machine || config.launchConfig !== session.name) continue;

      if (machine.status === 'starting') {
        log(`mapped "${session.name}" → service "${id}"`);
        this._sessions.set(session.id, { session, serviceId: id });
        this._serviceSession.set(id, session.id);
        machine.firstOutput();
        return;
      }

      // Replacement session while service already running
      if (machine.status === 'running' || machine.status === 'ready') {
        log(`replacement session for running service "${id}"`);
        this._sessions.set(session.id, { session, serviceId: id });
        this._serviceSession.set(id, session.id);
        return;
      }
    }

    log(`unmatched session "${session.name}" id=${session.id}`);
  }

  private _onTerminate(session: vscode.DebugSession): void {
    const entry = this._sessions.get(session.id);
    log(`onTerminate id=${session.id} name="${session.name}" tracked=${!!entry}`);
    if (!entry) return;

    this._sessions.delete(session.id);

    const sibling = [...this._sessions.entries()].find(([, e]) => e.serviceId === entry.serviceId);
    if (sibling) {
      log(`sibling session ${sibling[0]} still alive — keeping "${entry.serviceId}" running`);
      this._serviceSession.set(entry.serviceId, sibling[0]);
      return;
    }

    this._serviceSession.delete(entry.serviceId);
    const fallback = this._stopFallbackTimers.get(entry.serviceId);
    if (fallback) { clearTimeout(fallback); this._stopFallbackTimers.delete(entry.serviceId); }
    this._terminals.delete(entry.serviceId);
    log(`no siblings — processExited for "${entry.serviceId}"`);
    const machine = this._machines.get(entry.serviceId);
    machine?.processExited(0);
  }

  private _getOrCreateMachine(id: string): ServiceStateMachine {
    if (!this._machines.has(id)) {
      const machine = new ServiceStateMachine(id);
      machine.onStatusChange(status => {
        this._statusCallbacks.forEach(cb => cb(id, status));
      });
      this._machines.set(id, machine);
    }
    return this._machines.get(id)!;
  }
}
