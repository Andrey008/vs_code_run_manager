import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { DebugIcon } from './DebugIcon';
import type { ServiceMode, ServiceStatus } from '../types';

// Theme-aware colour roles. Resolve to VS Code theme variables at runtime; the
// hex fallbacks only apply if the variable is absent (e.g. in jsdom tests).
const ACTION_GREEN = 'var(--vscode-debugIcon-startForeground, #22c55e)';
// Vivid red instead of `--vscode-errorForeground` — the theme variable is a
// desaturated salmon in default themes; the Stop swatch needs presence.
const ACTION_RED = '#dc2626';
const ACTION_AMBER = 'var(--vscode-problemsWarningIcon-foreground, #f59e0b)';

// The ring CSS lives in `actionButtonStyles.ts` and is rendered once by `App`
// with the webview's CSP nonce — see ./actionButtonStyles.ts for the why.

interface Props {
  status: ServiceStatus;
  kind: 'run' | 'debug';
  onAction: (intent: 'start' | 'stop', mode: ServiceMode) => void;
  /**
   * When true and the service is `crashed`, render the kind glyph (Play or
   * Bug) in amber instead of the universal ⚠. Used by the `launch` two-button
   * pair so a crashed launch service shows symmetric retry buttons rather
   * than `⚠ ⚠`.
   */
  inLaunchPair?: boolean;
}

/**
 * The morphing action button. Its appearance is a pure function of
 * `status` × `kind` (× `inLaunchPair` for the crashed-launch case);
 * clicking it emits the implied action.
 */
export function ActionButton({ status, kind, onAction, inLaunchPair = false }: Props) {
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
      <span style={WRAP_STYLE}>{renderGlyph(status, kind, inLaunchPair)}</span>
    </button>
  );
}

function renderGlyph(
  status: ServiceStatus,
  kind: 'run' | 'debug',
  inLaunchPair: boolean,
): ReactNode {
  if (status === 'crashed') {
    if (inLaunchPair) {
      // Symmetric "retry in this mode" — shape tells you the mode, colour
      // tells you the last run crashed.
      return kind === 'debug' ? (
        <span style={DEBUG_AMBER_STYLE}>
          <DebugIcon />
        </span>
      ) : (
        <span style={PLAY_AMBER_STYLE}>▶</span>
      );
    }
    return <span style={CRASH_STYLE}>⚠</span>;
  }
  if (status === 'stopped') {
    return kind === 'debug' ? <DebugIcon /> : <span style={PLAY_STYLE}>▶</span>;
  }
  // starting / running / ready — red square, with an optional ring layered on top.
  if (status === 'starting') {
    return (
      <>
        <span className="rm-action-ring">
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              className="rm-action-tick"
              style={{ ['--i' as string]: i } as CSSProperties}
            />
          ))}
        </span>
        <span style={SQUARE_STYLE} />
      </>
    );
  }
  if (status === 'ready') {
    return (
      <>
        <span className="rm-action-ring rm-action-ring-ready" />
        <span style={SQUARE_STYLE} />
      </>
    );
  }
  // running — just the red square, no ring.
  return <span style={SQUARE_STYLE} />;
}

const BTN_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  // Inherited by `<DebugIcon>` (`currentColor`) so the bug matches the play green.
  color: ACTION_GREEN,
};
const WRAP_STYLE: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
};
const SQUARE_STYLE: CSSProperties = {
  width: 14,
  height: 14,
  background: ACTION_RED,
  borderRadius: 3,
};
const PLAY_STYLE: CSSProperties = { color: ACTION_GREEN, fontSize: 12, lineHeight: 1 };
const CRASH_STYLE: CSSProperties = { color: ACTION_AMBER, fontSize: 14, lineHeight: 1 };
const PLAY_AMBER_STYLE: CSSProperties = { color: ACTION_AMBER, fontSize: 12, lineHeight: 1 };
const DEBUG_AMBER_STYLE: CSSProperties = { color: ACTION_AMBER, display: 'inline-flex', lineHeight: 1 };
