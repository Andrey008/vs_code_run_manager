import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { scanJetBrainsConfigs } from './scanner';
import { parseRunConfigFile } from './parser';
import { mapConfig } from './mapper';
import { mergeImport } from './merge';
import type { ImportReport, JetBrainsRunConfig, MappedService } from './types';

let outputChannel: vscode.OutputChannel | undefined;

function channel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Run Manager: JetBrains Import');
  }
  return outputChannel;
}

/** Discover and map every JetBrains run configuration found in the workspace. */
export function discoverMappedServices(workspaceFolder: string): MappedService[] {
  const rawFiles = scanJetBrainsConfigs(workspaceFolder);
  const configs: JetBrainsRunConfig[] = rawFiles.flatMap(parseRunConfigFile);
  return configs.map(mapConfig);
}

/**
 * Command handler for `runManager.importFromJetBrains`.
 * Resolves the workspace folder, then runs the import pipeline.
 */
export async function importFromJetBrainsCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage(
      'Run Manager: open a folder to import JetBrains run configurations.',
    );
    return;
  }
  await runImport(folder.uri.fsPath);
}

/**
 * Run the full import: discover → preview → merge → report.
 * Returns true when an import was successfully written.
 */
export async function runImport(workspaceFolder: string): Promise<boolean> {
  const mapped = discoverMappedServices(workspaceFolder);
  if (mapped.length === 0) {
    vscode.window.showInformationMessage(
      'Run Manager: no JetBrains run configurations found in this workspace.',
    );
    return false;
  }

  const selected = await showPreview(mapped);
  if (!selected) {
    return false; // preview cancelled
  }

  ensureVscodeDir(workspaceFolder);
  const servicesJsonPath = path.join(workspaceFolder, '.vscode', 'services.json');
  const report = mergeImport(servicesJsonPath, selected);
  presentReport(report);
  return !report.aborted;
}

interface PreviewItem extends vscode.QuickPickItem {
  mapped: MappedService;
}

async function showPreview(mapped: MappedService[]): Promise<MappedService[] | undefined> {
  const items: PreviewItem[] = mapped.map(m => ({
    label: m.originName,
    description: badge(m),
    detail: m.notes.join(' ') || undefined,
    picked: m.confidence !== 'unmapped',
    mapped: m,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: 'Import JetBrains run configurations',
    placeHolder: 'Select the configurations to import into .vscode/services.json',
  });
  if (!picked) {
    return undefined;
  }
  // Unmapped entries cannot be written even if the user ticks them.
  return picked.map(item => item.mapped).filter(m => m.service !== null);
}

function badge(m: MappedService): string {
  switch (m.confidence) {
    case 'clean':
      return `✓ ${m.service?.type ?? ''}`;
    case 'needs-review':
      return '⚠ needs review';
    default:
      return '⊘ unsupported';
  }
}

function presentReport(report: ImportReport): void {
  const out = channel();
  out.clear();
  out.appendLine('Run Manager — JetBrains import report');
  out.appendLine('');
  for (const entry of report.entries) {
    out.appendLine(`[${entry.outcome}] ${entry.originName} — ${entry.detail}`);
  }

  if (report.aborted) {
    out.show(true);
    vscode.window.showErrorMessage(
      `Run Manager: import aborted. ${report.abortReason ?? ''}`.trim(),
    );
    return;
  }

  const { imported, needsReview, skipped } = report.counts;
  vscode.window.showInformationMessage(
    `Run Manager: imported ${imported}, needs review ${needsReview}, skipped ${skipped}. ` +
      'See the "Run Manager: JetBrains Import" output channel for details.',
  );
}

function ensureVscodeDir(workspaceFolder: string): void {
  const dir = path.join(workspaceFolder, '.vscode');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
