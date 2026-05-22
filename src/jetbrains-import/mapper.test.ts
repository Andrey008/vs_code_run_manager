import { mapConfig } from './mapper';
import type { JetBrainsRunConfig } from './types';
import type { ShellServiceConfig, DockerComposeServiceConfig } from '../types';

function config(type: string, options: Record<string, string>, name = 'Cfg'): JetBrainsRunConfig {
  return { name, type, provenance: 'shared', options, envVars: {} };
}

describe('mapConfig', () => {
  it('maps a shell script to a clean shell service', () => {
    const m = mapConfig(config('ShConfigurationType', {
      INTERPRETER_PATH: '/bin/bash',
      SCRIPT_PATH: '$PROJECT_DIR$/scripts/start-api.sh',
      SCRIPT_OPTIONS: '--port 3000',
      SCRIPT_WORKING_DIRECTORY: '$PROJECT_DIR$',
    }, 'Start API'));
    expect(m.confidence).toBe('clean');
    const svc = m.service as ShellServiceConfig;
    expect(svc.type).toBe('shell');
    expect(svc.cmd).toBe('/bin/bash ${workspaceFolder}/scripts/start-api.sh --port 3000');
    expect(svc.cwd).toBe('${workspaceFolder}');
    expect(svc.source).toBe('jetbrains');
    expect(svc.originId).toBe('start-api-shconfigurationtype');
  });

  it('maps npm, gradle and maven to clean shell services', () => {
    expect((mapConfig(config('js.build_tools.npm', { command: 'run', script: 'build' }))
      .service as ShellServiceConfig).cmd).toBe('npm run build');
    expect((mapConfig(config('GradleRunConfiguration', { taskNames: 'bootRun', externalProjectPath: '$PROJECT_DIR$' }))
      .service as ShellServiceConfig).cmd).toBe('./gradlew bootRun');
    expect((mapConfig(config('MavenRunConfiguration', { goals: 'clean,package', workingDirPath: '$PROJECT_DIR$' }))
      .service as ShellServiceConfig).cmd).toBe('mvn clean package');
  });

  it('maps a Compose docker-deploy to a docker-compose service', () => {
    const m = mapConfig(config('docker-deploy', { sourceFilePath: 'docker-compose.yml', servicesNames: 'db' }));
    expect(m.confidence).toBe('clean');
    const svc = m.service as DockerComposeServiceConfig;
    expect(svc.type).toBe('docker-compose');
    expect(svc.service).toBe('db');
  });

  it('flags a JVM Application as needs-review with a caveat note', () => {
    const m = mapConfig(config('Application', { MAIN_CLASS_NAME: 'com.example.Main' }));
    expect(m.confidence).toBe('needs-review');
    expect(m.service?.type).toBe('shell');
    expect(m.notes.length).toBeGreaterThan(0);
  });

  it('reports an unknown type as unmapped with no service', () => {
    const m = mapConfig(config('SomeExoticType', {}));
    expect(m.confidence).toBe('unmapped');
    expect(m.service).toBeNull();
  });
});
