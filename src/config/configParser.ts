import * as fs from 'fs';
import * as path from 'path';
import type { ServiceConfig, ServiceGroup, ServicesConfig, ServiceType, LaunchServiceConfig } from '../types';

const VALID_TYPES: ServiceType[] = ['shell', 'launch', 'task', 'docker-compose'];

export function resolveWorkspaceVars(value: string, workspaceFolder: string): string {
  return value.replace(/\$\{workspaceFolder\}/g, workspaceFolder);
}

function stripJsoncComments(raw: string): string {
  let result = '';
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '"') {
      // consume the entire JSON string literal without touching it
      result += raw[i++];
      while (i < raw.length) {
        if (raw[i] === '\\') {
          result += raw[i++];
          if (i < raw.length) result += raw[i++];
        } else if (raw[i] === '"') {
          result += raw[i++];
          break;
        } else {
          result += raw[i++];
        }
      }
    } else if (raw[i] === '/' && raw[i + 1] === '/') {
      while (i < raw.length && raw[i] !== '\n') i++;
    } else if (raw[i] === '/' && raw[i + 1] === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += raw[i++];
    }
  }
  return result;
}

function resolveVarsInObject(obj: unknown, workspaceFolder: string): unknown {
  if (typeof obj === 'string') {
    return resolveWorkspaceVars(obj, workspaceFolder);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => resolveVarsInObject(item, workspaceFolder));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = resolveVarsInObject(value, workspaceFolder);
    }
    return result;
  }
  return obj;
}

function validateService(raw: Record<string, unknown>, groupName: string): ServiceConfig {
  if (!raw['id'] || typeof raw['id'] !== 'string') {
    throw new Error(
      `Service in group "${groupName}" is missing required field "id"`
    );
  }
  if (!raw['name'] || typeof raw['name'] !== 'string') {
    throw new Error(
      `Service "${raw['id']}" in group "${groupName}" is missing required field "name"`
    );
  }
  if (!raw['type'] || typeof raw['type'] !== 'string') {
    throw new Error(
      `Service "${raw['id']}" in group "${groupName}" is missing required field "type"`
    );
  }
  if (!VALID_TYPES.includes(raw['type'] as ServiceType)) {
    throw new Error(
      `Service "${raw['id']}" has invalid type "${raw['type']}". Valid types: ${VALID_TYPES.join(', ')}`
    );
  }

  return {
    mode: 'run',
    ...raw,
  } as ServiceConfig;
}

function validateGroup(raw: Record<string, unknown>): ServiceGroup {
  const name = typeof raw['name'] === 'string' ? raw['name'] : 'Unnamed';
  const rawServices = Array.isArray(raw['services']) ? raw['services'] : [];

  const services = rawServices.map((s: unknown) =>
    validateService(s as Record<string, unknown>, name)
  );

  return { name, services };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function readJsoncFile(filePath: string): unknown {
  try {
    return JSON.parse(stripJsoncComments(fs.readFileSync(filePath, 'utf-8')));
  } catch { return null; }
}

/**
 * Builds the service config from files:
 * - Explicit entries from .vscode/services.json (optional, for docker-compose/shell/dependsOn/healthCheck)
 * - Auto-discovered launch configs from .vscode/launch.json
 *
 * Tasks are NOT discovered here — they come from the VS Code task API (see
 * taskDiscovery.ts) so that auto-detected tasks (npm scripts, gulp, …) are
 * included, not just the ones written into tasks.json.
 *
 * Explicit entries always take precedence — if a launch config is already
 * referenced in services.json, it won't be duplicated in the auto-discovered group.
 */
export function buildConfig(workspaceFolder: string): ServicesConfig {
  const configDir = path.join(workspaceFolder, '.vscode');

  let explicitConfig: ServicesConfig = { groups: [] };
  const servicesPath = path.join(configDir, 'services.json');
  try {
    explicitConfig = parseServicesConfig(fs.readFileSync(servicesPath, 'utf-8'), workspaceFolder);
  } catch { /* services.json is optional */ }

  const allExplicit = explicitConfig.groups.flatMap(g => g.services);
  const explicitLaunchNames = new Set(
    allExplicit.filter(s => s.type === 'launch').map(s => (s as LaunchServiceConfig).launchConfig)
  );

  const launchJson = readJsoncFile(path.join(configDir, 'launch.json')) as { configurations?: { name: string }[] } | null;
  const newLaunch: LaunchServiceConfig[] = (launchJson?.configurations ?? [])
    .filter(c => c.name && !explicitLaunchNames.has(c.name))
    .map(c => ({ id: slugify(c.name), name: c.name, type: 'launch' as const, launchConfig: c.name }));

  const groups = [...explicitConfig.groups];
  const takenNames = new Set(explicitConfig.groups.map(g => g.name));
  if (newLaunch.length > 0) {
    groups.push({ name: takenNames.has('Services') ? 'Launch Configs' : 'Services', services: newLaunch });
  }

  return { groups };
}

export function parseServicesConfig(raw: string, workspaceFolder: string): ServicesConfig {
  const stripped = stripJsoncComments(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(`Failed to parse services.json: ${(err as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || !('groups' in parsed)) {
    throw new Error('services.json must have a top-level "groups" array');
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj['groups'])) {
    throw new Error('services.json must have a top-level "groups" array');
  }

  const resolved = resolveVarsInObject(parsed, workspaceFolder) as Record<string, unknown>;
  const groups = (resolved['groups'] as Record<string, unknown>[]).map(validateGroup);

  return { groups };
}
