import { HealthChecker } from './HealthChecker';
import type { HealthCheck } from '../types';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('HealthChecker — log-pattern', () => {
  it('calls onReady when log data matches pattern', () => {
    const onReady = jest.fn();
    const config: HealthCheck = { type: 'log-pattern', pattern: 'started on port', timeout: 5000 };
    const checker = new HealthChecker(config, onReady);

    checker.feedLog('Server started on port 3000');
    expect(onReady).toHaveBeenCalledTimes(1);
    checker.dispose();
  });

  it('does not fire when pattern does not match', () => {
    const onReady = jest.fn();
    const config: HealthCheck = { type: 'log-pattern', pattern: 'ready', timeout: 5000 };
    const checker = new HealthChecker(config, onReady);

    checker.feedLog('Server initializing...');
    expect(onReady).not.toHaveBeenCalled();
    checker.dispose();
  });

  it('fires at most once even if pattern appears in multiple feedLog calls', () => {
    const onReady = jest.fn();
    const config: HealthCheck = { type: 'log-pattern', pattern: 'ready', timeout: 5000 };
    const checker = new HealthChecker(config, onReady);

    checker.feedLog('Server ready');
    checker.feedLog('Server ready again');
    expect(onReady).toHaveBeenCalledTimes(1);
    checker.dispose();
  });

  it('does not fire after timeout elapses', () => {
    const onReady = jest.fn();
    const config: HealthCheck = { type: 'log-pattern', pattern: 'ready', timeout: 5000 };
    const checker = new HealthChecker(config, onReady);

    jest.advanceTimersByTime(6000);
    checker.feedLog('Server ready');
    expect(onReady).not.toHaveBeenCalled();
    checker.dispose();
  });

  it('dispose cancels timeout and stops listening', () => {
    const onReady = jest.fn();
    const config: HealthCheck = { type: 'log-pattern', pattern: 'ready', timeout: 5000 };
    const checker = new HealthChecker(config, onReady);

    checker.dispose();
    checker.feedLog('Server ready');
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe('HealthChecker — http', () => {
  it('calls onReady when URL responds with readyWhen status', async () => {
    const onReady = jest.fn();
    const fetcher = jest.fn().mockResolvedValue({ status: 200 });
    const config: HealthCheck = { type: 'http', url: 'http://localhost:3000/health', readyWhen: 200, timeout: 10000 };

    const checker = new HealthChecker(config, onReady, fetcher);
    await jest.runAllTimersAsync();

    expect(onReady).toHaveBeenCalledTimes(1);
    checker.dispose();
  });

  it('does not call onReady when status does not match readyWhen', async () => {
    const onReady = jest.fn();
    const fetcher = jest.fn().mockResolvedValue({ status: 503 });
    const config: HealthCheck = { type: 'http', url: 'http://localhost:3000/health', readyWhen: 200, timeout: 3000 };

    const checker = new HealthChecker(config, onReady, fetcher);
    await jest.runAllTimersAsync();

    expect(onReady).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalled();
    checker.dispose();
  });

  it('continues retrying when fetch throws (network error)', async () => {
    const onReady = jest.fn();
    const fetcher = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({ status: 200 });
    const config: HealthCheck = { type: 'http', url: 'http://localhost:3000/health', readyWhen: 200, timeout: 10000 };

    const checker = new HealthChecker(config, onReady, fetcher);
    await jest.runAllTimersAsync();

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    checker.dispose();
  });

  it('dispose stops polling', async () => {
    const onReady = jest.fn();
    const fetcher = jest.fn().mockResolvedValue({ status: 200 });
    const config: HealthCheck = { type: 'http', url: 'http://localhost:3000/health', readyWhen: 200, timeout: 10000 };

    const checker = new HealthChecker(config, onReady, fetcher);
    checker.dispose();
    await jest.runAllTimersAsync();

    expect(onReady).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
