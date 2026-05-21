import React, { useState } from 'react';
import { ServiceItem } from './ServiceItem';
import { postMessage } from '../vscodeApi';
import {
  UNGROUPED_ID,
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupCollapsed,
  moveService,
  reorderGroups,
  removeService,
} from '../../../src/layout/activeLayout';
import type { ActiveGroup, ActiveLayout, ServiceConfig, ServiceStatus } from '../types';

interface Props {
  layout: ActiveLayout;
  allServices: ServiceConfig[];
  statuses: Record<string, ServiceStatus>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLayoutChange: (layout: ActiveLayout) => void;
}

/** What the user is currently dragging. */
type Drag =
  | { kind: 'service'; id: string }
  | { kind: 'group'; id: string }
  | null;

/** Where the dragged item would land if dropped now. */
type Drop =
  | { kind: 'service'; groupId: string; beforeId: string | null }
  | { kind: 'group'; beforeGroupId: string }
  | null;

const ACCENT = 'var(--vscode-focusBorder)';

export function ActiveTree({ layout, allServices, statuses, selectedId, onSelect, onLayoutChange }: Props) {
  const [drag, setDrag] = useState<Drag>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [creating, setCreating] = useState(false);
  const [draftGroup, setDraftGroup] = useState('');

  const serviceMap = new Map(allServices.map(s => [s.id, s]));

  const endDrag = () => { setDrag(null); setDrop(null); };

  const commitDrop = () => {
    if (drag && drop) {
      if (drag.kind === 'service' && drop.kind === 'service') {
        onLayoutChange(moveService(layout, drag.id, drop.groupId, drop.beforeId));
      } else if (drag.kind === 'group' && drop.kind === 'group') {
        onLayoutChange(reorderGroups(layout, drag.id, drop.beforeGroupId));
      }
    }
    endDrag();
  };

  const submitNewGroup = () => {
    if (draftGroup.trim()) onLayoutChange(createGroup(layout, draftGroup));
    setDraftGroup('');
    setCreating(false);
  };

  const resolve = (ids: string[]) =>
    ids.map(id => serviceMap.get(id)).filter((s): s is ServiceConfig => !!s);

  const customGroups = layout.groups.filter(g => g.id !== UNGROUPED_ID);
  const ungrouped = layout.groups.find(g => g.id === UNGROUPED_ID);
  const ungroupedServices = ungrouped ? resolve(ungrouped.serviceIds) : [];
  // The Ungrouped bucket is hidden when empty, and reappears as a drop target
  // only while a service is being dragged.
  const showUngrouped = !!ungrouped && (ungroupedServices.length > 0 || drag?.kind === 'service');

  const renderGroup = (
    group: ActiveGroup,
    services: ServiceConfig[],
    nextGroupId: string | null,
    isUngrouped: boolean
  ) => (
    <GroupCard
      key={group.id}
      group={group}
      services={services}
      nextGroupId={nextGroupId}
      isUngrouped={isUngrouped}
      statuses={statuses}
      selectedId={selectedId}
      onSelect={onSelect}
      onRename={name => onLayoutChange(renameGroup(layout, group.id, name))}
      onDelete={() => onLayoutChange(deleteGroup(layout, group.id))}
      onToggleCollapse={() => onLayoutChange(setGroupCollapsed(layout, group.id, !group.collapsed))}
      onStartAll={() => { if (group.serviceIds.length) postMessage({ type: 'startServices', ids: group.serviceIds }); }}
      onRemoveService={id => onLayoutChange(removeService(layout, id))}
      drag={drag}
      drop={drop}
      setDrag={setDrag}
      setDrop={setDrop}
      onDragEnd={endDrag}
    />
  );

  return (
    <div
      style={{ overflow: 'auto', height: '100%' }}
      onDragOver={e => e.preventDefault()}
      onDrop={commitDrop}
    >
      {customGroups.map((group, i) =>
        renderGroup(group, resolve(group.serviceIds), customGroups[i + 1]?.id ?? UNGROUPED_ID, false)
      )}

      {showUngrouped && ungrouped && renderGroup(ungrouped, ungroupedServices, null, true)}

      {/* Group-reorder indicator at the list end, shown only when Ungrouped is hidden. */}
      {!showUngrouped && drag?.kind === 'group' && drop?.kind === 'group' && drop.beforeGroupId === UNGROUPED_ID && (
        <div style={lineStyle} />
      )}

      {/* New group */}
      {creating ? (
        <div style={{ padding: '4px 8px' }}>
          <input
            autoFocus
            value={draftGroup}
            placeholder="Group name…"
            onChange={e => setDraftGroup(e.target.value)}
            onBlur={submitNewGroup}
            onKeyDown={e => {
              if (e.key === 'Enter') submitNewGroup();
              else if (e.key === 'Escape') { setDraftGroup(''); setCreating(false); }
            }}
            style={inputStyle}
          />
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          title="Create a new group"
          style={newGroupBtnStyle}
        >
          + New group
        </button>
      )}
    </div>
  );
}

