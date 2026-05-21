/**
 * Active-tab layout model.
 *
 * The "Active" tab is a user-owned dashboard: the user creates custom groups and
 * drags services between them. This is independent of the auto-discovered group
 * structure shown in the "All" tab.
 *
 * Invariants enforced by `normalizeLayout` (every mutation returns a normalized
 * layout):
 *  - Exactly one group has id `UNGROUPED_ID`, and it is always last.
 *  - A service id appears in at most one group.
 */

export const UNGROUPED_ID = 'ungrouped';
const UNGROUPED_NAME = 'Ungrouped';

export interface ActiveGroup {
  id: string;
  name: string;
  collapsed?: boolean;
  serviceIds: string[];
}

export interface ActiveLayout {
  groups: ActiveGroup[];
}

/** Generates a collision-resistant id for a user-created group. */
export function genGroupId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Enforces layout invariants and returns a fresh, normalized layout.
 * Deduplicates service ids (first occurrence wins) and pins the Ungrouped
 * group to the end, creating it if missing.
 */
export function normalizeLayout(layout: ActiveLayout | null | undefined): ActiveLayout {
  const seen = new Set<string>();
  const custom: ActiveGroup[] = [];
  // Any duplicate Ungrouped groups are merged into this single bucket.
  const ungroupedIds: string[] = [];
  let ungroupedCollapsed = false;

  for (const g of layout?.groups ?? []) {
    const serviceIds: string[] = [];
    for (const id of g.serviceIds ?? []) {
      if (!seen.has(id)) {
        seen.add(id);
        serviceIds.push(id);
      }
    }
    if (g.id === UNGROUPED_ID) {
      ungroupedIds.push(...serviceIds);
      ungroupedCollapsed = ungroupedCollapsed || Boolean(g.collapsed);
    } else {
      custom.push({ id: g.id, name: g.name, collapsed: g.collapsed, serviceIds });
    }
  }

  const ungrouped: ActiveGroup = {
    id: UNGROUPED_ID,
    name: UNGROUPED_NAME,
    collapsed: ungroupedCollapsed,
    serviceIds: ungroupedIds,
  };
  return { groups: [...custom, ungrouped] };
}

/** A layout with just an empty Ungrouped group. */
export function emptyLayout(): ActiveLayout {
  return normalizeLayout({ groups: [] });
}

/** Builds a layout from the legacy flat `selectedServices` list. */
export function migrateFromSelected(selectedIds: string[]): ActiveLayout {
  return normalizeLayout({
    groups: [{ id: UNGROUPED_ID, name: UNGROUPED_NAME, serviceIds: [...selectedIds] }],
  });
}

/** Drops any service ids that are no longer present in the config. */
export function pruneLayout(layout: ActiveLayout, validIds: Iterable<string>): ActiveLayout {
  const valid = new Set(validIds);
  return normalizeLayout({
    groups: layout.groups.map(g => ({
      ...g,
      serviceIds: g.serviceIds.filter(id => valid.has(id)),
    })),
  });
}

/** Every service id present anywhere in the layout. */
export function allServiceIds(layout: ActiveLayout): string[] {
  return layout.groups.flatMap(g => g.serviceIds);
}

/** Whether a service is currently part of the Active dashboard. */
export function isActive(layout: ActiveLayout, serviceId: string): boolean {
  return layout.groups.some(g => g.serviceIds.includes(serviceId));
}

/** Adds a service to the Ungrouped group (no-op if already present). */
export function addService(layout: ActiveLayout, serviceId: string): ActiveLayout {
  if (isActive(layout, serviceId)) return normalizeLayout(layout);
  return normalizeLayout({
    groups: layout.groups.map(g =>
      g.id === UNGROUPED_ID ? { ...g, serviceIds: [...g.serviceIds, serviceId] } : g
    ),
  });
}

/** Removes a service from the layout entirely. */
export function removeService(layout: ActiveLayout, serviceId: string): ActiveLayout {
  return normalizeLayout({
    groups: layout.groups.map(g => ({
      ...g,
      serviceIds: g.serviceIds.filter(id => id !== serviceId),
    })),
  });
}

/** Adds the service if absent, removes it if present. */
export function toggleService(layout: ActiveLayout, serviceId: string): ActiveLayout {
  return isActive(layout, serviceId)
    ? removeService(layout, serviceId)
    : addService(layout, serviceId);
}

