import * as vscode from 'vscode';
import { ServiceStateMachine } from '../state/serviceStateMachine';
import type { IRunner, ServiceConfig, ServiceStatus, TaskServiceConfig } from '../types';

type StatusCallback = (id: string, status: ServiceStatus) => void;
type DataCallback = (id: string, chunk: string) => void;

interface ExecutionEntry {
  execution: vscode.TaskExecution;
  serviceId: string;
}

export class TaskRunner implements IRunner {
  private readonly _machines = new Map<string, ServiceStateMachine>();
  private readonly _configs = new Map<string, TaskServiceConfig>();
  private readonly _executions = new Map<string, ExecutionEntry>(); // serviceId → entry
  private readonly _statusCallbacks: StatusCallback[] = [];
  private readonly _dataCallbacks: DataCallback[] = [];
  private readonly _disposables: vscode.Disposable[] = [];

  constructor() {
    this._disposables.push(
      vscode.tasks.onDidStartTaskProcess(e => this._onTaskStart(e as vscode.TaskProcessStartEvent)),
      vscode.tasks.onDidEndTaskProcess(e => this._onTaskEnd(e as vscode.TaskProcessEndEvent))
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
    if (service.type !== 'task') return;
    const svc = service as TaskServiceConfig;
    const machine = this._getOrCreateMachine(svc.id);
    if (machine.status !== 'stopped') return;

    const allTasks = await vscode.tasks.fetchTasks();
    // Match on source too — npm and tasks.json can both define a "build" task.
    const task = allTasks.find(
      t => t.name === svc.taskName && (svc.taskSource === undefined || t.source === svc.taskSource)
    );
    if (!task) {
      vscode.window.showErrorMessage(
        `Run Manager: task "${svc.taskName}" not found in tasks.json`
      );
      return;
    }

    this._configs.set(svc.id, svc);
    machine.start();
    const execution = await vscode.tasks.executeTask(task);
    this._executions.set(svc.id, { execution, serviceId: svc.id });
  }

  async stop(service: ServiceConfig): Promise<void> {
    const machine = this._machines.get(service.id);
    if (!machine || machine.status === 'stopped') return;

    const entry = this._executions.get(service.id);
    if (entry) {
      entry.execution.terminate();
      this._executions.delete(service.id);
    }
    machine.stop();
  }

  showTerminal(id: string): void {
    const config = this._configs.get(id);
    if (!config) return;
    const terminal = vscode.window.terminals.find(t => t.name === config.taskName);
    terminal?.show();
  }

  async restart(service: ServiceConfig): Promise<void> {
    await this.stop(service);
    await this.start(service);
  }

  dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this._disposables.length = 0;
  }

  private _onTaskStart(event: vscode.TaskProcessStartEvent): void {
    for (const [serviceId, entry] of this._executions) {
      if (entry.execution === event.execution) {
        const machine = this._machines.get(serviceId);
        machine?.firstOutput();
        return;
      }
    }
  }

  private _onTaskEnd(event: vscode.TaskProcessEndEvent): void {
    for (const [serviceId, entry] of this._executions) {
      if (entry.execution === event.execution) {
        this._executions.delete(serviceId);
        const machine = this._machines.get(serviceId);
        machine?.processExited(event.exitCode ?? 1);
        return;
      }
    }
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
