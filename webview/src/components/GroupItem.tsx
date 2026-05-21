import React, { useState } from 'react';
import { ServiceItem } from './ServiceItem';
import { postMessage } from '../vscodeApi';
import type { ServiceGroup, ServiceStatus } from '../types';

interface Props {
  group: ServiceGroup;
  statuses: Record<string, ServiceStatus>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  showCheckboxes: boolean;
  selectedServiceIds: Set<string>;
  onToggleService: (id: string) => void;
}

export function GroupItem({ group, statuses, selectedId, onSelect, showCheckboxes, selectedServiceIds, onToggleService }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div
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
          background: 'var(--vscode-sideBarSectionHeader-background)',
          userSelect: 'none',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: '14px' }}>{expanded ? '▾' : '▸'}</span>
        <span>{group.name}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.6, fontSize: '12px' }}>
          {group.services.length}
        </span>
        {!showCheckboxes && (
          <button
            title="Start All"
            style={{
              background: 'none',
              border: 'none',
              color: '#22c55e',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '2px 4px',
              lineHeight: 1,
              fontWeight: 400,
              textTransform: 'none',
              letterSpacing: 0,
              minWidth: '22px',
              minHeight: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '3px',
            }}
            onClick={e => {
              e.stopPropagation();
              postMessage({ type: 'startGroup', groupName: group.name });
            }}
          >
            ▶▶
          </button>
        )}
      </div>
      {expanded && group.services.map(service => (
        <ServiceItem
          key={service.id}
          service={service}
          status={statuses[service.id] ?? 'stopped'}
          isSelected={selectedId === service.id}
          onSelect={onSelect}
          showCheckbox={showCheckboxes}
          isChecked={selectedServiceIds.has(service.id)}
          onToggle={() => onToggleService(service.id)}
        />
      ))}
    </div>
  );
}
