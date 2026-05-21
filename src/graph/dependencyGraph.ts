import type { ServiceConfig } from '../types';

export function topoSort(allServices: ServiceConfig[], targetIds: string[]): string[] {
  const serviceMap = new Map(allServices.map(s => [s.id, s]));
  const result: string[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (inStack.has(id)) {
      throw new Error(`Circular dependency detected involving service "${id}"`);
    }
    inStack.add(id);
    const svc = serviceMap.get(id);
    for (const depId of svc?.dependsOn ?? []) {
      if (serviceMap.has(depId)) {
        visit(depId);
      }
    }
    inStack.delete(id);
    visited.add(id);
    result.push(id);
  }

  for (const id of targetIds) {
    visit(id);
  }
  return result;
}
