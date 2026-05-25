# Contract: Action Button Visual States

The action button's appearance is a **pure function** of the service's
`ServiceStatus` and the button's `kind` (`'run' | 'debug'`). This contract pins the
mapping so the implementation, tests, and any future reviewer agree on every cell.

## State × kind mapping

| `status` | `kind: 'run'` appearance | `kind: 'debug'` appearance | Click effect |
|----------|--------------------------|----------------------------|--------------|
| `stopped` | Green Play triangle ▶ | Green Minimal-bug SVG | Send `{ type: 'start', id, mode }` (`mode` per `kind`) |
| `starting` | Red filled square; orange ring spinning around it | Same as `kind: 'run'` | Send `{ type: 'stop', id }` |
| `running` | Red filled square, no ring | Same as `kind: 'run'` | Send `{ type: 'stop', id }` |
| `ready` | Red filled square with a steady green ring | Same as `kind: 'run'` | Send `{ type: 'stop', id }` |
| `crashed` | Amber ⚠ glyph | Same as `kind: 'run'` | Send `{ type: 'start', id, mode }` (`mode` per `kind`) |

`kind` only affects the rendered glyph in the `stopped` and `crashed` states (and the
`mode` field sent on click). Once the service is `starting`/`running`/`ready`, the
button morphs identically regardless of how it was launched.

## Style invariants

- **Play (`▶`)**: theme green (`var(--vscode-debugIcon-startForeground)` with green
  fallback), transparent background.
- **Stop square**: theme red, fill the same swatch (`var(--vscode-errorForeground)`
  fallback), rounded 4 px, ~21 px box inside a 30 px wrapper.
- **Orange ring (`starting`)**: 2.5 px border on `top` + `right` only, theme orange
  (progress-bar colour fallback), `position: absolute; inset: -3px; border-radius: 50%`,
  animated via CSS `@keyframes` `0.7s linear infinite rotate`.
- **Green ring (`ready`)**: same geometry as the orange ring, **all four borders**,
  static (no animation), theme green.
- **Warning (`⚠`, `crashed`)**: theme amber/warning glyph, no background fill.
- **Debug bug**: inline SVG, `currentColor`, the "Minimal bug" variant from the
  brainstorm — capsule body, two cut-out spots in the row background, short
  antennae, 4 stubby legs.

## Accessibility contract

- Every action button MUST carry a `title` tooltip naming the current state and the
  action — e.g. `"ready — click to stop"`, `"crashed — click to start (debug)"`.
- The button MUST be reachable and activatable via keyboard (native `<button>` —
  default browser behaviour suffices).
- State MUST NOT be conveyed by colour alone — shape carries it too (triangle ≠
  square ≠ ring ≠ warning), satisfying WCAG 1.4.1.

## Layout rules

- A non-`launch` service row renders **one** `ActionButton`, `kind: 'run'`.
- A `launch` service row renders:
  - When `status === 'stopped'` (or `'crashed'`): **two** `ActionButton`s, one with
    `kind: 'run'`, one with `kind: 'debug'`.
  - Otherwise: **one** `ActionButton` of the `kind` corresponding to how the running
    service was launched. (Stored as local UI state — the row remembers which kind
    morphed on click.)
- `Restart` (↺) is rendered after the action button(s) in **every** status — never
  conditionally hidden (FR-007, clarified 2026-05-25).
