import type { CSSProperties } from 'react';
import { ActionButton } from './ActionButton';
import { postMessage } from '../vscodeApi';
import type { ServiceConfig, ServiceMode, ServiceStatus } from '../types';

interface Props {
  service: ServiceConfig;
  status: ServiceStatus;
  isSelected: boolean;
  onSelect: (id: string) => void;
  showCheckbox: boolean;
  isChecked: boolean;
  onToggle: () => void;
  /** When provided (Active tab), renders a button to drop the service from the dashboard. */
  onRemove?: () => void;
}

export function ServiceItem({
  service,
  status,
  isSelected,
  onSelect,
  showCheckbox,
  isChecked,
  onToggle,
  onRemove,
}: Props) {
  const isLaunch = service.type === 'launch';

  const handleAction = (intent: 'start' | 'stop', mode: ServiceMode) => {
    if (intent === 'start') {
      postMessage(
        isLaunch
          ? { type: 'start', id: service.id, mode }
          : { type: 'start', id: service.id },
      );
    } else {
      postMessage({ type: 'stop', id: service.id });
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 8px 5px 24px',
        cursor: 'pointer',
        background: isSelected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
        color: isSelected ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
      }}
      onClick={() => onSelect(service.id)}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          checked={isChecked}
          onChange={e => {
            e.stopPropagation();
            onToggle();
          }}
          onClick={e => e.stopPropagation()}
          style={{ cursor: 'pointer', flexShrink: 0, margin: 0 }}
        />
      )}

      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '13px',
        }}
      >
        {service.name}
      </span>

      {service.type === 'docker-compose' && (
        <span title="Docker Compose" style={{ fontSize: '13px', opacity: 0.6 }}>
          🐳
        </span>
      )}

      {!showCheckbox && (
        <>
          <ActionButton status={status} kind="run" onAction={handleAction} />

          <button
            title="Restart"
            style={iconBtnStyle('#f59e0b')}
            onClick={e => {
              e.stopPropagation();
              postMessage({ type: 'restart', id: service.id });
            }}
          >
            ↺
          </button>

          {onRemove && (
            <button
              title="Remove from Active"
              style={iconBtnStyle('var(--vscode-descriptionForeground)')}
              onClick={e => {
                e.stopPropagation();
                onRemove();
              }}
            >
              ✕
            </button>
          )}
        </>
      )}
    </div>
  );
}

function iconBtnStyle(color: string): CSSProperties {
  return {
    background: 'none',
    border: 'none',
    color,
    cursor: 'pointer',
    fontSize: '16px',
    padding: '2px 4px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '3px',
    minWidth: '22px',
    minHeight: '22px',
  };
}
