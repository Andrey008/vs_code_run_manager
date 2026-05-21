const RING_BUFFER_SIZE = 2000;
const BATCH_INTERVAL_MS = 16;

type FlushCallback = (id: string, chunks: string[]) => void;

export class LogManager {
  private readonly _buffers = new Map<string, string[]>();
  private readonly _pending = new Map<string, string[]>();
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _onFlush: FlushCallback | null = null;

  onFlush(callback: FlushCallback): void {
    this._onFlush = callback;
  }

  append(id: string, chunk: string): void {
    if (!this._buffers.has(id)) this._buffers.set(id, []);
    const buf = this._buffers.get(id)!;
    buf.push(chunk);
    if (buf.length > RING_BUFFER_SIZE) buf.shift();

    if (!this._pending.has(id)) this._pending.set(id, []);
    this._pending.get(id)!.push(chunk);

    if (!this._timer) {
      this._timer = setTimeout(() => this._flush(), BATCH_INTERVAL_MS);
    }
  }

  getBuffer(id: string): string[] {
    return this._buffers.get(id) ?? [];
  }

  dispose(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _flush(): void {
    this._timer = null;
    if (!this._onFlush) return;
    for (const [id, chunks] of this._pending) {
      this._onFlush(id, [...chunks]);
    }
    this._pending.clear();
  }
}
