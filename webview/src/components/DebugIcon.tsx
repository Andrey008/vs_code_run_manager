interface Props {
  size?: number;
  /** Colour for the two cut-out spots. Defaults to the panel background. */
  spotColor?: string;
}

/**
 * Minimal-bug SVG used as the debug action's at-rest glyph.
 * Colour inherits via `currentColor` so the button's `color` drives the bug colour.
 */
export function DebugIcon({ size = 18, spotColor = 'var(--vscode-editor-background, #2a2d2e)' }: Props) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <rect x="7" y="7.5" width="10" height="13" rx="5" fill="currentColor" />
      <path
        d="M9.2 6.2 L7.7 3.4 M14.8 6.2 L16.3 3.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M7 11.5 L3.4 10.8 M7 16 L3.4 16.8 M17 11.5 L20.6 10.8 M17 16 L20.6 16.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="10" cy="12" r="1.25" fill={spotColor} />
      <circle cx="14" cy="12" r="1.25" fill={spotColor} />
    </svg>
  );
}
