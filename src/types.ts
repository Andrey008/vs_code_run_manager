import type { ActiveLayout } from './layout/activeLayout';

export type { ActiveGroup, ActiveLayout } from './layout/activeLayout';

export type ServiceType = 'shell' | 'launch' | 'task' | 'docker-compose';
export type ServiceMode = 'run' | 'debug';
export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'ready' | 'crashed';

export interface HttpHealthCheck {
  type: 'http';
  url: string;
  readyWhen: number;
  timeout: number;
}

export interface LogPatternHealthCheck {
  type: 'log-pattern';
  pattern: string;
  timeout: number;
}

export type HealthCheck = HttpHealthCheck | LogPatternHealthCheck;

interface ServiceConfigBase {
  id: string;
  name: string;
  type: ServiceType;
  mode?: ServiceMode;
  envFile?: string;
  dependsOn?: string[];
  healthCheck?: HealthCheck;
}

export interface ShellServiceConfig extends ServiceConfigBase {
  type: 'shell';
  cmd: string;
  cwd?: string;
}

export interface LaunchServiceConfig extends ServiceConfigBase {
  type: 'launch';
  launchConfig: string;
}

export interface TaskServiceConfig extends ServiceConfigBase {
  type: 'task';
  taskName: string;
  /** VS Code task source ("Workspace" for tasks.json, "npm", "gulp", …). */
  taskSource?: string;
}

export interface DockerComposeServiceConfig extends ServiceConfigBase {
  type: 'docker-compose';
  file: string;
  service: string;
}

export type ServiceConfig =
  | ShellServiceConfig
  | LaunchServiceConfig
  | TaskServiceConfig
  | DockerComposeServiceConfig;

export interface ServiceGroup {
  name: string;
  services: ServiceConfig[];
}

export interface ServicesConfig {
  groups: ServiceGroup[];
}

export interface ServiceState {
  id: string;
  status: ServiceStatus;
}

export interface IRunner {
  start(service: ServiceConfig): Promise<void>;
  stop(service: ServiceConfig): Promise<void>;
  restart(service: ServiceConfig): Promise<void>;
  onStatusChange(callback: (id: string, status: ServiceStatus) => void): void;
  onData(callback: (id: string, chunk: string) => void): void;
  getStatuses(): Map<string, ServiceStatus>;
}

// Messages sent from extension → webview
export type ExtensionMessage =
  | { type: 'init'; services: ServiceConfig[]; groups: ServiceGroup[]; statuses: Record<string, ServiceStatus>; activeLayout: ActiveLayout }
  | { type: 'statusUpdate'; id: string; status: ServiceStatus }
  | { type: 'logs'; id: string; chunks: string[] }
  | { type: 'logsReplay'; id: string; lines: string[] }
  | { type: 'crashed'; id: string; exitCode: number };

// Messages sent from webview → extension
export type WebviewMessage =
  | { type: 'start'; id: string }
  | { type: 'stop'; id: string }
  | { type: 'restart'; id: string }
  | { type: 'startGroup'; groupName: string }
  | { type: 'startServices'; ids: string[] }
  | { type: 'toggleMode'; id: string; mode: ServiceMode }
  | { type: 'saveLayout'; layout: ActiveLayout }
  | { type: 'requestLogs'; id: string }
  | { type: 'showTerminal'; id: string }
  | { type: 'ready' };
