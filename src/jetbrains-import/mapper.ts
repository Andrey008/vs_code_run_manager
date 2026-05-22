import type { JetBrainsRunConfig, MappedService, MappingConfidence } from './types';
import type {
  ServiceConfig,
  ShellServiceConfig,
  DockerComposeServiceConfig,
} from '../types';

interface BuildResult {
  service: ServiceConfig | null;
  confidence: MappingConfidence;
  notes: string[];
}

type Builder = (config: JetBrainsRunConfig, id: string, originId: string) => BuildResult;

/**
 * Map one normalized JetBrains run configuration to a Run Manager service.
 * Unknown types are reported as `unmapped` with a null service.
 */
export function mapConfig(config: JetBrainsRunConfig): MappedService {
  const originId = slugify(`${config.name}-${config.type}`);
  const id = slugify(config.name) || originId;
  const builder = BUILDERS[config.type];

  if (!builder) {
    return {
      originId,
      originName: config.name,
      confidence: 'unmapped',
      service: null,
      notes: [`Unsupported JetBrains configuration type "${config.type}".`],
    };
  }

  const result = builder(config, id, originId);
  if (result.service) {
    applyEnv(config, result.service, result.notes);
  }
  return {
    originId,
    originName: config.name,
    confidence: result.confidence,
    service: result.service,
    notes: result.notes,
  };
}

function applyEnv(config: JetBrainsRunConfig, service: ServiceConfig, notes: string[]): void {
  if (config.envFile) {
    service.envFile = resolveVars(config.envFile);
  }
  const inlineVars = Object.keys(config.envVars);
  if (inlineVars.length > 0) {
    notes.push(
      `Inline environment variables (${inlineVars.join(', ')}) were not applied — set them via an env file.`,
    );
  }
}

const shBuilder: Builder = (config, id, originId) => {
  const o = config.options;
  const cmd = join([
    resolveVars(o['INTERPRETER_PATH'] ?? ''),
    resolveVars(o['SCRIPT_PATH'] ?? ''),
    o['SCRIPT_OPTIONS'] ?? '',
  ]);
  return {
    service: shell(id, config.name, originId, cmd, cwd(o['SCRIPT_WORKING_DIRECTORY'])),
    confidence: 'clean',
    notes: [],
  };
};

const npmBuilder: Builder = (config, id, originId) => {
  const o = config.options;
  const cmd = join(['npm', o['command'] ?? 'run', o['script'] ?? '']);
  const workdir = dirOf(resolveVars(o['package-json'] ?? '')) || '${workspaceFolder}';
  return {
    service: shell(id, config.name, originId, cmd, workdir),
    confidence: 'clean',
    notes: [],
  };
};

const nodeBuilder: Builder = (config, id, originId) => {
  const o = config.options;
  const cmd = join([
    'node',
    o['node-parameters'] ?? '',
    resolveVars(o['path-to-js-file'] ?? ''),
    o['application-parameters'] ?? '',
  ]);
  return {
    service: shell(id, config.name, originId, cmd, cwd(o['working-dir'])),
    confidence: 'clean',
    notes: [],
  };
};

const gradleBuilder: Builder = (config, id, originId) => {
  const o = config.options;
  const tasks = splitList(o['taskNames']);
  return {
    service: shell(id, config.name, originId, join(['./gradlew', ...tasks]), cwd(o['externalProjectPath'])),
    confidence: 'clean',
    notes: [],
  };
};

const mavenBuilder: Builder = (config, id, originId) => {
  const o = config.options;
  const goals = splitList(o['goals']);
  return {
    service: shell(id, config.name, originId, join(['mvn', ...goals]), cwd(o['workingDirPath'])),
    confidence: 'clean',
    notes: [],
  };
};

const dockerBuilder: Builder = (config, id, originId) => {
  const o = config.options;
  if (o['sourceFilePath']) {
    const service: DockerComposeServiceConfig = {
      id,
      name: config.name,
      type: 'docker-compose',
      file: workspaceRelative(resolveVars(o['sourceFilePath'])),
      service: splitList(o['servicesNames'])[0] ?? '',
      source: 'jetbrains',
      originId,
    };
    return { service, confidence: 'clean', notes: [] };
  }
  return {
    service: shell(id, config.name, originId, 'docker', '${workspaceFolder}'),
    confidence: 'needs-review',
    notes: ['Non-Compose Docker configuration — verify the generated command.'],
  };
};

const jvmBuilder: Builder = (config, id, originId) => {
  const o = config.options;
  const cmd = join([
    'java',
    o['VM_PARAMETERS'] ?? '',
    o['MAIN_CLASS_NAME'] ?? '',
    o['PROGRAM_PARAMETERS'] ?? '',
  ]);
  return {
    service: shell(id, config.name, originId, cmd, cwd(o['WORKING_DIRECTORY'])),
    confidence: 'needs-review',
    notes: [
      'The classpath could not be reconstructed from the JetBrains project model — verify the java command.',
    ],
  };
};

const BUILDERS: Record<string, Builder> = {
  ShConfigurationType: shBuilder,
  'js.build_tools.npm': npmBuilder,
  NodeJSConfigurationType: nodeBuilder,
  GradleRunConfiguration: gradleBuilder,
  MavenRunConfiguration: mavenBuilder,
  'docker-deploy': dockerBuilder,
  Application: jvmBuilder,
  SpringBootApplicationConfigurationType: jvmBuilder,
};

function shell(
  id: string,
  name: string,
  originId: string,
  cmd: string,
  cwdValue: string,
): ShellServiceConfig {
  return { id, name, type: 'shell', cmd, cwd: cwdValue, source: 'jetbrains', originId };
}

function resolveVars(value: string): string {
  return value
    .replace(/\$PROJECT_DIR\$/g, '${workspaceFolder}')
    .replace(/\$MODULE_DIR\$/g, '${workspaceFolder}');
}

function cwd(value: string | undefined): string {
  return resolveVars(value ?? '').trim() || '${workspaceFolder}';
}

function join(parts: string[]): string {
  return parts.map(p => p.trim()).filter(Boolean).join(' ');
}

function splitList(value: string | undefined): string[] {
  return (value ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Directory portion of a path, or '' when there is no separator. */
function dirOf(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx >= 0 ? filePath.slice(0, idx) : '';
}

/** Anchor a relative path to the workspace so Run Manager can resolve it. */
function workspaceRelative(filePath: string): string {
  if (filePath === '' || filePath.startsWith('${workspaceFolder}') || filePath.startsWith('/')) {
    return filePath;
  }
  return `\${workspaceFolder}/${filePath}`;
}
