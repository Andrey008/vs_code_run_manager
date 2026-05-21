import type { WebviewMessage } from './types';

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const api = acquireVsCodeApi();

export function postMessage(msg: WebviewMessage): void {
  api.postMessage(msg);
}
