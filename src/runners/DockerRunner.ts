import { spawn, ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import { ServiceStateMachine } from '../state/serviceStateMachine';
import { HealthChecker } from '../health/HealthChecker';
import type { IRunner, ServiceConfig, ServiceStatus, DockerComposeServiceConfig } from '../types';

type StatusCallback = (id: string, status: ServiceStatus) => void;
type DataCallback = (id: string, chunk: string) => void;

export interface ContainerState {
  state: string;
  exitCode: number;
}

export class DockerRunner implements IRunner {
  private readonly _machines = new Map<string, ServiceStateMachine>();
  private readonly _configs = new Map<string, DockerComposeServiceConfig>();
  private readonly _logProcs = new Map<string, ChildProcess>();
  private readonly _healthCheckers = new Map<string, HealthChecker>();
  private readonly _statusCallbacks: StatusCallback[] = [];
  private readonly _dataCallbacks: DataCallback[] = [];
  private readonly _stopping = new Set<string>();
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _polling = false;

  constructor(pollIntervalMs = 3000) {
    this._pollTimer = setInterval(() => this.poll(), pollIntervalMs);
    // The poller must not keep the process alive on its own — the extension
    // host owns the process lifetime in production; dispose() clears it.
    this._pollTimer.unref?.();
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
    if (service.type !== 'docker-compose') return;
    const svc = service as DockerComposeServiceConfig;
    const machine = this._getOrCreateMachine(svc.id);
    if (machine.status !== 'stopped') return;

    this._configs.set(svc.id, svc);
    machine.start();

    try {
      await this._runCommand(['compose', '-f', svc.file, 'up', '-d', svc.service]);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('ENOENT')) {
        vscode.window.showErrorMessage('Run Manager: Docker is not installed or not in PATH');
      } else {
        vscode.window.showErrorMessage(`Run Manager: failed to start ${svc.name} — ${msg}`);
      }
      machine.processExited(1);
      return;
    }

    this._startLogStream(svc, machine);
  }

  async stop(service: ServiceConfig): Promise<void> {
    if (service.type !== 'docker-compose') return;
    const svc = service as DockerComposeServiceConfig;
    const machine = this._machines.get(svc.id);
    if (!machine || machine.status === 'stopped') return;

    this._stopping.add(svc.id);
    this._stopLogStream(svc.id);
    this._healthCheckers.get(svc.id)?.dispose();
    this._healthCheckers.delete(svc.id);
    machine.stop();

    await this._runCommand(['compose', '-f', svc.file, 'stop', svc.service]).catch(() => {});
    this._stopping.delete(svc.id);
  }

  async restart(service: ServiceConfig): Promise<void> {
    await this.stop(service);
    await this.start(service);
  }

  dispose(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    for (const proc of this._logProcs.values()) {
      proc.kill('SIGTERM');
    }
    this._logProcs.clear();
    for (const checker of this._healthCheckers.values()) checker.dispose();
    this._healthCheckers.clear();
  }

  async syncWithRunning(services: DockerComposeServiceConfig[]): Promise<void> {
    // Register all services so poll() can track them regardless of current state
    for (const svc of services) {
      this._configs.set(svc.id, svc);
      this._getOrCreateMachine(svc.id);
    }

    const byFile = new Map<string, DockerComposeServiceConfig[]>();
    for (const svc of services) {
      if (!byFile.has(svc.file)) byFile.set(svc.file, []);
      byFile.get(svc.file)!.push(svc);
    }

    for (const [file, svcs] of byFile) {
      let output: string;
      try {
        output = await this._runCommandOutput(['compose', '-f', file, 'ps', '--all', '--format', 'json']);
      } catch {
        continue;
      }

      const states = this.parsePs(output);
      for (const svc of svcs) {
        const containerState = states.get(svc.service);
        if (containerState?.state === 'running') {
          const machine = this._machines.get(svc.id)!;
          if (machine.status === 'stopped') {
            machine.start();
            machine.firstOutput();
            this._startLogStream(svc, machine);
          }
        }
      }
    }
  }

  /** Public for unit-testing the parse logic. */
  parsePs(output: string): Map<string, ContainerState> {
    const result = new Map<string, ContainerState>();
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as {
          Service?: string;
          Name?: string;
          State: string;
          ExitCode?: number;
        };
        const name = obj.Service ?? obj.Name ?? '';
        if (name) result.set(name, { state: obj.State, exitCode: obj.ExitCode ?? 0 });
      } catch {
        // skip malformed lines
      }
    }
    return result;
  }

  async poll(): Promise<void> {
    if (this._polling) return;
    this._polling = true;
    try {
      const byFile = new Map<string, string[]>();
      for (const [id, config] of this._configs) {
        if (!byFile.has(config.file)) byFile.set(config.file, []);
        byFile.get(config.file)!.push(id);
      }
      for (const [file, ids] of byFile) {
        await this._pollFile(file, ids);
      }
    } finally {
      this._polling = false;
    }
  }

  private async _pollFile(file: string, serviceIds: string[]): Promise<void> {
    let output: string;
    try {
      output = await this._runCommandOutput(['compose', '-f', file, 'ps', '--all', '--format', 'json']);
    } catch {
      return;
    }

    const states = this.parsePs(output);
    for (const id of serviceIds) {
      const config = this._configs.get(id);
      const machine = this._machines.get(id);
      if (!config || !machine) continue;

      const containerState = states.get(config.service);
      if (!containerState) continue;

      if (containerState.state === 'running') {
        if (machine.status === 'stopped' || machine.status === 'crashed') {
          if (!this._stopping.has(id)) {
            machine.start();
            machine.firstOutput();
            this._startLogStream(config, machine);
          }
        } else {
          machine.firstOutput();
        }
      } else if (containerState.state === 'exited') {
        if (machine.status !== 'stopped' && machine.status !== 'crashed') {
          this._stopLogStream(config.id);
          machine.processExited(containerState.exitCode);
        }
      }
    }
  }

  private _startLogStream(svc: DockerComposeServiceConfig, machine: ServiceStateMachine): void {
    const proc = spawn(
      'docker',
      ['compose', '-f', svc.file, 'logs', '-f', '--no-color', svc.service],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    this._logProcs.set(svc.id, proc);

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

    proc.on('exit', () => this._logProcs.delete(svc.id));
  }

  private _stopLogStream(id: string): void {
    const proc = this._logProcs.get(id);
    if (proc) {
      proc.kill('SIGTERM');
      this._logProcs.delete(id);
    }
  }

  private _runCommand(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      proc.on('error', reject);
      proc.on('exit', code => {
        if (code === 0) resolve();
        else reject(new Error(`docker ${args.join(' ')} exited with code ${code}`));
      });
    });
  }

  private _runCommandOutput(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      proc.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      proc.on('error', reject);
      proc.on('exit', code => {
        if (code === 0) resolve(output);
        else reject(new Error(`docker ${args.join(' ')} exited with code ${code}`));
      });
    });
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
