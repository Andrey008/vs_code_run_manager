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
  const done = context.workspaceState.get<boolean>(DONE_KEY) === true;
  const dismissed = context.workspaceState.get<boolean>(DISMISSED_KEY) === true;
  if (done || dismissed) {
    return; // settled for this workspace — skip the filesystem scan entirely
  }

  const mapped = discoverMappedServices(workspaceFolder);
  if (!shouldOfferImport({ hasConfigs: mapped.length > 0, done, dismissed })) {
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `Run Manager found ${mapped.length} JetBrains run configuration${mapped.length === 1 ? '' : 's'}. Import them?`,
    'Import',
    'Not now',
    'Never',
  );

  if (choice === 'Import') {
    const written = await runImport(workspaceFolder, mapped);
    if (written) {
      await context.workspaceState.update(DONE_KEY, true);
    }
  } else if (choice === 'Never') {
    await context.workspaceState.update(DISMISSED_KEY, true);
  }
  // "Not now" (or dismissed): nothing stored — the prompt re-appears next activation.
}
