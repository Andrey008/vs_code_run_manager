import { useEffect, useState } from 'react';
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
  const [activeKind, setActiveKind] = useState<'run' | 'debug' | null>(null);

  // Reset activeKind when the service returns to a non-running state so the
  // run + debug pair reappears (FR-009) and no stale kind lingers.
  useEffect(() => {
    if (status === 'stopped' || status === 'crashed') {
      setActiveKind(null);
    }
  }, [status]);

  const handleAction = (intent: 'start' | 'stop', mode: ServiceMode) => {
    if (intent === 'start') {
      // Remember which kind launched this — drives the single-button display
      // while the service is not stopped.
      if (isLaunch) setActiveKind(mode);
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
          {renderActionButtons(isLaunch, status, activeKind, handleAction)}

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

function renderActionButtons(
  isLaunch: boolean,
  status: ServiceStatus,
  activeKind: 'run' | 'debug' | null,
  onAction: (intent: 'start' | 'stop', mode: ServiceMode) => void,
) {
  // Non-launch services: a single morphing action button.
  if (!isLaunch) {
    return <ActionButton status={status} kind="run" onAction={onAction} />;
  }
  // Launch services at rest: two buttons (run + debug) — pick at launch time.
  if (status === 'stopped' || status === 'crashed') {
    return (
      <>
        <ActionButton status={status} kind="run" onAction={onAction} />
        <ActionButton status={status} kind="debug" onAction={onAction} />
      </>
    );
  }
  // Launch services not stopped: only the active button is shown. `null` (e.g.
  // after a webview reload while the service is running) falls back to `run`
  // — documented edge case in spec.md.
  return <ActionButton status={status} kind={activeKind ?? 'run'} onAction={onAction} />;
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
