import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { RawConfigFile } from './scanner';
import type { ConfigProvenance, JetBrainsRunConfig } from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  ignoreDeclaration: true,
  parseAttributeValue: false,
  parseTagValue: false,
});

/** Option keys, in priority order, that hold a configuration's working directory. */
const WORKING_DIR_KEYS = [
  'SCRIPT_WORKING_DIRECTORY',
  'WORKING_DIRECTORY',
  'working-dir',
  'workingDirPath',
  'externalProjectPath',
];

/** Components in `.idea` XML files that contain run configurations. */
const RUN_CONFIG_COMPONENTS = ['ProjectRunConfigurationManager', 'RunManager'];

/**
 * Parse one raw JetBrains XML file into normalized run configurations.
 * A `runConfigurations/*.xml` file yields one; `workspace.xml` may yield many.
 * Malformed XML yields an empty list (the caller skips and reports it).
 */
export function parseRunConfigFile(raw: RawConfigFile): JetBrainsRunConfig[] {
  if (XMLValidator.validate(raw.xml) !== true) {
    return [];
  }

  let tree: Record<string, unknown>;
  try {
    tree = parser.parse(raw.xml);
  } catch {
    return [];
  }

  const configs: JetBrainsRunConfig[] = [];
  for (const component of findRunConfigComponents(tree)) {
    for (const node of asArray((component as Record<string, unknown>)['configuration'])) {
      const parsed = parseConfiguration(node, raw.provenance);
      if (parsed) {
        configs.push(parsed);
      }
    }
  }
  return configs;
}

function findRunConfigComponents(tree: Record<string, unknown>): unknown[] {
  const project = tree['project'] as Record<string, unknown> | undefined;
  const candidates = [...asArray(tree['component']), ...asArray(project?.['component'])];
  return candidates.filter(
    c => isObject(c) && RUN_CONFIG_COMPONENTS.includes(String(c['@_name'])),
  );
}

function parseConfiguration(
  node: unknown,
  provenance: ConfigProvenance,
): JetBrainsRunConfig | null {
  if (!isObject(node)) {
    return null;
  }
  if (String(node['@_default']) === 'true') {
    return null;
  }
  const name = node['@_name'];
  const type = node['@_type'];
  if (!name || !type) {
    return null;
  }

  const options: Record<string, string> = {};

  // The configuration element's own attributes (some types carry settings there).
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@_')) {
      const attr = key.slice(2);
      if (!['name', 'type', 'default', 'factoryName'].includes(attr)) {
        options[attr] = String(value);
      }
    }
  }

  const envVars: Record<string, string> = {};
  for (const envs of asArray(node['envs'])) {
    for (const env of asArray(isObject(envs) ? envs['env'] : undefined)) {
      if (isObject(env) && env['@_name'] !== undefined) {
        envVars[String(env['@_name'])] = String(env['@_value'] ?? '');
      }
    }
  }

  flatten(node, options);

  const workingDir = WORKING_DIR_KEYS.map(k => options[k]).find(v => v !== undefined);
  return {
    name: String(name),
    type: String(type),
    provenance,
    options,
    envVars,
    workingDir,
    envFile: options['envFile'] || undefined,
  };
}

/** Recursively collect `<option name=value>` settings into a flat map. */
function flatten(node: Record<string, unknown>, options: Record<string, string>): void {
  for (const [key, raw] of Object.entries(node)) {
    if (key.startsWith('@_') || key === 'envs' || key === 'method') {
      continue;
    }
    for (const value of asArray(raw)) {
      if (!isObject(value)) {
        continue;
      }
      if (key === 'option') {
        const optName = value['@_name'];
        if (optName !== undefined) {
          if (value['@_value'] !== undefined) {
            options[String(optName)] = String(value['@_value']);
          } else {
            const listValues = collectListValues(value['list']);
            if (listValues.length > 0) {
              options[String(optName)] = listValues.join(',');
            }
            flatten(value, options);
          }
        } else {
          flatten(value, options);
        }
      } else {
        if (value['@_value'] !== undefined) {
          options[key] = String(value['@_value']);
        }
        flatten(value, options);
      }
    }
  }
}

/** Gather every `<option value=...>` found under a `<list>` element. */
function collectListValues(listNode: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (!isObject(node)) {
      return;
    }
    for (const [key, raw] of Object.entries(node)) {
      for (const value of asArray(raw)) {
        if (key === 'option' && isObject(value) && value['@_value'] !== undefined) {
          out.push(String(value['@_value']));
        } else if (isObject(value)) {
          walk(value);
        }
      }
    }
  };
  walk(listNode);
  return out;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
