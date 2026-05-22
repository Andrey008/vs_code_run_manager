import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mergeImport } from './merge';
import type { MappedService } from './types';
import type { ShellServiceConfig } from '../types';

const FIXTURES = path.join(__dirname, '__fixtures__');

function tmpFile(fixtureName?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb-merge-'));
  const file = path.join(dir, 'services.json');
  if (fixtureName) {
    fs.copyFileSync(path.join(FIXTURES, fixtureName), file);
  }
  return file;
}

function mapped(id: string, name: string, originId: string): MappedService {
  const service: ShellServiceConfig = {
    id, name, type: 'shell', cmd: `echo ${name}`, cwd: '${workspaceFolder}',
    source: 'jetbrains', originId,
  };
  return { originId, originName: name, confidence: 'clean', service, notes: [] };
}

describe('mergeImport — first import', () => {
  it('creates a JetBrains group and preserves existing groups', () => {
    const file = tmpFile('services-empty.jsonc');
    const report = mergeImport(file, [mapped('a', 'A', 'a-x'), mapped('b', 'B', 'b-x')]);

    expect(report.aborted).toBe(false);
    expect(report.counts.imported).toBe(2);
    const written = fs.readFileSync(file, 'utf-8');
    expect(written).toContain('"JetBrains"');
    expect(written).toContain('"a"');
    expect(written).toContain('"b"');
  });

  it('preserves hand-written services and comments', () => {
    const file = tmpFile('services-with-comments.jsonc');
    mergeImport(file, [mapped('worker', 'Worker', 'worker-x')]);

    const written = fs.readFileSync(file, 'utf-8');
    expect(written).toContain('// Hand-written services');
    expect(written).toContain('// the dev entrypoint');
    expect(written).toContain('"API Server"');
    expect(written).toContain('"JetBrains"');
  });

  it('creates the file when services.json does not exist', () => {
    const file = tmpFile();
    const report = mergeImport(file, [mapped('a', 'A', 'a-x')]);
    expect(report.aborted).toBe(false);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toContain('"JetBrains"');
  });

  it('suffixes an imported id that collides with an existing service id', () => {
    const file = tmpFile('services-with-comments.jsonc'); // already has id "api"
    mergeImport(file, [mapped('api', 'Api', 'api-x')]);

    const written = fs.readFileSync(file, 'utf-8');
    expect(written).toMatch(/"api-jetbrains"/);
    // the hand-written "api" service is still there with its original command
    expect(written).toContain('node server.js');
  });

  it('aborts and leaves the file intact when services.json is malformed', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{ "groups": [ this is not json ');
    const before = fs.readFileSync(file, 'utf-8');

    const report = mergeImport(file, [mapped('a', 'A', 'a-x')]);
    expect(report.aborted).toBe(true);
    expect(report.abortReason).toBeTruthy();
    expect(fs.readFileSync(file, 'utf-8')).toBe(before);
  });
});

describe('mergeImport — re-import (smart sync)', () => {
  const ORIGIN = 'start-api-shconfigurationtype';

  it('updates a previously imported service in place without duplicating it', () => {
    const file = tmpFile('services-prior-import.jsonc');
    const m = mapped('start-api', 'Start API', ORIGIN);
    (m.service as ShellServiceConfig).cmd = 'echo CHANGED';

    const report = mergeImport(file, [m]);
    const written = fs.readFileSync(file, 'utf-8');

    expect(report.counts.updated).toBe(1);
    expect(report.counts.imported).toBe(0);
    expect(written).toContain('echo CHANGED');
    expect(written.split(ORIGIN).length - 1).toBe(1); // exactly one occurrence
  });

  it('leaves hand-written services untouched on re-import', () => {
    const file = tmpFile('services-prior-import.jsonc');
    mergeImport(file, [mapped('start-api', 'Start API', ORIGIN)]);

    const written = fs.readFileSync(file, 'utf-8');
    expect(written).toContain('"API Server"');
    expect(written).toContain('node server.js');
  });

  it('adds a newly discovered configuration alongside the existing import', () => {
    const file = tmpFile('services-prior-import.jsonc');
    const report = mergeImport(file, [
      mapped('start-api', 'Start API', ORIGIN),
      mapped('worker', 'Worker', 'worker-shconfigurationtype'),
    ]);

    expect(report.counts.updated).toBe(1);
    expect(report.counts.imported).toBe(1);
    expect(fs.readFileSync(file, 'utf-8')).toContain('"worker"');
  });

  it('marks an imported service whose source configuration vanished as stale', () => {
    const file = tmpFile('services-prior-import.jsonc');
    const report = mergeImport(file, []);

    expect(report.counts.stale).toBe(1);
    expect(fs.readFileSync(file, 'utf-8')).toContain('"stale": true');
  });

  it('clears the stale flag when a vanished source configuration reappears', () => {
    const file = tmpFile('services-prior-import.jsonc');
    mergeImport(file, []); // start-api loses its source — becomes stale
    expect(fs.readFileSync(file, 'utf-8')).toContain('"stale": true');

    const report = mergeImport(file, [mapped('start-api', 'Start API', ORIGIN)]);
    expect(report.counts.updated).toBe(1);
    expect(fs.readFileSync(file, 'utf-8')).not.toContain('"stale": true');
  });
});
