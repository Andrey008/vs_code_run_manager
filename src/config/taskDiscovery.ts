import * as vscode from 'vscode';
import type { ServiceGroup, TaskServiceConfig } from '../types';

/**
 * Task discovery via the VS Code API.
 *
 * Unlike the file-based parsing in configParser, this picks up *every* task
 * VS Code knows about — both `.vscode/tasks.json` entries and the ones it
 * auto-detects (npm scripts, gulp, grunt, …) — and groups them by source.
 */

/** A VS Code task reduced to what discovery needs. */
export interface RawTask {
  name: string;
  source: string;
}

/** VS Code reports tasks.json-defined tasks under this source; we relabel it. */
const WORKSPACE_SOURCE = 'Workspace';
const WORKSPACE_GROUP = 'Tasks';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Groups raw tasks into ServiceGroups by their source ("Workspace" → "Tasks",
 * plus "npm", "gulp", …). Tasks already referenced explicitly in services.json
 * are skipped so they are not listed twice. The "Tasks" group sorts first, the
 * rest alphabetically.
 */
export function groupTasks(
  rawTasks: RawTask[],
  explicitTaskNames: ReadonlySet<string>
): ServiceGroup[] {
  const byGroup = new Map<string, TaskServiceConfig[]>();
  const seenIds = new Set<string>();

  for (const t of rawTasks) {
    if (!t.name || explicitTaskNames.has(t.name)) continue;

    const source = t.source || WORKSPACE_SOURCE;
    const groupName = source === WORKSPACE_SOURCE ? WORKSPACE_GROUP : source;
    const id = `task:${slug(source)}:${slug(t.name)}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const svc: TaskServiceConfig = {
      id,
      name: t.name,
      type: 'task',
      taskName: t.name,
      taskSource: source,
    };
    const list = byGroup.get(groupName);
    if (list) list.push(svc);
    else byGroup.set(groupName, [svc]);
  }

  return [...byGroup.entries()]
    .map(([name, services]) => ({ name, services }))
    .sort((a, b) => {
      if (a.name === WORKSPACE_GROUP) return -1;
      if (b.name === WORKSPACE_GROUP) return 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Fetches all VS Code tasks and groups them by source. Returns an empty list
 * if the task API is unavailable.
 */
export async function discoverTasks(
  explicitTaskNames: ReadonlySet<string>
): Promise<ServiceGroup[]> {
  let tasks: vscode.Task[];
  try {
    tasks = await vscode.tasks.fetchTasks();
  } catch {
    return [];
  }
  return groupTasks(
    tasks.map(t => ({ name: t.name, source: t.source })),
    explicitTaskNames
  );
}
