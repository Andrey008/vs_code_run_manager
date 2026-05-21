import * as vscode from 'vscode';
import { LaunchRunner } from './LaunchRunner';
import type { LaunchServiceConfig, ServiceStatus } from '../types';

const mockDebug = vscode.debug as typeof vscode.debug & {
  _fireStart: (s: unknown) => void;
  _fireTerminate: (s: unknown) => void;
};

function makeSvc(overrides: Partial<LaunchServiceConfig> = {}): LaunchServiceConfig {
  return {
    id: 'app',
    name: 'App',
    type: 'launch',
    launchConfig: 'App',
    mode: 'run',
    ...overrides,
  };
}

function makeRunner() {
  const runner = new LaunchRunner();
  const statuses: { id: string; status: ServiceStatus }[] = [];
  runner.onStatusChange((id, status) => statuses.push({ id, status }));
  return { runner, statuses };
}

beforeEach(() => jest.clearAllMocks());

describe('LaunchRunner', () => {
  it('always calls startDebugging with noDebug:false regardless of mode', async () => {
    const { runner } = makeRunner();
    await runner.start(makeSvc({ mode: 'run' }));
    expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
      expect.anything(),
      'App',
      { noDebug: false }
    );
  });

  it('debug mode also uses noDebug:false', async () => {
    const { runner } = makeRunner();
    await runner.start(makeSvc({ mode: 'debug' }));
    expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
      expect.anything(),
      'App',
      { noDebug: false }
    );
  });

  it('transitions stopped → starting → running on DidStartDebugSession', async () => {
    const { runner, statuses } = makeRunner();
    await runner.start(makeSvc());
    expect(statuses.at(-1)).toEqual({ id: 'app', status: 'starting' });

    mockDebug._fireStart({ id: 'sess-1', name: 'App' });
    expect(statuses.at(-1)).toEqual({ id: 'app', status: 'running' });
  });

  it('ignores DidStartDebugSession for sessions with unknown name', async () => {
    const { runner, statuses } = makeRunner();
    await runner.start(makeSvc());
    mockDebug._fireStart({ id: 'sess-x', name: 'OtherApp' });
    expect(statuses.at(-1)).toEqual({ id: 'app', status: 'starting' });
  });

  it('transitions to stopped when session terminates', async () => {
    const { runner, statuses } = makeRunner();
    await runner.start(makeSvc());
    mockDebug._fireStart({ id: 'sess-1', name: 'App' });
    mockDebug._fireTerminate({ id: 'sess-1', name: 'App' });
    expect(statuses.at(-1)).toEqual({ id: 'app', status: 'stopped' });
  });

  it('ignores DidTerminateDebugSession for sessions from other extensions', async () => {
    const { runner, statuses } = makeRunner();
    await runner.start(makeSvc());
    mockDebug._fireStart({ id: 'sess-1', name: 'App' });
    mockDebug._fireTerminate({ id: 'other-sess', name: 'SomethingElse' });
    expect(statuses.at(-1)).toEqual({ id: 'app', status: 'running' });
  });

  it('stays running when a child session arrives and parent terminates', async () => {
    const { runner, statuses } = makeRunner();
    await runner.start(makeSvc());
    mockDebug._fireStart({ id: 'sess-1', name: 'App' });   // parent
    mockDebug._fireStart({ id: 'sess-2', name: 'App' });   // child takes over
    mockDebug._fireTerminate({ id: 'sess-1', name: 'App' });
    expect(statuses.at(-1)).toEqual({ id: 'app', status: 'running' });

    mockDebug._fireTerminate({ id: 'sess-2', name: 'App' });
    expect(statuses.at(-1)).toEqual({ id: 'app', status: 'stopped' });
  });

  it('does not confuse two simultaneous JVM services on session terminate', async () => {
    const { runner, statuses } = makeRunner();
    const svc1 = makeSvc({ id: 'svc1', launchConfig: 'App1' });
    const svc2 = makeSvc({ id: 'svc2', launchConfig: 'App2' });

    await runner.start(svc1);
    await runner.start(svc2);

    mockDebug._fireStart({ id: 'sess-1', name: 'App1' });
    mockDebug._fireStart({ id: 'sess-2', name: 'App2' });

    mockDebug._fireTerminate({ id: 'sess-1', name: 'App1' });

    expect(statuses.filter(s => s.id === 'svc1').at(-1)).toEqual({ id: 'svc1', status: 'stopped' });
    expect(statuses.filter(s => s.id === 'svc2').at(-1)).toEqual({ id: 'svc2', status: 'running' });
  });

  it('stop() calls stopDebugging with the active session', async () => {
    const { runner } = makeRunner();
    const svc = makeSvc();
    await runner.start(svc);
    const session = { id: 'sess-1', name: 'App' };
    mockDebug._fireStart(session);
    await runner.stop(svc);
    expect(vscode.debug.stopDebugging).toHaveBeenCalledWith(session);
  });

  it('start() is a no-op when service is not stopped', async () => {
    const { runner } = makeRunner();
    const svc = makeSvc();
    await runner.start(svc);
    await runner.start(svc);
    expect(vscode.debug.startDebugging).toHaveBeenCalledTimes(1);
  });
});
