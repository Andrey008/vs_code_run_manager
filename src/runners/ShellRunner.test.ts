import { EventEmitter } from 'events';

jest.mock('child_process');

import { spawn } from 'child_process';
import { ShellRunner } from './ShellRunner';
import type { ShellServiceConfig } from '../types';

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

class MockProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  pid = 1234;
  killed = false;
  kill = jest.fn((signal?: string) => {
    this.killed = true;
    setImmediate(() => {
      const code = signal === 'SIGKILL' ? null : 0;
      const sig = signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM';
      this.emit('exit', code, sig);
    });
  });
}

const shellSvc: ShellServiceConfig = {
  id: 'api',
  name: 'API',
  type: 'shell',
  cmd: 'echo hello',
  cwd: '/workspace',
};

function makeRunner() {
  const runner = new ShellRunner();
  const statuses: Array<{ id: string; status: string }> = [];
  const data: Array<{ id: string; chunk: string }> = [];
  runner.onStatusChange((id, status) => statuses.push({ id, status }));
  runner.onData((id, chunk) => data.push({ id, chunk }));
  return { runner, statuses, data };
}

function makeProc(): MockProcess {
  const proc = new MockProcess();
  mockSpawn.mockReturnValueOnce(proc as unknown as ReturnType<typeof spawn>);
  return proc;
}

beforeEach(() => jest.clearAllMocks());

describe('ShellRunner', () => {
  it('spawns process with correct cmd and cwd', async () => {
    const proc = makeProc();
    const { runner } = makeRunner();
    await runner.start(shellSvc);
    expect(mockSpawn).toHaveBeenCalledWith(
      'sh', ['-c', 'echo hello'],
      expect.objectContaining({ cwd: '/workspace' })
    );
    proc.emit('exit', 0, null);
  });

  it('transitions stopped → starting → running on first stdout', async () => {
    const proc = makeProc();
    const { runner, statuses } = makeRunner();
    await runner.start(shellSvc);
    expect(statuses.at(-1)).toEqual({ id: 'api', status: 'starting' });
    proc.stdout.emit('data', Buffer.from('hello\n'));
    expect(statuses.at(-1)).toEqual({ id: 'api', status: 'running' });
    proc.emit('exit', 0, null);
  });

  it('pipes stdout to onData callback', async () => {
    const proc = makeProc();
    const { runner, data } = makeRunner();
    await runner.start(shellSvc);
    proc.stdout.emit('data', Buffer.from('line1\n'));
    proc.stderr.emit('data', Buffer.from('err\n'));
    expect(data).toEqual([
      { id: 'api', chunk: 'line1\n' },
      { id: 'api', chunk: 'err\n' },
    ]);
    proc.emit('exit', 0, null);
  });

  it('marks service crashed on non-zero exit code', async () => {
    const proc = makeProc();
    const { runner, statuses } = makeRunner();
    await runner.start(shellSvc);
    proc.emit('exit', 1, null);
    expect(statuses.at(-1)).toEqual({ id: 'api', status: 'crashed' });
  });

  it('transitions starting → crashed when process dies before first output', async () => {
    const proc = makeProc();
    const { runner, statuses } = makeRunner();
    await runner.start(shellSvc);
    expect(statuses.at(-1)).toEqual({ id: 'api', status: 'starting' });
    proc.emit('exit', 1, null);
    expect(statuses.at(-1)).toEqual({ id: 'api', status: 'crashed' });
  });

  it('kills process on stop()', async () => {
    const proc = makeProc();
    const { runner, statuses } = makeRunner();
    await runner.start(shellSvc);
    proc.stdout.emit('data', Buffer.from('running\n'));
    await runner.stop(shellSvc);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(statuses.at(-1)).toEqual({ id: 'api', status: 'stopped' });
  });

  it('sends SIGKILL after 5s if process does not exit on SIGTERM', async () => {
    jest.useFakeTimers();
    const proc = new MockProcess();
    proc.kill = jest.fn(); // does NOT emit exit
    mockSpawn.mockReturnValueOnce(proc as unknown as ReturnType<typeof spawn>);

    const { runner } = makeRunner();
    await runner.start(shellSvc);
    proc.stdout.emit('data', Buffer.from('x'));
    await runner.stop(shellSvc);

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.kill).not.toHaveBeenCalledWith('SIGKILL');

    jest.advanceTimersByTime(5000);

    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    jest.useRealTimers();
  });

  it('does not spawn second process if start() called while starting', async () => {
    const proc = makeProc();
    const { runner, statuses } = makeRunner();
    await runner.start(shellSvc);
    await runner.start(shellSvc); // idempotent
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const startingCount = statuses.filter(s => s.status === 'starting').length;
    expect(startingCount).toBe(1);
    proc.emit('exit', 0, null);
  });

  it('stop() is a no-op when service is already stopped', async () => {
    const { runner, statuses } = makeRunner();
    await runner.stop(shellSvc); // no process running
    expect(statuses).toHaveLength(0);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('restarts: kills old process and spawns new one', async () => {
    const proc1 = makeProc();
    const proc2 = makeProc();
    const { runner, statuses } = makeRunner();

    await runner.start(shellSvc);
    proc1.stdout.emit('data', Buffer.from('up\n'));

    await runner.restart(shellSvc);

    expect(proc1.kill).toHaveBeenCalledWith('SIGTERM');
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    const statusList = statuses.map(s => s.status);
    expect(statusList).toContain('stopped');
    expect(statusList.at(-1)).toBe('starting');

    proc2.emit('exit', 0, null);
  });
});
