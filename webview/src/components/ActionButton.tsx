import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { DebugIcon } from './DebugIcon';
import type { ServiceMode, ServiceStatus } from '../types';

// Theme-aware colour roles. Resolve to VS Code theme variables at runtime; the
// hex fallbacks only apply if the variable is absent (e.g. in jsdom tests).
const ACTION_GREEN = 'var(--vscode-debugIcon-startForeground, #22c55e)';
const ACTION_RED = 'var(--vscode-errorForeground, #ef4444)';
const ACTION_AMBER = 'var(--vscode-problemsWarningIcon-foreground, #f59e0b)';

// Inject the ring styles once at module load (also runs cleanly under jsdom).
if (typeof document !== 'undefined') {
  const ID = 'rm-action-button-styles';
  if (!document.getElementById(ID)) {
    const style = document.createElement('style');
    style.id = ID;
    style.textContent = `
      @keyframes rm-action-spin { to { transform: rotate(360deg); } }
      .rm-action-ring {
        position: absolute;
        inset: -3px;
        border-radius: 50%;
        pointer-events: none;
      }
      .rm-action-ring-spinning {
        border: 2.5px solid transparent;
        border-top-color: var(--vscode-progressBar-background, #f59e0b);
        border-right-color: var(--vscode-progressBar-background, #f59e0b);
        animation: rm-action-spin 0.7s linear infinite;
      }
      .rm-action-ring-ready {
        border: 2.5px solid var(--vscode-debugIcon-startForeground, #22c55e);
      }
    `;
    document.head.appendChild(style);
  }
}

interface Props {
  status: ServiceStatus;
  kind: 'run' | 'debug';
  onAction: (intent: 'start' | 'stop', mode: ServiceMode) => void;
}

/**
 * The morphing action button. Its appearance is a pure function of
 * `status` × `kind`; clicking it emits the implied action.
 */
export function ActionButton({ status, kind, onAction }: Props) {
  const intent: 'start' | 'stop' =
    status === 'stopped' || status === 'crashed' ? 'start' : 'stop';
  const debugSuffix = intent === 'start' && kind === 'debug' ? ' (debug)' : '';
  const title = `${status} — click to ${intent}${debugSuffix}`;

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onAction(intent, kind === 'debug' ? 'debug' : 'run');
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={handleClick}
      style={BTN_STYLE}
    >
      <span style={WRAP_STYLE}>{renderGlyph(status, kind)}</span>
    </button>
  );
}

function renderGlyph(status: ServiceStatus, kind: 'run' | 'debug'): ReactNode {
  if (status === 'crashed') {
    return <span style={CRASH_STYLE}>⚠</span>;
  }
  if (status === 'stopped') {
    return kind === 'debug' ? <DebugIcon /> : <span style={PLAY_STYLE}>▶</span>;
  }
  // starting / running / ready — red square, with an optional ring layered on top.
  const ringClass =
    status === 'starting'
      ? 'rm-action-ring rm-action-ring-spinning'
      : status === 'ready'
        ? 'rm-action-ring rm-action-ring-ready'
        : '';
  return (
    <>
      {ringClass && <span className={ringClass} />}
      <span style={SQUARE_STYLE} />
    </>
  );
}

const BTN_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  // Inherited by `<DebugIcon>` (`currentColor`) so the bug matches the play green.
  color: ACTION_GREEN,
};
const WRAP_STYLE: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
};
const SQUARE_STYLE: CSSProperties = {
  width: 22,
  height: 22,
  background: ACTION_RED,
  borderRadius: 4,
};
const PLAY_STYLE: CSSProperties = { color: ACTION_GREEN, fontSize: 17, lineHeight: 1 };
const CRASH_STYLE: CSSProperties = { color: ACTION_AMBER, fontSize: 18, lineHeight: 1 };
