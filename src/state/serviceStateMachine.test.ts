import { ServiceStateMachine } from './serviceStateMachine';
import type { ServiceStatus } from '../types';

function makeMachine() {
  const changes: { status: ServiceStatus }[] = [];
  const machine = new ServiceStateMachine('test-service');
  machine.onStatusChange(status => changes.push({ status }));
  return { machine, changes };
}

describe('ServiceStateMachine', () => {
  describe('happy path', () => {
    it('initial state is stopped', () => {
      const { machine } = makeMachine();
      expect(machine.status).toBe('stopped');
    });

    it('transitions stopped → starting on start()', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      expect(machine.status).toBe('starting');
      expect(changes).toEqual([{ status: 'starting' }]);
    });

    it('transitions starting → running when process emits first output', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.firstOutput();
      expect(machine.status).toBe('running');
      expect(changes.at(-1)).toEqual({ status: 'running' });
    });

    it('transitions running → ready when health check passes', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.firstOutput();
      machine.healthCheckPassed();
      expect(machine.status).toBe('ready');
      expect(changes.at(-1)).toEqual({ status: 'ready' });
    });

    it('transitions running → crashed on non-zero exit', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.firstOutput();
      machine.processExited(1);
      expect(machine.status).toBe('crashed');
      expect(changes.at(-1)).toEqual({ status: 'crashed' });
    });

    it('transitions running → stopped on stop()', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.firstOutput();
      machine.stop();
      expect(machine.status).toBe('stopped');
      expect(changes.at(-1)).toEqual({ status: 'stopped' });
    });

    it('transitions ready → stopped on stop()', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.firstOutput();
      machine.healthCheckPassed();
      machine.stop();
      expect(machine.status).toBe('stopped');
      expect(changes.at(-1)).toEqual({ status: 'stopped' });
    });
  });

  describe('critical missing paths', () => {
    it('transitions starting → crashed when process dies before first output', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.processExited(1);
      expect(machine.status).toBe('crashed');
      expect(changes.at(-1)).toEqual({ status: 'crashed' });
    });

    it('transitions ready → crashed when crash happens after health check', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.firstOutput();
      machine.healthCheckPassed();
      machine.processExited(137);
      expect(machine.status).toBe('crashed');
      expect(changes.at(-1)).toEqual({ status: 'crashed' });
    });

    it('processExited with code 0 → stopped (clean exit)', () => {
      const { machine } = makeMachine();
      machine.start();
      machine.firstOutput();
      machine.processExited(0);
      expect(machine.status).toBe('stopped');
    });
  });

  describe('idempotency', () => {
    it('transitions stopped → stopped (idempotent stop, no-op)', () => {
      const { machine, changes } = makeMachine();
      machine.stop();
      expect(machine.status).toBe('stopped');
      expect(changes).toHaveLength(0);
    });

    it('ignores start() when service is already starting (idempotent start)', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.start();
      expect(machine.status).toBe('starting');
      expect(changes).toHaveLength(1);
    });

    it('ignores start() when service is running (idempotent start)', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.firstOutput();
      machine.start();
      expect(machine.status).toBe('running');
      expect(changes).toHaveLength(2);
    });

    it('ignores start() when service is ready (idempotent start)', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.firstOutput();
      machine.healthCheckPassed();
      machine.start();
      expect(machine.status).toBe('ready');
      expect(changes).toHaveLength(3);
    });
  });

  describe('restart', () => {
    it('transitions running → stopped → starting on restart()', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.firstOutput();
      machine.restart();
      expect(machine.status).toBe('starting');
      const statuses = changes.map(c => c.status);
      expect(statuses).toContain('stopped');
      expect(statuses.at(-1)).toBe('starting');
    });

    it('transitions ready → stopped → starting on restart()', () => {
      const { machine, changes } = makeMachine();
      machine.start();
      machine.firstOutput();
      machine.healthCheckPassed();
      machine.restart();
      expect(machine.status).toBe('starting');
      const statuses = changes.map(c => c.status);
      expect(statuses).toContain('stopped');
      expect(statuses.at(-1)).toBe('starting');
    });

    it('ignores restart() when service is already stopped', () => {
      const { machine, changes } = makeMachine();
      machine.restart();
      expect(machine.status).toBe('stopped');
      expect(changes).toHaveLength(0);
    });
  });

  describe('listener cleanup', () => {
    it('does not call removed listener after dispose', () => {
      const machine = new ServiceStateMachine('svc');
      const calls: ServiceStatus[] = [];
      const dispose = machine.onStatusChange(s => calls.push(s));
      machine.start();
      dispose();
      machine.firstOutput();
      expect(calls).toEqual(['starting']);
    });
  });
});
