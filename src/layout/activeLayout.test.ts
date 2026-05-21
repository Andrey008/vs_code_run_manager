import {
  UNGROUPED_ID,
  ActiveLayout,
  emptyLayout,
  normalizeLayout,
  migrateFromSelected,
  pruneLayout,
  allServiceIds,
  isActive,
  addService,
  removeService,
  toggleService,
  createGroup,
  renameGroup,
  setGroupCollapsed,
  deleteGroup,
  moveService,
  reorderGroups,
} from './activeLayout';

const ungroupedOf = (l: ActiveLayout) => l.groups.find(g => g.id === UNGROUPED_ID)!;
const groupNamed = (l: ActiveLayout, name: string) => l.groups.find(g => g.name === name)!;

describe('emptyLayout', () => {
  it('has only an empty Ungrouped group', () => {
    const l = emptyLayout();
    expect(l.groups).toHaveLength(1);
    expect(l.groups[0].id).toBe(UNGROUPED_ID);
    expect(l.groups[0].serviceIds).toEqual([]);
  });
});

describe('normalizeLayout', () => {
  it('creates a missing Ungrouped group', () => {
    const l = normalizeLayout({ groups: [{ id: 'g1', name: 'A', serviceIds: [] }] });
    expect(l.groups.map(g => g.id)).toEqual(['g1', UNGROUPED_ID]);
  });

  it('always pins Ungrouped last', () => {
    const l = normalizeLayout({
      groups: [
        { id: UNGROUPED_ID, name: 'Ungrouped', serviceIds: [] },
        { id: 'g1', name: 'A', serviceIds: [] },
      ],
    });
    expect(l.groups[l.groups.length - 1].id).toBe(UNGROUPED_ID);
  });

  it('deduplicates a service across groups (first wins)', () => {
    const l = normalizeLayout({
      groups: [
        { id: 'g1', name: 'A', serviceIds: ['s1', 's2'] },
        { id: 'g2', name: 'B', serviceIds: ['s2', 's3'] },
      ],
    });
    expect(groupNamed(l, 'A').serviceIds).toEqual(['s1', 's2']);
    expect(groupNamed(l, 'B').serviceIds).toEqual(['s3']);
  });

  it('merges duplicate Ungrouped groups', () => {
    const l = normalizeLayout({
      groups: [
        { id: UNGROUPED_ID, name: 'Ungrouped', serviceIds: ['s1'] },
        { id: UNGROUPED_ID, name: 'Ungrouped', serviceIds: ['s2'] },
      ],
    });
    expect(l.groups).toHaveLength(1);
    expect(ungroupedOf(l).serviceIds).toEqual(['s1', 's2']);
  });
});

describe('migrateFromSelected', () => {
  it('puts all legacy selected services into Ungrouped', () => {
    const l = migrateFromSelected(['a', 'b', 'c']);
    expect(l.groups).toHaveLength(1);
    expect(ungroupedOf(l).serviceIds).toEqual(['a', 'b', 'c']);
  });
});

describe('pruneLayout', () => {
  it('drops service ids not in the valid set', () => {
    const base = normalizeLayout({
      groups: [{ id: 'g1', name: 'A', serviceIds: ['keep', 'gone'] }],
    });
    const l = pruneLayout(addService(base, 'also-gone'), ['keep']);
    expect(allServiceIds(l)).toEqual(['keep']);
  });
});

describe('addService / removeService / toggleService', () => {
  it('adds a service to Ungrouped', () => {
    const l = addService(emptyLayout(), 's1');
    expect(ungroupedOf(l).serviceIds).toEqual(['s1']);
    expect(isActive(l, 's1')).toBe(true);
  });

  it('does not duplicate a service already in a custom group', () => {
    let l = createGroup(emptyLayout(), 'A');
    l = moveService(l, 's1', groupNamed(l, 'A').id, null);
    l = addService(l, 's1');
    expect(allServiceIds(l)).toEqual(['s1']);
  });

  it('removeService deletes from any group', () => {
    let l = createGroup(emptyLayout(), 'A');
    l = moveService(l, 's1', groupNamed(l, 'A').id, null);
    l = removeService(l, 's1');
    expect(isActive(l, 's1')).toBe(false);
  });

  it('toggleService flips membership', () => {
    let l = toggleService(emptyLayout(), 's1');
    expect(isActive(l, 's1')).toBe(true);
    l = toggleService(l, 's1');
    expect(isActive(l, 's1')).toBe(false);
  });
});

