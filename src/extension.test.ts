import * as vscode from 'vscode';
import { activate, deactivate } from './extension';

function makeContext() {
  return {
    subscriptions: [] as { dispose(): void }[],
    extensionUri: { fsPath: '/ext' },
    workspaceState: { get: jest.fn(), update: jest.fn() },
  };
}

describe('extension', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers the webview provider and the openPanel command', () => {
    const context = makeContext();
    activate(context as unknown as vscode.ExtensionContext);

    expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
      'runManager.panel',
      expect.anything(),
      expect.anything()
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'runManager.openPanel',
      expect.any(Function)
    );
  });

  it('populates context.subscriptions with disposables', () => {
    const context = makeContext();
    activate(context as unknown as vscode.ExtensionContext);
    expect(context.subscriptions.length).toBeGreaterThan(0);
    for (const sub of context.subscriptions) {
      expect(typeof sub.dispose).toBe('function');
    }
  });

  it('openPanel command focuses the Run Manager view container', () => {
    const context = makeContext();
    activate(context as unknown as vscode.ExtensionContext);

    const registerCmd = vscode.commands.registerCommand as jest.Mock;
    const call = registerCmd.mock.calls.find(c => c[0] === 'runManager.openPanel');
    expect(call).toBeDefined();
    call![1]();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.view.extension.run-manager'
    );
  });

  it('deactivate does not throw', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