interface GroupCardProps {
  group: ActiveGroup;
  services: ServiceConfig[];
  nextGroupId: string | null;
  isUngrouped: boolean;
  statuses: Record<string, ServiceStatus>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onToggleCollapse: () => void;
  onStartAll: () => void;
  onRemoveService: (id: string) => void;
  drag: Drag;
  drop: Drop;
  setDrag: (d: Drag) => void;
  setDrop: (d: Drop) => void;
  onDragEnd: () => void;
}

function GroupCard({
  group, services, nextGroupId, isUngrouped, statuses, selectedId, onSelect,
  onRename, onDelete, onToggleCollapse, onStartAll, onRemoveService,
  drag, drop, setDrag, setDrop, onDragEnd,
}: GroupCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);

  const collapsed = Boolean(group.collapsed);
  const isDropTargetGroup = drag?.kind === 'service' && drop?.kind === 'service' && drop.groupId === group.id;
  const isDragged = drag?.kind === 'group' && drag.id === group.id;
  const showGroupLineBefore = drag?.kind === 'group' && drop?.kind === 'group' && drop.beforeGroupId === group.id;

  function commitRename() {
    if (draft.trim()) onRename(draft);
    setEditing(false);
  }

  function onHeaderDragOver(e: React.DragEvent) {
    if (drag?.kind === 'group') {
      e.preventDefault();
      e.stopPropagation();
      if (isUngrouped) {
        setDrop({ kind: 'group', beforeGroupId: UNGROUPED_ID });
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const topHalf = e.clientY < rect.top + rect.height / 2;
      setDrop({ kind: 'group', beforeGroupId: topHalf ? group.id : (nextGroupId ?? UNGROUPED_ID) });
    } else if (drag?.kind === 'service') {
      e.preventDefault();
      e.stopPropagation();
      setDrop({ kind: 'service', groupId: group.id, beforeId: null });
    }
  }

  function onBodyDragOver(e: React.DragEvent) {
    if (drag?.kind !== 'service') return;
    e.preventDefault();
    e.stopPropagation();
    setDrop({ kind: 'service', groupId: group.id, beforeId: null });
  }

  function onRowDragOver(e: React.DragEvent, rowId: string, nextRowId: string | null) {
    if (drag?.kind !== 'service') return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const topHalf = e.clientY < rect.top + rect.height / 2;
    setDrop({ kind: 'service', groupId: group.id, beforeId: topHalf ? rowId : nextRowId });
  }

  const serviceLineBefore = (id: string | null) =>
    drag?.kind === 'service' && drop?.kind === 'service' && drop.groupId === group.id && drop.beforeId === id;

  return (
    <div style={{ opacity: isDragged ? 0.4 : 1 }}>
      {showGroupLineBefore && <div style={lineStyle} />}

      {/* Header */}
      <div
        draggable={!isUngrouped && !editing}
        onDragStart={e => {
          if (isUngrouped) return;
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', group.id);
          setDrag({ kind: 'group', id: group.id });
        }}
        onDragEnd={onDragEnd}
        onDragOver={onHeaderDragOver}
        onClick={() => !editing && onToggleCollapse()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 8px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--vscode-sideBarSectionHeader-foreground)',
          background: isDropTargetGroup
            ? 'var(--vscode-list-dropBackground, var(--vscode-list-hoverBackground))'
            : 'var(--vscode-sideBarSectionHeader-background)',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '14px' }}>{collapsed ? '▸' : '▾'}</span>

        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              else if (e.key === 'Escape') { setDraft(group.name); setEditing(false); }
            }}
            style={{ ...inputStyle, flex: 1, textTransform: 'none', letterSpacing: 0 }}
          />
        ) : (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {group.name}
          </span>
        )}

        <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.6, fontSize: '12px' }}>
          {services.length}
        </span>

        {services.length > 0 && (
          <button
            title="Start All"
            style={headerBtnStyle('#22c55e')}
            onClick={e => { e.stopPropagation(); onStartAll(); }}
          >
            ▶▶
          </button>
        )}

        {!isUngrouped && !editing && (
          <>
            <button
              title="Rename group"
              style={headerBtnStyle('var(--vscode-descriptionForeground)')}
              onClick={e => { e.stopPropagation(); setDraft(group.name); setEditing(true); }}
            >
              ✎
            </button>
            <button
              title="Delete group"
              style={headerBtnStyle('var(--vscode-descriptionForeground)')}
              onClick={e => { e.stopPropagation(); onDelete(); }}
            >
              🗑
            </button>
          </>
        )}
      </div>

      {/* Body */}
      {!collapsed && (
        <div onDragOver={onBodyDragOver} style={{ minHeight: services.length === 0 ? '32px' : undefined }}>
          {services.length === 0 ? (
            <>
              {serviceLineBefore(null) && <div style={lineStyle} />}
              <div style={emptyHintStyle}>
                {isUngrouped ? 'Drop here to ungroup' : 'Drag services here'}
              </div>
            </>
          ) : (
            <>
              {services.map((svc, i) => {
                const nextId = services[i + 1]?.id ?? null;
                return (
                  <React.Fragment key={svc.id}>
                    {serviceLineBefore(svc.id) && <div style={lineStyle} />}
                    <div
                      draggable
                      onDragStart={e => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', svc.id);
                        setDrag({ kind: 'service', id: svc.id });
                      }}
                      onDragEnd={onDragEnd}
                      onDragOver={e => onRowDragOver(e, svc.id, nextId)}
                      style={{ opacity: drag?.kind === 'service' && drag.id === svc.id ? 0.4 : 1 }}
                    >
                      <ServiceItem
                        service={svc}
                        status={statuses[svc.id] ?? 'stopped'}
                        isSelected={selectedId === svc.id}
                        onSelect={onSelect}
                        showCheckbox={false}
                        isChecked={false}
                        onToggle={() => { /* unused in Active tab */ }}
                        onRemove={() => onRemoveService(svc.id)}
                      />
                    </div>
                  </React.Fragment>
                );
              })}
              {serviceLineBefore(null) && <div style={lineStyle} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const lineStyle: React.CSSProperties = {
  height: '2px',
  background: ACCENT,
  margin: '0 8px',
  borderRadius: '1px',
};

const emptyHintStyle: React.CSSProperties = {
  padding: '8px 8px 8px 24px',
  fontSize: '12px',
  fontStyle: 'italic',
  color: 'var(--vscode-descriptionForeground)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: '13px',
  padding: '3px 6px',
  background: 'var(--vscode-input-background)',
  color: 'var(--vscode-input-foreground)',
  border: '1px solid var(--vscode-focusBorder)',
  borderRadius: '3px',
  outline: 'none',
};

const newGroupBtnStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  background: 'none',
  border: 'none',
  color: 'var(--vscode-descriptionForeground)',
  cursor: 'pointer',
  fontSize: '11px',
  textAlign: 'left',
  padding: '6px 10px 8px 10px',
  opacity: 0.7,
};

function headerBtnStyle(color: string): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    color,
    cursor: 'pointer',
    fontSize: '13px',
    padding: '2px 4px',
    lineHeight: 1,
    fontWeight: 400,
    textTransform: 'none',
    letterSpacing: 0,
    minWidth: '20px',
    minHeight: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '3px',
  };
}