describe('createGroup / renameGroup / deleteGroup', () => {
  it('creates a custom group before Ungrouped', () => {
    const l = createGroup(emptyLayout(), 'Backend');
    expect(l.groups.map(g => g.name)).toEqual(['Backend', 'Ungrouped']);
  });

  it('renames a custom group', () => {
    let l = createGroup(emptyLayout(), 'Old');
    l = renameGroup(l, groupNamed(l, 'Old').id, 'New');
    expect(groupNamed(l, 'New')).toBeDefined();
  });

  it('ignores rename of Ungrouped', () => {
    const l = renameGroup(emptyLayout(), UNGROUPED_ID, 'Hacked');
    expect(ungroupedOf(l).name).toBe('Ungrouped');
  });

  it('deleteGroup moves services back to Ungrouped', () => {
    let l = createGroup(emptyLayout(), 'A');
    const gid = groupNamed(l, 'A').id;
    l = moveService(l, 's1', gid, null);
    l = moveService(l, 's2', gid, null);
    l = deleteGroup(l, gid);
    expect(l.groups).toHaveLength(1);
    expect(ungroupedOf(l).serviceIds).toEqual(['s1', 's2']);
  });

  it('ignores delete of Ungrouped', () => {
    const l = deleteGroup(addService(emptyLayout(), 's1'), UNGROUPED_ID);
    expect(isActive(l, 's1')).toBe(true);
  });

  it('createGroup keeps existing Ungrouped services', () => {
    let l = addService(addService(emptyLayout(), 's1'), 's2');
    l = createGroup(l, 'Backend');
    expect(ungroupedOf(l).serviceIds).toEqual(['s1', 's2']);
    expect(allServiceIds(l).sort()).toEqual(['s1', 's2']);
  });
});

describe('setGroupCollapsed', () => {
  it('toggles the collapsed flag', () => {
    let l = createGroup(emptyLayout(), 'A');
    const gid = groupNamed(l, 'A').id;
    l = setGroupCollapsed(l, gid, true);
    expect(groupNamed(l, 'A').collapsed).toBe(true);
  });
});

describe('moveService', () => {
  it('moves a service across groups, appending when before is null', () => {
    let l = createGroup(createGroup(emptyLayout(), 'A'), 'B');
    const a = groupNamed(l, 'A').id;
    const b = groupNamed(l, 'B').id;
    l = moveService(l, 's1', a, null);
    l = moveService(l, 's1', b, null);
    expect(groupNamed(l, 'A').serviceIds).toEqual([]);
    expect(groupNamed(l, 'B').serviceIds).toEqual(['s1']);
  });

  it('inserts before the given service', () => {
    let l = createGroup(emptyLayout(), 'A');
    const a = groupNamed(l, 'A').id;
    l = moveService(l, 's1', a, null);
    l = moveService(l, 's2', a, null);
    l = moveService(l, 's3', a, 's2');
    expect(groupNamed(l, 'A').serviceIds).toEqual(['s1', 's3', 's2']);
  });

  it('reorders within the same group', () => {
    let l = createGroup(emptyLayout(), 'A');
    const a = groupNamed(l, 'A').id;
    l = moveService(l, 's1', a, null);
    l = moveService(l, 's2', a, null);
    l = moveService(l, 's3', a, null);
    l = moveService(l, 's3', a, 's1');
    expect(groupNamed(l, 'A').serviceIds).toEqual(['s3', 's1', 's2']);
  });

  it('is a no-op when dropping a service before itself', () => {
    let l = createGroup(emptyLayout(), 'A');
    const a = groupNamed(l, 'A').id;
    l = moveService(l, 's1', a, null);
    l = moveService(l, 's2', a, null);
    l = moveService(l, 's1', a, 's1');
    expect(groupNamed(l, 'A').serviceIds).toEqual(['s1', 's2']);
  });
});

describe('reorderGroups', () => {
  it('moves a group before another', () => {
    let l = createGroup(createGroup(createGroup(emptyLayout(), 'A'), 'B'), 'C');
    l = reorderGroups(l, groupNamed(l, 'C').id, groupNamed(l, 'A').id);
    expect(l.groups.map(g => g.name)).toEqual(['C', 'A', 'B', 'Ungrouped']);
  });

  it('moves a group to the end when before is null', () => {
    let l = createGroup(createGroup(createGroup(emptyLayout(), 'A'), 'B'), 'C');
    l = reorderGroups(l, groupNamed(l, 'A').id, null);
    expect(l.groups.map(g => g.name)).toEqual(['B', 'C', 'A', 'Ungrouped']);
  });

  it('never moves a group after Ungrouped', () => {
    let l = createGroup(createGroup(emptyLayout(), 'A'), 'B');
    l = reorderGroups(l, groupNamed(l, 'A').id, UNGROUPED_ID);
    expect(l.groups[l.groups.length - 1].id).toBe(UNGROUPED_ID);
  });

  it('ignores reordering of Ungrouped itself', () => {
    let l = createGroup(emptyLayout(), 'A');
    l = reorderGroups(l, UNGROUPED_ID, groupNamed(l, 'A').id);
    expect(l.groups.map(g => g.name)).toEqual(['A', 'Ungrouped']);
  });

  it('keeps Ungrouped services when reordering custom groups', () => {
    let l = createGroup(createGroup(addService(emptyLayout(), 's1'), 'A'), 'B');
    l = reorderGroups(l, groupNamed(l, 'B').id, groupNamed(l, 'A').id);
    expect(ungroupedOf(l).serviceIds).toEqual(['s1']);
  });
});
