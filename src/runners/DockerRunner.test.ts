import { EventEmitter } from 'events';

jest.mock('child_process');

import { spawn } from 'child_process';
import { DockerRunner } from './DockerRunner';
import type { DockerComposeServiceConfig, ServiceStatus } from '../types';

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

/**
 * MockProc schedules 'exit'/'error' via microtask, but ONLY after the first
 * listener is registered. This prevents the pre-test successProc() from firing
 * before _runCommand() registers proc.on('exit', resolve).
 */
class MockProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = jest.fn();

  private _pendingExit: number | null = null;
  private _exitFired = false;
  private _pendingError: Error | null = null;
  private _errorFired = false;

  exitWith(code: number): this {
    this._pendingExit = code;
    this._maybeFireExit();
    return this;
  }

  withStdout(data: string): this {
    // Schedule after exit listener is registered (exit fires last)
    Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => this.stdout.emit('data', Buffer.from(data)));
    return this;
  }

  withError(err: Error): this {
    this._pendingError = err;
    this._maybeFireError();
    return this;
  }

  neverExit(): this { return this; }

  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    super.on(event, listener);
    if (event === 'exit') this._maybeFireExit();
    if (event === 'error') this._maybeFireError();
    return this;
  }

  private _maybeFireExit(): void {
    if (this._pendingExit === null || this._exitFired) return;
    if (this.listenerCount('exit') === 0) return;
    this._exitFired = true;
    const code = this._pendingExit;
    Promise.resolve().then(() => this.emit('exit', code, null));
  }

  private _maybeFireError(): void {
    if (!this._pendingError || this._errorFired) return;
    if (this.listenerCount('error') === 0) return;
    this._errorFired = true;
    const err = this._pendingError;
    Promise.resolve().then(() => this.emit('error', err));
  }
}

function successProc(stdout = '') {
  const p = new MockProc();
  if (stdout) p.withStdout(stdout);
  p.exitWith(0);
  return p;
}

