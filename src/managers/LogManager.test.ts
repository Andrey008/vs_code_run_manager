import { LogManager } from './LogManager';

describe('LogManager', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function makeManager() {
    const manager = new LogManager();
    const flushes: { id: string; chunks: string[] }[] = [];
    manager.onFlush((id, chunks) => flushes.push({ id, chunks }));
    return { manager, flushes };
  }

  it('flushes pending chunks after the batch interval', () => {
    const { manager, flushes } = makeManager();
    manager.append('a', 'hello');
    expect(flushes).toHaveLength(0);
    jest.advanceTimersByTime(16);
    expect(flushes).toEqual([{ id: 'a', chunks: ['hello'] }]);
  });

  it('batches multiple appends in one window into a single flush', () => {
    const { manager, flushes } = makeManager();
    manager.append('a', 'one');
    manager.append('a', 'two');
    jest.advanceTimersByTime(16);
    expect(flushes).toEqual([{ id: 'a', chunks: ['one', 'two'] }]);
  });

  it('groups flushed chunks by service id', () => {
    const { manager, flushes } = makeManager();
    manager.append('a', 'a1');
    manager.append('b', 'b1');
    jest.advanceTimersByTime(16);
    expect(flushes).toContainEqual({ id: 'a', chunks: ['a1'] });
    expect(flushes).toContainEqual({ id: 'b', chunks: ['b1'] });
  });

  it('clears pending after a flush — next window flushes only new chunks', () => {
    const { manager, flushes } = makeManager();
    manager.append('a', 'first');
    jest.advanceTimersByTime(16);
    manager.append('a', 'second');
    jest.advanceTimersByTime(16);
    expect(flushes).toEqual([
      { id: 'a', chunks: ['first'] },
      { id: 'a', chunks: ['second'] },
    ]);
  });

  it('caps the buffer at 2000 lines, dropping the oldest', () => {
    const { manager } = makeManager();
    for (let i = 0; i < 2050; i++) manager.append('a', `line${i}`);
    const buffer = manager.getBuffer('a');
    expect(buffer).toHaveLength(2000);
    expect(buffer[0]).toBe('line50');
    expect(buffer.at(-1)).toBe('line2049');
  });

  it('getBuffer returns an empty array for an unknown id', () => {
    const { manager } = makeManager();
    expect(manager.getBuffer('nope')).toEqual([]);
  });

  it('dispose cancels the pending flush', () => {
    const { manager, flushes } = makeManager();
    manager.append('a', 'x');
    manager.dispose();
    jest.advanceTimersByTime(100);
    expect(flushes).toHaveLength(0);
  });

  it('does not throw when flushing without an onFlush listener', () => {
    const manager = new LogManager();
    manager.append('a', 'x');
    expect(() => jest.advanceTimersByTime(16)).not.toThrow();
  });
});
