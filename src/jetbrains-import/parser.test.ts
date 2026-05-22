import * as fs from 'fs';
import * as path from 'path';
import { parseRunConfigFile } from './parser';
import type { RawConfigFile } from './scanner';
import type { ConfigProvenance } from './types';

const FIXTURES = path.join(__dirname, '__fixtures__');

function raw(relPath: string, provenance: ConfigProvenance = 'shared'): RawConfigFile {
  const sourcePath = path.join(FIXTURES, relPath);
  return { xml: fs.readFileSync(sourcePath, 'utf-8'), provenance, sourcePath };
}

describe('parseRunConfigFile', () => {
  it('parses a shell-script configuration with options and inline env vars', () => {
    const [config] = parseRunConfigFile(raw('runConfigurations/shell-script.xml'));
    expect(config.name).toBe('Start API');
    expect(config.type).toBe('ShConfigurationType');
    expect(config.provenance).toBe('shared');
    expect(config.options.SCRIPT_PATH).toBe('$PROJECT_DIR$/scripts/start-api.sh');
    expect(config.options.INTERPRETER_PATH).toBe('/bin/bash');
    expect(config.options.SCRIPT_OPTIONS).toBe('--port 3000');
    expect(config.envVars.NODE_ENV).toBe('development');
  });

  it('flattens nested list options for Gradle and Maven', () => {
    const [gradle] = parseRunConfigFile(raw('runConfigurations/gradle-bootrun.xml'));
    expect(gradle.options.taskNames).toBe('bootRun');
    expect(gradle.options.externalProjectPath).toBe('$PROJECT_DIR$');

    const [maven] = parseRunConfigFile(raw('runConfigurations/maven-package.xml'));
    expect(maven.options.goals).toBe('clean,package');
    expect(maven.options.workingDirPath).toBe('$PROJECT_DIR$');
  });

  it('captures npm, node and docker-deploy settings', () => {
    const [npm] = parseRunConfigFile(raw('runConfigurations/npm-build.xml'));
    expect(npm.options.command).toBe('run');
    expect(npm.options.script).toBe('build');

    const [node] = parseRunConfigFile(raw('runConfigurations/node-server.xml'));
    expect(node.options['path-to-js-file']).toBe('server.js');
    expect(node.options['working-dir']).toBe('$PROJECT_DIR$');

    const [docker] = parseRunConfigFile(raw('runConfigurations/docker-compose.xml'));
    expect(docker.options.sourceFilePath).toBe('docker-compose.yml');
    expect(docker.options.servicesNames).toBe('db');
  });

  it('parses workspace.xml personal configs and skips default templates', () => {
    const configs = parseRunConfigFile(raw('workspace.xml', 'personal'));
    expect(configs.map(c => c.name).sort()).toEqual(['Personal Task', 'Personal Worker']);
    expect(configs.every(c => c.provenance === 'personal')).toBe(true);
  });

  it('returns an empty list for malformed XML', () => {
    expect(parseRunConfigFile(raw('runConfigurations/malformed.xml'))).toEqual([]);
  });
});