function enoentProc() {
  const p = new MockProc();
  p.withError(Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' }));
  return p;
}

const FILE = '/workspace/docker-compose.yml';

const mongoSvc: DockerComposeServiceConfig = {
  id: 'mongodb', name: 'MongoDB', type: 'docker-compose',
  file: FILE, service: 'mongodb',
};

const kafkaSvc: DockerComposeServiceConfig = {
  id: 'kafka', name: 'Kafka', type: 'docker-compose',
  file: FILE, service: 'kafka',
};

function makeRunner() {
  const runner = new DockerRunner(9_999_999);
  const statuses: { id: string; status: ServiceStatus }[] = [];
  runner.onStatusChange((id, status) => statuses.push({ id, status }));
  return { runner, statuses };
}

function mockStart(upStdout = '') {
  mockSpawn
    .mockReturnValueOnce(successProc(upStdout) as unknown as ReturnType<typeof spawn>)
    .mockReturnValueOnce(new MockProc().neverExit() as unknown as ReturnType<typeof spawn>);
}

beforeEach(() => jest.clearAllMocks());

describe('DockerRunner', () => {
  describe('commands', () => {
    it('builds correct docker compose up -d <service> command', async () => {
      mockStart();
      const { runner } = makeRunner();
      await runner.start(mongoSvc);
      runner.dispose();

      expect(mockSpawn).toHaveBeenCalledWith(
        'docker',
        ['compose', '-f', FILE, 'up', '-d', 'mongodb'],
        expect.anything()
      );
    });

    it('builds correct docker compose stop <service> command', async () => {
      mockStart();
      mockSpawn.mockReturnValueOnce(successProc() as unknown as ReturnType<typeof spawn>);

      const { runner } = makeRunner();
      await runner.start(mongoSvc);
      await runner.stop(mongoSvc);
      runner.dispose();

      expect(mockSpawn).toHaveBeenCalledWith(
        'docker',
        ['compose', '-f', FILE, 'stop', 'mongodb'],
        expect.anything()
      );
    });
  });

  describe('parsePs', () => {
    it('parses docker compose ps JSON output to status for multiple services', () => {
      const runner = new DockerRunner(9_999_999);
      runner.dispose();

      const output = [
        JSON.stringify({ Service: 'mongodb', State: 'running', ExitCode: 0 }),
        JSON.stringify({ Service: 'kafka',   State: 'exited',  ExitCode: 137 }),
        JSON.stringify({ Service: 'redis',   State: 'running', ExitCode: 0 }),
      ].join('\n');

      const result = runner.parsePs(output);
      expect(result.get('mongodb')).toEqual({ state: 'running', exitCode: 0 });
      expect(result.get('kafka')).toEqual({ state: 'exited',  exitCode: 137 });
      expect(result.get('redis')).toEqual({ state: 'running', exitCode: 0 });
    });

    it('skips malformed lines and empty lines', () => {
      const runner = new DockerRunner(9_999_999);
      runner.dispose();

      const output = [
        JSON.stringify({ Service: 'mongodb', State: 'running', ExitCode: 0 }),
        'not valid json', '',
        JSON.stringify({ Service: 'kafka', State: 'running', ExitCode: 0 }),
      ].join('\n');

      expect(runner.parsePs(output).size).toBe(2);
    });

    it('marks crashed when container exits with code > 0', () => {
      const runner = new DockerRunner(9_999_999);
      runner.dispose();
      const output = JSON.stringify({ Service: 'mongodb', State: 'exited', ExitCode: 1 });
      expect(runner.parsePs(output).get('mongodb')).toEqual({ state: 'exited', exitCode: 1 });
    });
  });

  describe('polling', () => {
    it('batches polling: N services from same file → one docker ps call per tick', async () => {
      const psOutput =
        JSON.stringify({ Service: 'mongodb', State: 'running', ExitCode: 0 }) + '\n' +
        JSON.stringify({ Service: 'kafka',   State: 'running', ExitCode: 0 });

      mockStart(); // mongo up + logs
      mockStart(); // kafka up + logs
      mockSpawn.mockReturnValueOnce(successProc(psOutput) as unknown as ReturnType<typeof spawn>);

      const { runner } = makeRunner();
      await runner.start(mongoSvc);
      await runner.start(kafkaSvc);
      await runner.poll();

      const psCalls = mockSpawn.mock.calls.filter(
        ([, args]) => (args as string[]).includes('ps')
      );
      expect(psCalls).toHaveLength(1);
      expect(psCalls[0][1]).toContain(FILE);

      runner.dispose();
    });

    it('transitions to running when poll reports container running', async () => {
      const psOutput = JSON.stringify({ Service: 'mongodb', State: 'running', ExitCode: 0 });
      mockStart();
      mockSpawn.mockReturnValueOnce(successProc(psOutput) as unknown as ReturnType<typeof spawn>);

      const { runner, statuses } = makeRunner();
      await runner.start(mongoSvc);
      await runner.poll();

      expect(statuses.at(-1)).toEqual({ id: 'mongodb', status: 'running' });
      runner.dispose();
    });

    it('transitions to crashed when poll reports container exited with non-zero', async () => {
      const psOutput = JSON.stringify({ Service: 'mongodb', State: 'exited', ExitCode: 137 });
      mockStart();
      mockSpawn.mockReturnValueOnce(successProc(psOutput) as unknown as ReturnType<typeof spawn>);

      const { runner, statuses } = makeRunner();
      await runner.start(mongoSvc);
      await runner.poll();

      expect(statuses.at(-1)).toEqual({ id: 'mongodb', status: 'crashed' });
      runner.dispose();
    });
  });

  describe('error handling', () => {
    it('shows clear error when docker is not installed', async () => {
      mockSpawn.mockReturnValueOnce(enoentProc() as unknown as ReturnType<typeof spawn>);

      const { runner } = makeRunner();
      await runner.start(mongoSvc);
      runner.dispose();

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vscode = require('vscode');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringMatching(/docker.*not installed|not.*PATH/i)
      );
    });
  });
});
