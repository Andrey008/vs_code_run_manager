import type { ActiveLayout } from '../../src/layout/activeLayout';

export type { ActiveGroup, ActiveLayout } from '../../src/layout/activeLayout';

export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'ready' | 'crashed';
export type ServiceMode = 'run' | 'debug';
export type ServiceType = 'shell' | 'launch' | 'task' | 'docker-compose';

export interface ServiceConfig {
  id: string;
  name: string;
  type: ServiceType;
  mode?: ServiceMode;
  dependsOn?: string[];
  healthCheck?: unknown;
}

export interface ServiceGroup {
  name: string;
  services: ServiceConfig[];
}

export interface ServiceState {
  id: string;
  status: ServiceStatus;
}

export type ExtensionMessage =
  | { type: 'init'; services: ServiceConfig[]; groups: ServiceGroup[]; statuses: Record<string, ServiceStatus>; activeLayout: ActiveLayout }
  | { type: 'statusUpdate'; id: string; status: ServiceStatus }
  | { type: 'logs'; id: string; chunks: string[] }
  | { type: 'logsReplay'; id: string; lines: string[] }
  | { type: 'crashed'; id: string; exitCode: number };

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

declare global {
  interface Window {
    initialData?: {
      groups: ServiceGroup[];
      nonce: string;
    };
  }
}
