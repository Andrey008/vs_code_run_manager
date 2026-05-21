import React from 'react';
import { GroupItem } from './GroupItem';
import type { ServiceGroup, ServiceStatus } from '../types';

interface Props {
  groups: ServiceGroup[];
  statuses: Record<string, ServiceStatus>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  showCheckboxes: boolean;
  selectedServiceIds: Set<string>;
  onToggleService: (id: string) => void;
}

export function ServiceTree({ groups, statuses, selectedId, onSelect, showCheckboxes, selectedServiceIds, onToggleService }: Props) {
  if (groups.length === 0) {
    return (
      <div style={{ padding: '16px', color: 'var(--vscode-descriptionForeground)', fontSize: '13px' }}>
        No services configured. Add a <code>.vscode/launch.json</code> or <code>.vscode/services.json</code>.
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', height: '100%' }}>
      {groups.map(group => (
        <GroupItem
          key={group.name}
          group={group}
          statuses={statuses}
          selectedId={selectedId}
          onSelect={onSelect}
          showCheckboxes={showCheckboxes}
          selectedServiceIds={selectedServiceIds}
          onToggleService={onToggleService}
        />
      ))}
    </div>
  );
}
