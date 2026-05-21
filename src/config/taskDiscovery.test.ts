import { groupTasks, RawTask } from './taskDiscovery';
import type { TaskServiceConfig } from '../types';

const noExplicit: ReadonlySet<string> = new Set();

describe('groupTasks', () => {
  it('groups tasks.json (Workspace) tasks under "Tasks"', () => {
    const groups = groupTasks([{ name: 'build', source: 'Workspace' }], noExplicit);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Tasks');
    expect(groups[0].services.map(s => s.name)).toEqual(['build']);
  });

  it('groups auto-detected tasks under their own source', () => {
    const groups = groupTasks(
      [
        { name: 'test', source: 'npm' },
        { name: 'lint', source: 'npm' },
      ],
      noExplicit
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('npm');
    expect(groups[0].services.map(s => s.name)).toEqual(['test', 'lint']);
  });

  it('records taskName and taskSource on each service', () => {
    const groups = groupTasks([{ name: 'test', source: 'npm' }], noExplicit);
    const svc = groups[0].services[0] as TaskServiceConfig;
    expect(svc).toMatchObject({ type: 'task', taskName: 'test', taskSource: 'npm' });
  });

  it('skips tasks already referenced explicitly in services.json', () => {
    const groups = groupTasks(
      [
        { name: 'build', source: 'Workspace' },
        { name: 'test', source: 'npm' },
      ],
      new Set(['build'])
    );
    expect(groups.flatMap(g => g.services).map(s => s.name)).toEqual(['test']);
  });

  it('keeps same-named tasks from different sources as distinct entries', () => {
    const groups = groupTasks(
      [
        { name: 'build', source: 'Workspace' },
        { name: 'build', source: 'npm' },
      ],
      noExplicit
    );
    const ids = groups.flatMap(g => g.services).map(s => s.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('deduplicates identical name+source pairs', () => {
    const groups = groupTasks(
      [
        { name: 'build', source: 'npm' },
        { name: 'build', source: 'npm' },
      ],
      noExplicit
    );
    expect(groups[0].services).toHaveLength(1);
  });

  it('produces deterministic, unique ids', () => {
    const groups = groupTasks([{ name: 'Build:Webview', source: 'npm' }], noExplicit);
    expect(groups[0].services[0].id).toBe('task:npm:build-webview');
  });

  it('sorts the Tasks group first, the rest alphabetically', () => {
    const tasks: RawTask[] = [
      { name: 'a', source: 'npm' },
      { name: 'b', source: 'gulp' },
      { name: 'c', source: 'Workspace' },
    ];
    expect(groupTasks(tasks, noExplicit).map(g => g.name)).toEqual(['Tasks', 'gulp', 'npm']);
  });

  it('ignores tasks without a name', () => {
    const groups = groupTasks([{ name: '', source: 'npm' }], noExplicit);
    expect(groups).toEqual([]);
  });
});
