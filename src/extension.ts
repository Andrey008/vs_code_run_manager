import * as vscode from 'vscode';
import { RunManagerPanel } from './panel/RunManagerPanel';
import { ShellRunner } from './runners/ShellRunner';
import { LaunchRunner } from './runners/LaunchRunner';
import { TaskRunner } from './runners/TaskRunner';
import { DockerRunner } from './runners/DockerRunner';
import { LogManager } from './managers/LogManager';
import { importFromJetBrainsCommand } from './jetbrains-import/importCommand';

export function activate(context: vscode.ExtensionContext): void {
  const shellRunner = new ShellRunner();
  const launchRunner = new LaunchRunner();
  const taskRunner = new TaskRunner();
  const dockerRunner = new DockerRunner();
  const logManager = new LogManager();

  context.subscriptions.push(
    RunManagerPanel.register(
      context,
      { shellRunner, launchRunner, taskRunner, dockerRunner },
      logManager
    ),
    vscode.commands.registerCommand('runManager.openPanel', () => {
      vscode.commands.executeCommand('workbench.view.extension.run-manager');
    }),
    vscode.commands.registerCommand('runManager.importFromJetBrains', () =>
      importFromJetBrainsCommand(),
    ),
    { dispose: () => logManager.dispose() },
    { dispose: () => launchRunner.dispose() },
    { dispose: () => taskRunner.dispose() },
    { dispose: () => dockerRunner.dispose() },
  );
}

export function deactivate(): void {}
