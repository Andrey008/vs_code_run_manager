import { spawn, ChildProcess } from 'child_process';
import { ServiceStateMachine } from '../state/serviceStateMachine';
import { HealthChecker } from '../health/HealthChecker';
import type { IRunner, ServiceConfig, ServiceStatus, ShellServiceConfig } from '../types';

type StatusCallback = (id: string, status: ServiceStatus) => void;
type DataCallback = (id: string, chunk: string) => void;

export class ShellRunner implements IRunner {
  private readonly _processes = new Map<string, ChildProcess>();
  private readonly _machines = new Map<string, ServiceStateMachine>();
  private readonly _exitHandlers = new Map<string, (code: number | null) => void>();
  private readonly _healthCheckers = new Map<string, HealthChecker>();
  private readonly _statusCallbacks: StatusCallback[] = [];
  private readonly _dataCallbacks: DataCallback[] = [];

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
    if (service.type !== 'shell') return;
    const svc = service as ShellServiceConfig;
    const machine = this._getOrCreateMachine(svc.id);
    if (machine.status !== 'stopped') return;

    machine.start();
    this._spawnProcess(svc, machine);
  }

  async stop(service: ServiceConfig): Promise<void> {
    const machine = this._machines.get(service.id);
    if (!machine || machine.status === 'stopped') return;

    this._healthCheckers.get(service.id)?.dispose();
    this._healthCheckers.delete(service.id);
    machine.stop();

    const proc = this._processes.get(service.id);
    if (!proc) return;

    killGroup(proc, 'SIGTERM');
    const timer = setTimeout(() => {
      if (this._processes.has(service.id)) killGroup(proc, 'SIGKILL');
    }, 5000);

    proc.once('exit', () => clearTimeout(timer));
  }

  async restart(service: ServiceConfig): Promise<void> {
    if (service.type !== 'shell') return;
    const svc = service as ShellServiceConfig;
    const machine = this._machines.get(svc.id);
    if (!machine || machine.status === 'stopped') return;

    const proc = this._processes.get(svc.id);
    if (proc) {
      // Remove the generic exit handler so processExited() doesn't interfere
      this._healthCheckers.get(svc.id)?.dispose();
      this._healthCheckers.delete(svc.id);
      const onExit = this._exitHandlers.get(svc.id);
      if (onExit) {
        proc.removeListener('exit', onExit);
        this._exitHandlers.delete(svc.id);
      }

      await new Promise<void>(resolve => {
        const timer = setTimeout(() => {
          if (this._processes.has(svc.id)) killGroup(proc, 'SIGKILL');
        }, 5000);
        proc.once('exit', () => {
          clearTimeout(timer);
          this._processes.delete(svc.id);
          resolve();
        });
        killGroup(proc, 'SIGTERM');
      });
    }

    machine.restart();
    this._spawnProcess(svc, machine);
  }

  private _spawnProcess(svc: ShellServiceConfig, machine: ServiceStateMachine): void {
    const proc = spawn('sh', ['-c', svc.cmd], {
      cwd: svc.cwd ?? process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      // `detached: true` makes the child its own process-group leader. We then
      // signal the whole group on stop/restart (`killGroup` below) so children
      // forked by the `sh -c` wrapper (e.g. a JVM with retry-loop signal
      // handlers) actually receive SIGTERM/SIGKILL — fixes "Stop didn't kill
      // the process" for shell-wrapped commands.
      detached: true,
    });

    this._processes.set(svc.id, proc);

    const onData = (chunk: Buffer) => {
      machine.firstOutput();
      const text = chunk.toString();
      this._dataCallbacks.forEach(cb => cb(svc.id, text));
      this._healthCheckers.get(svc.id)?.feedLog(text);
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);

    if (svc.healthCheck) {
      const checker = new HealthChecker(svc.healthCheck, () => {
        machine.healthCheckPassed();
        this._healthCheckers.delete(svc.id);
      });
      this._healthCheckers.set(svc.id, checker);
    }

    const onExit = (code: number | null) => {
      this._processes.delete(svc.id);
      this._exitHandlers.delete(svc.id);
      machine.processExited(code ?? 1);
    };
    this._exitHandlers.set(svc.id, onExit);
    proc.on('exit', onExit);
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

/**
 * Send a signal to the process AND to its process group, so children forked by
 * the `sh -c` wrapper get the signal too. The direct `proc.kill` is kept
 * because the unit tests mock `proc.kill`; the `process.kill(-pid, ...)` call
 * is what actually solves the orphan-child problem in production.
 */
function killGroup(proc: import('child_process').ChildProcess, signal: NodeJS.Signals): void {
  proc.kill(signal);
  if (proc.pid && process.platform !== 'win32') {
    try {
      process.kill(-proc.pid, signal);
    } catch {
      // ESRCH: group already gone (process exited between the two kills).
    }
  }
}

