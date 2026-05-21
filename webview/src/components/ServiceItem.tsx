import React, { useState } from 'react';
import { StatusBadge } from './StatusBadge';
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

export function ServiceItem({ service, status, isSelected, onSelect, showCheckbox, isChecked, onToggle, onRemove }: Props) {
  const [mode, setMode] = useState<ServiceMode>(service.mode ?? 'run');

  const canStart = status === 'stopped' || status === 'crashed';
  const canStop = status === 'starting' || status === 'running' || status === 'ready';
  const isLaunch = service.type === 'launch';

  function toggleMode() {
    const next: ServiceMode = mode === 'run' ? 'debug' : 'run';
    setMode(next);
    postMessage({ type: 'toggleMode', id: service.id, mode: next });
  }

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
          onChange={e => { e.stopPropagation(); onToggle(); }}
          onClick={e => e.stopPropagation()}
          style={{ cursor: 'pointer', flexShrink: 0, margin: 0 }}
        />
      )}

      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
        {service.name}
      </span>

      {service.type === 'docker-compose' && (
        <span title="Docker Compose" style={{ fontSize: '13px', opacity: 0.6 }}>🐳</span>
      )}

      <StatusBadge status={status} />

      {!showCheckbox && (
        <>
          {isLaunch && (
            <button
              title={mode === 'run' ? 'Run mode (click to switch to Debug)' : 'Debug mode (click to switch to Run)'}
              style={modeStyle(mode)}
              onClick={e => { e.stopPropagation(); toggleMode(); }}
            >
              {mode === 'run' ? '▶' : '🐛'}
            </button>
          )}

          <span style={{ display: 'flex', gap: '2px' }}>
            {canStart && (
              <button
                title="Start"
                style={btnStyle('#22c55e')}
                onClick={e => { e.stopPropagation(); postMessage({ type: 'start', id: service.id }); }}
              >
                ▶
              </button>
            )}
            {canStop && (
              <button
                title="Stop"
                style={btnStyle('#ef4444')}
                onClick={e => { e.stopPropagation(); postMessage({ type: 'stop', id: service.id }); }}
              >
                ■
              </button>
            )}
            {canStop && (
              <button
                title="Restart"
                style={btnStyle('#f59e0b')}
                onClick={e => { e.stopPropagation(); postMessage({ type: 'restart', id: service.id }); }}
              >
                ↺
              </button>
            )}
          </span>

          {onRemove && (
            <button
              title="Remove from Active"
              style={btnStyle('var(--vscode-descriptionForeground)')}
              onClick={e => { e.stopPropagation(); onRemove(); }}
            >
              ✕
            </button>
          )}
        </>
      )}
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
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

function modeStyle(mode: ServiceMode): React.CSSProperties {
  return {
    background: mode === 'debug' ? 'var(--vscode-debugIcon-startForeground, #89d185)' : 'none',
    border: '1px solid currentColor',
    borderRadius: '3px',
    color: mode === 'debug' ? 'inherit' : 'var(--vscode-descriptionForeground)',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '2px 6px',
    lineHeight: 1,
  };
}
