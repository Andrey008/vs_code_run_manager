import * as vscode from 'vscode';
import { discoverMappedServices, runImport } from './importCommand';

const DONE_KEY = 'jetbrainsImport.done';
const DISMISSED_KEY = 'jetbrainsImport.dismissed';

/**
 * Pure gate: should the activation prompt be shown?
 * The prompt appears only when configurations were discovered and the developer
 * has neither completed nor permanently dismissed the import for this workspace.
 */
export function shouldOfferImport(state: {
  hasConfigs: boolean;
  done: boolean;
  dismissed: boolean;
}): boolean {
  return state.hasConfigs && !state.done && !state.dismissed;
}

/**
 * On activation, offer to import JetBrains run configurations when appropriate.
 * Reuses the same pipeline as the manual command.
 */
export async function maybeOfferImport(
  context: vscode.ExtensionContext,
  workspaceFolder: string,
): Promise<void> {
  const configCount = discoverMappedServices(workspaceFolder).length;
  const offer = shouldOfferImport({
    hasConfigs: configCount > 0,
    done: context.workspaceState.get<boolean>(DONE_KEY) === true,
    dismissed: context.workspaceState.get<boolean>(DISMISSED_KEY) === true,
  });
  if (!offer) {
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `Run Manager found ${configCount} JetBrains run configuration${configCount === 1 ? '' : 's'}. Import them?`,
    'Import',
    'Not now',
    'Never',
  );

  if (choice === 'Import') {
    const written = await runImport(workspaceFolder);
    if (written) {
      await context.workspaceState.update(DONE_KEY, true);
    }
  } else if (choice === 'Never') {
    await context.workspaceState.update(DISMISSED_KEY, true);
  }
  // "Not now" (or dismissed): nothing stored — the prompt re-appears next activation.
}