/** Appends a new empty custom group (placed before Ungrouped). */
export function createGroup(layout: ActiveLayout, name: string): ActiveLayout {
  const group: ActiveGroup = { id: genGroupId(), name: name.trim() || 'New Group', serviceIds: [] };
  // Keep every existing group (incl. Ungrouped and its services); normalizeLayout
  // re-pins Ungrouped last, so the new group lands just before it.
  return normalizeLayout({ groups: [...layout.groups, group] });
}

/** Renames a custom group (Ungrouped cannot be renamed). */
export function renameGroup(layout: ActiveLayout, groupId: string, name: string): ActiveLayout {
  if (groupId === UNGROUPED_ID) return normalizeLayout(layout);
  const trimmed = name.trim();
  return normalizeLayout({
    groups: layout.groups.map(g =>
      g.id === groupId && trimmed ? { ...g, name: trimmed } : g
    ),
  });
}

/** Collapses or expands a group. */
export function setGroupCollapsed(layout: ActiveLayout, groupId: string, collapsed: boolean): ActiveLayout {
  return normalizeLayout({
    groups: layout.groups.map(g => (g.id === groupId ? { ...g, collapsed } : g)),
  });
}

/**
 * Deletes a custom group; its services fall back to Ungrouped.
 * Ungrouped itself cannot be deleted.
 */
export function deleteGroup(layout: ActiveLayout, groupId: string): ActiveLayout {
  if (groupId === UNGROUPED_ID) return normalizeLayout(layout);
  const target = layout.groups.find(g => g.id === groupId);
  if (!target) return normalizeLayout(layout);
  return normalizeLayout({
    groups: layout.groups
      .filter(g => g.id !== groupId)
      .map(g =>
        g.id === UNGROUPED_ID
          ? { ...g, serviceIds: [...g.serviceIds, ...target.serviceIds] }
          : g
      ),
  });
}

/**
 * Moves a service into `toGroupId`, inserting it before `beforeServiceId`.
 * A null `beforeServiceId` appends to the end of the target group.
 */
export function moveService(
  layout: ActiveLayout,
  serviceId: string,
  toGroupId: string,
  beforeServiceId: string | null
): ActiveLayout {
  // Dropping a service onto itself is a no-op.
  if (beforeServiceId === serviceId) return normalizeLayout(layout);

  const stripped = layout.groups.map(g => ({
    ...g,
    serviceIds: g.serviceIds.filter(id => id !== serviceId),
  }));
  const target = stripped.find(g => g.id === toGroupId);
  if (!target) return normalizeLayout(layout);

  const at = beforeServiceId == null ? -1 : target.serviceIds.indexOf(beforeServiceId);
  const idx = at === -1 ? target.serviceIds.length : at;
  target.serviceIds = [
    ...target.serviceIds.slice(0, idx),
    serviceId,
    ...target.serviceIds.slice(idx),
  ];
  return normalizeLayout({ groups: stripped });
}

/**
 * Reorders a custom group, inserting it before `beforeGroupId`.
 * A null `beforeGroupId` moves it to the end of the custom groups.
 * Ungrouped is never moved and always stays last.
 */
export function reorderGroups(
  layout: ActiveLayout,
  groupId: string,
  beforeGroupId: string | null
): ActiveLayout {
  if (groupId === UNGROUPED_ID) return normalizeLayout(layout);
  const custom = layout.groups.filter(g => g.id !== UNGROUPED_ID);
  const moving = custom.find(g => g.id === groupId);
  if (!moving) return normalizeLayout(layout);

  const rest = custom.filter(g => g.id !== groupId);
  let idx: number;
  if (beforeGroupId == null || beforeGroupId === UNGROUPED_ID || beforeGroupId === groupId) {
    idx = rest.length;
  } else {
    const at = rest.findIndex(g => g.id === beforeGroupId);
    idx = at === -1 ? rest.length : at;
  }
  // Carry the Ungrouped group through so its services survive normalization.
  const ungrouped = layout.groups.filter(g => g.id === UNGROUPED_ID);
  return normalizeLayout({
    groups: [...rest.slice(0, idx), moving, ...rest.slice(idx), ...ungrouped],
  });
}
