import type { WebviewMessage } from '../types';

/** All messages dispatched via `postMessage` during a test. */
export const postedMessages: WebviewMessage[] = [];

/** Replacement for the real `postMessage` — captures the message for assertions. */
export function postMessage(msg: WebviewMessage): void {
  postedMessages.push(msg);
}

/** Reset between tests. Call from `beforeEach` in webview component tests. */
export function resetPostedMessages(): void {
  postedMessages.length = 0;
}
