import type { HealthCheck, HttpHealthCheck } from '../types';

const HTTP_POLL_INTERVAL_MS = 1000;

export class HealthChecker {
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _disposed = false;
  private _regex: RegExp | null = null;
  private _startTime = Date.now();

  constructor(
    private readonly _config: HealthCheck,
    private readonly _onReady: () => void,
    private readonly _fetcher: (url: string) => Promise<{ status: number }> = url =>
      fetch(url).then(r => ({ status: r.status }))
  ) {
    this._startTime = Date.now();

    if (_config.type === 'log-pattern') {
      this._regex = new RegExp(_config.pattern);
      if (_config.timeout > 0) {
        this._timer = setTimeout(() => {
          this._disposed = true;
          this._timer = null;
        }, _config.timeout);
      }
    } else {
      this._scheduleHttpPoll(HTTP_POLL_INTERVAL_MS);
    }
  }

  feedLog(data: string): void {
    if (this._disposed || !this._regex) return;
    if (this._regex.test(data)) {
      this._disposed = true;
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      this._onReady();
    }
  }

  dispose(): void {
    this._disposed = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _scheduleHttpPoll(delay: number): void {
    this._timer = setTimeout(() => {
      this._timer = null;
      void this._httpPoll();
    }, delay);
  }

  private async _httpPoll(): Promise<void> {
    const config = this._config as HttpHealthCheck;
    if (this._disposed) return;

    const elapsed = Date.now() - this._startTime;
    if (elapsed >= config.timeout) {
      this._disposed = true;
      return;
    }

    try {
      const res = await this._fetcher(config.url);
      if (this._disposed) return;
      if (res.status === config.readyWhen) {
        this._disposed = true;
        this._onReady();
        return;
      }
    } catch {
      // network error — retry
    }

    if (!this._disposed) {
      this._scheduleHttpPoll(HTTP_POLL_INTERVAL_MS);
    }
  }
}
