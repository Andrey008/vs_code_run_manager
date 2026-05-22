import * as fs from 'fs';
import * as path from 'path';
import type { ConfigProvenance } from './types';

/** A raw JetBrains configuration file located by the scanner. */
export interface RawConfigFile {
  /** Raw XML contents of the file. */
  xml: string;
  /** `shared` = .idea/runConfigurations/*.xml; `personal` = .idea/workspace.xml. */
  provenance: ConfigProvenance;
  /** Absolute path the XML was read from. */
  sourcePath: string;
}

/**
 * Locate JetBrains run-configuration sources in a workspace:
 * the shared `.idea/runConfigurations/*.xml` files and the personal
 * `.idea/workspace.xml`. Returns an empty list when there is no `.idea/`.
 */
export function scanJetBrainsConfigs(workspaceFolder: string): RawConfigFile[] {
  const ideaDir = path.join(workspaceFolder, '.idea');
  if (!isDirectory(ideaDir)) {
    return [];
  }

  const results: RawConfigFile[] = [];

  const runConfigsDir = path.join(ideaDir, 'runConfigurations');
  if (isDirectory(runConfigsDir)) {
    for (const entry of fs.readdirSync(runConfigsDir).sort()) {
      if (!entry.toLowerCase().endsWith('.xml')) {
        continue;
      }
      const sourcePath = path.join(runConfigsDir, entry);
      results.push({ xml: safeRead(sourcePath), provenance: 'shared', sourcePath });
    }
  }

  const workspaceXml = path.join(ideaDir, 'workspace.xml');
  if (isFile(workspaceXml)) {
    results.push({ xml: safeRead(workspaceXml), provenance: 'personal', sourcePath: workspaceXml });
  }

  return results.filter(r => r.xml.length > 0);
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function safeRead(p: string): string {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}
