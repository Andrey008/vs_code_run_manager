import type { ServiceStatus } from '../types';

type StatusListener = (status: ServiceStatus) => void;

export class ServiceStateMachine {
  private _status: ServiceStatus = 'stopped';
  private _listeners: StatusListener[] = [];

  constructor(public readonly serviceId: string) {}

  get status(): ServiceStatus {
    return this._status;
  }

  onStatusChange(listener: StatusListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  private _set(status: ServiceStatus): void {
    this._status = status;
    this._listeners.forEach(l => l(status));
  }

  start(): void {
    if (this._status !== 'stopped') return;
    this._set('starting');
  }

  stop(): void {
    if (this._status === 'stopped') return;
    this._set('stopped');
  }

  restart(): void {
    if (this._status === 'stopped') return;
    this._set('stopped');
    this._set('starting');
  }

  firstOutput(): void {
    if (this._status !== 'starting') return;
    this._set('running');
  }

  healthCheckPassed(): void {
    if (this._status !== 'running' && this._status !== 'starting') return;
    this._set('ready');
  }

  processExited(code: number): void {
    if (this._status === 'stopped') return;
    if (code === 0) {
      this._set('stopped');
    } else {
      this._set('crashed');
    }
  }
}
