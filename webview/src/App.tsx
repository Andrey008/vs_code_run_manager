import React, { useEffect, useReducer, useRef, useState } from 'react';
import { ServiceTree } from './components/ServiceTree';
import { ActiveTree } from './components/ActiveTree';
import { LogTerminal } from './components/LogTerminal';
import { postMessage } from './vscodeApi';
import { allServiceIds, emptyLayout, toggleService } from '../../src/layout/activeLayout';
import type { ActiveLayout, ExtensionMessage, ServiceGroup, ServiceStatus } from './types';

interface AppState {
  groups: ServiceGroup[];
  activeLayout: ActiveLayout;
  statuses: Record<string, ServiceStatus>;
  logs: Record<string, string[]>;
  selectedId: string | null;
}

type Action =
  | { type: 'INIT'; groups: ServiceGroup[]; statuses: Record<string, ServiceStatus>; activeLayout: ActiveLayout }
  | { type: 'STATUS_UPDATE'; id: string; status: ServiceStatus }
  | { type: 'LOGS'; id: string; chunks: string[] }
  | { type: 'LOGS_REPLAY'; id: string; lines: string[] }
  | { type: 'SELECT'; id: string | null }
  | { type: 'SET_LAYOUT'; layout: ActiveLayout };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'INIT':
      return { ...state, groups: action.groups, statuses: action.statuses, activeLayout: action.activeLayout };
    case 'STATUS_UPDATE':
      return { ...state, statuses: { ...state.statuses, [action.id]: action.status } };
    case 'LOGS': {
      const prev = state.logs[action.id] ?? [];
      return { ...state, logs: { ...state.logs, [action.id]: [...prev, ...action.chunks] } };
    }
    case 'LOGS_REPLAY':
      return { ...state, logs: { ...state.logs, [action.id]: action.lines } };
    case 'SELECT':
      return { ...state, selectedId: action.id };
    case 'SET_LAYOUT':
      return { ...state, activeLayout: action.layout };
    default:
      return state;
  }
}

const initialState: AppState = {
  groups: window.initialData?.groups ?? [],
  activeLayout: emptyLayout(),
  statuses: {},
  logs: {},
  selectedId: null,
};

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [viewMode, setViewMode] = useState<'all' | 'active'>('active');
  const prevSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as ExtensionMessage;
      switch (msg.type) {
        case 'init':
          dispatch({ type: 'INIT', groups: msg.groups, statuses: msg.statuses, activeLayout: msg.activeLayout });
          break;
        case 'statusUpdate':
          dispatch({ type: 'STATUS_UPDATE', id: msg.id, status: msg.status });
          break;
        case 'logs':
          dispatch({ type: 'LOGS', id: msg.id, chunks: msg.chunks });
          break;
        case 'logsReplay':
          dispatch({ type: 'LOGS_REPLAY', id: msg.id, lines: msg.lines });
          break;
        case 'crashed':
          dispatch({ type: 'STATUS_UPDATE', id: msg.id, status: 'crashed' });
          break;
      }
    };

    window.addEventListener('message', handler);
    postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (state.selectedId && state.selectedId !== prevSelectedRef.current) {
      postMessage({ type: 'requestLogs', id: state.selectedId });
      const svc = state.groups.flatMap(g => g.services).find(s => s.id === state.selectedId);
      if (svc?.type === 'launch' || svc?.type === 'task') {
        postMessage({ type: 'showTerminal', id: state.selectedId });
      }
      prevSelectedRef.current = state.selectedId;
    }
  }, [state.selectedId, state.groups]);

  /** Applies a new Active-tab layout locally and persists it in the extension. */
  const applyLayout = (layout: ActiveLayout) => {
    dispatch({ type: 'SET_LAYOUT', layout });
    postMessage({ type: 'saveLayout', layout });
  };

  const activeIds = allServiceIds(state.activeLayout);
  const activeCount = activeIds.length;
  const allServices = state.groups.flatMap(g => g.services);
  const selectedService = allServices.find(s => s.id === state.selectedId);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: 'var(--vscode-font-family)',
      fontSize: 'var(--vscode-font-size)',
      color: 'var(--vscode-foreground)',
      background: 'var(--vscode-sideBar-background)',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vscode-panel-border)', flexShrink: 0 }}>
        <button style={tabStyle(viewMode === 'active')} onClick={() => setViewMode('active')}>
          {activeCount > 0 ? `Active (${activeCount})` : 'Active'}
        </button>
        <button style={tabStyle(viewMode === 'all')} onClick={() => setViewMode('all')}>All</button>
      </div>

      {/* Service tree */}
      <div style={{ flex: '0 0 40%', overflow: 'hidden', borderBottom: '1px solid var(--vscode-panel-border)' }}>
        {viewMode === 'active' ? (
          activeCount === 0 ? (
            <div style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--vscode-descriptionForeground)',
              fontSize: '12px',
              lineHeight: 1.6,
            }}>
              No services selected.
              <br />
              Switch to <strong>All</strong> to choose services.
            </div>
          ) : (
            <ActiveTree
              layout={state.activeLayout}
              allServices={allServices}
              statuses={state.statuses}
              selectedId={state.selectedId}
              onSelect={id => dispatch({ type: 'SELECT', id })}
              onLayoutChange={applyLayout}
            />
          )
        ) : (
          <ServiceTree
            groups={state.groups}
            statuses={state.statuses}
            selectedId={state.selectedId}
            onSelect={id => dispatch({ type: 'SELECT', id })}
            showCheckboxes
            selectedServiceIds={new Set(activeIds)}
            onToggleService={id => applyLayout(toggleService(state.activeLayout, id))}
          />
        )}
      </div>

      {/* Output header */}
      <div style={{
        padding: '5px 12px',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        flexShrink: 0,
        background: 'var(--vscode-sideBarSectionHeader-background)',
        color: 'var(--vscode-sideBarSectionHeader-foreground)',
        borderTop: '1px solid var(--vscode-panel-border)',
        userSelect: 'none',
      }}>
        {selectedService ? `Output — ${selectedService.name}` : 'Output'}
      </div>

      {/* Log terminal */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <LogTerminal serviceId={state.selectedId} serviceType={selectedService?.type ?? null} logs={state.logs} />
      </div>
    </div>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '7px 12px',
    border: 'none',
    borderBottom: active ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent',
    background: 'transparent',
    color: active ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
  };
}
