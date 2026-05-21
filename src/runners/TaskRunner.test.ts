import * as vscode from 'vscode';
import { TaskRunner } from './TaskRunner';
import type { TaskServiceConfig, ServiceStatus } from '../types';

const mockTasks = vscode.tasks as typeof vscode.tasks & {
  _fireEndTask: (e: unknown) => void;
  _fireStartTask: (e: unknown) => void;
};

function makeSvc(overrides: Partial<TaskServiceConfig> = {}): TaskServiceConfig {
  return { id: 'worker', name: 'Worker', type: 'task', taskName: 'run:worker', ...overrides };
}

function makeRunner() {
  const runner = new TaskRunner();
  const statuses: { id: string; status: ServiceStatus }[] = [];
  runner.onStatusChange((id, status) => statuses.push({ id, status }));
  return { runner, statuses };
}

function makeVsTask(name: string) {
  return { name, definition: { type: 'npm' }, source: 'Workspace' };
}

beforeEach(() => {
  jest.clearAllMocks();
  (vscode.tasks.fetchTasks as jest.Mock).mockResolvedValue([makeVsTask('run:worker')]);
  (vscode.tasks.executeTask as jest.Mock).mockResolvedValue({ task: makeVsTask('run:worker') });
});

describe('TaskRunner', () => {
  it('calls executeTask with the correct task from tasks.json', async () => {
    const { runner } = makeRunner();
    await runner.start(makeSvc());
    expect(vscode.tasks.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'run:worker' })
    );
  });

  it('transitions stopped → starting on start()', async () => {
    const { runner, statuses } = makeRunner();
    await runner.start(makeSvc());
    expect(statuses.at(-1)).toEqual({ id: 'worker', status: 'starting' });
  });

  it('transitions starting → running on DidStartTaskProcess', async () => {
    const { runner, statuses } = makeRunner();
    const execution = { task: makeVsTask('run:worker') };
    (vscode.tasks.executeTask as jest.Mock).mockResolvedValue(execution);
    await runner.start(makeSvc());
    mockTasks._fireStartTask({ execution });
    expect(statuses.at(-1)).toEqual({ id: 'worker', status: 'running' });
  });

  it('transitions to stopped when task exits with code 0', async () => {
    const { runner, statuses } = makeRunner();
    const execution = { task: makeVsTask('run:worker') };
    (vscode.tasks.executeTask as jest.Mock).mockResolvedValue(execution);
    await runner.start(makeSvc());
    mockTasks._fireEndTask({ execution, exitCode: 0 });
    expect(statuses.at(-1)).toEqual({ id: 'worker', status: 'stopped' });
  });

  it('transitions to crashed when task exits with non-zero', async () => {
    const { runner, statuses } = makeRunner();
    const execution = { task: makeVsTask('run:worker') };
    (vscode.tasks.executeTask as jest.Mock).mockResolvedValue(execution);
    await runner.start(makeSvc());
    mockTasks._fireEndTask({ execution, exitCode: 1 });
    expect(statuses.at(-1)).toEqual({ id: 'worker', status: 'crashed' });
  });

  it('shows clear error when taskName not found in tasks.json', async () => {
    (vscode.tasks.fetchTasks as jest.Mock).mockResolvedValue([]);
    const { runner } = makeRunner();
    await runner.start(makeSvc());
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('run:worker')
    );
    expect(vscode.tasks.executeTask).not.toHaveBeenCalled();
  });

  it('ignores DidEndTaskProcess for executions from other tasks', async () => {
    const { runner, statuses } = makeRunner();
    const execution = { task: makeVsTask('run:worker') };
    (vscode.tasks.executeTask as jest.Mock).mockResolvedValue(execution);
    await runner.start(makeSvc());
    const otherExecution = { task: makeVsTask('other:task') };
    mockTasks._fireEndTask({ execution: otherExecution, exitCode: 0 });
    expect(statuses.at(-1)).toEqual({ id: 'worker', status: 'starting' });
  });

  it('start() is a no-op when service is already running', async () => {
    const { runner } = makeRunner();
    await runner.start(makeSvc());
    await runner.start(makeSvc()); // idempotent
    expect(vscode.tasks.executeTask).toHaveBeenCalledTimes(1);
  });
});
