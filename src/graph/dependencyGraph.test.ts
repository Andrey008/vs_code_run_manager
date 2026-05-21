import { topoSort } from './dependencyGraph';
import type { ServiceConfig } from '../types';

function mkSvc(id: string, dependsOn?: string[]): ServiceConfig {
  return { id, name: id, type: 'shell', cmd: 'echo hi', dependsOn } as ServiceConfig;
}

describe('topoSort', () => {
  it('returns single service with no deps', () => {
    expect(topoSort([mkSvc('a')], ['a'])).toEqual(['a']);
  });

  it('linear chain: b dependsOn a → [a, b]', () => {
    const svcs = [mkSvc('a'), mkSvc('b', ['a'])];
    expect(topoSort(svcs, ['b'])).toEqual(['a', 'b']);
  });

  it('diamond: c dependsOn [a, b], b dependsOn a → [a, b, c]', () => {
    const svcs = [mkSvc('a'), mkSvc('b', ['a']), mkSvc('c', ['a', 'b'])];
    expect(topoSort(svcs, ['c'])).toEqual(['a', 'b', 'c']);
  });

  it('shared dep appears only once', () => {
    const svcs = [mkSvc('a'), mkSvc('b', ['a']), mkSvc('c', ['a'])];
    const result = topoSort(svcs, ['b', 'c']);
    expect(result.filter(id => id === 'a')).toHaveLength(1);
    expect(result.indexOf('a')).toBeLessThan(result.indexOf('b'));
    expect(result.indexOf('a')).toBeLessThan(result.indexOf('c'));
  });

  it('multiple independent targets', () => {
    const svcs = [mkSvc('a'), mkSvc('b'), mkSvc('c')];
    expect(topoSort(svcs, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('throws on direct cycle', () => {
    const svcs = [mkSvc('a', ['b']), mkSvc('b', ['a'])];
    expect(() => topoSort(svcs, ['a'])).toThrow(/circular/i);
  });

  it('throws on self-cycle', () => {
    const svcs = [mkSvc('a', ['a'])];
    expect(() => topoSort(svcs, ['a'])).toThrow(/circular/i);
  });

  it('skips unknown dep IDs (external services)', () => {
    const svcs = [mkSvc('a', ['external'])];
    expect(topoSort(svcs, ['a'])).toEqual(['a']);
  });
});
