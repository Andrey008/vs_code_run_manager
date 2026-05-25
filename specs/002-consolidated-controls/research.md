# Phase 0 Research: Consolidated Service Controls

Resolves the open items from the design document and unknowns in the plan's
Technical Context.

## R1 — Webview component test harness

**Decision**: Add a **separate Jest project for `webview/src/`** with `jsdom` env in
this feature's implementation. Do not block on the `add-jest-test-suite` branch.

**Rationale**: The current Jest config (`jest.config.js`) roots at `src/` with
`testEnvironment: 'node'`. Webview components need a DOM. A separate Jest project
keeps the extension-host unit tests (node env) and the webview unit tests (jsdom env)
cleanly isolated and runnable together via `npm test`. The `add-jest-test-suite`
branch contains the webview test harness already, but is local-only and unmerged —
this plan must not depend on it landing. If that branch merges first, the configs
reconcile during the merge.

**Alternatives considered**:
- **Switch the existing Jest config to multi-project** in one shot — works but
  reshuffles the existing test setup; out of scope for this feature.
- **Wait for `add-jest-test-suite`** — couples this feature's schedule to another
  branch's review/merge; rejected.

**Concrete additions**:
- `jest.webview.config.js` — Jest project: `roots: ['<rootDir>/webview/src']`,
  `testEnvironment: 'jsdom'`, `preset: 'ts-jest'`, `moduleNameMapper` for `../vscodeApi`.
- `webview/src/__mocks__/vscodeApi.ts` — mock of `postMessage` capturing dispatched
  messages for assertions.
- `package.json` `scripts.test` extended to run both Jest projects (e.g. via
  `"test": "jest --projects jest.config.js jest.webview.config.js"`), keeping
  `npm test` as the single entry point.

## R2 — StatusBadge removal — safe to delete

**Decision**: Delete `webview/src/components/StatusBadge.tsx`.

**Rationale**: A repo-wide search confirms `ServiceItem.tsx` is the only file that
imports `StatusBadge` (`webview/src/components/StatusBadge.tsx` itself is the
definition). After the `ServiceItem` rewrite drops the import, the component has no
consumers. Closes design-doc open item #1.

## R3 — CSS animation for the "starting" ring

**Decision**: Pure CSS `@keyframes rotate` on an absolutely-positioned ring around
the action-button square — 0.7s linear infinite, GPU-accelerated `transform`.

**Rationale**: Validated visually in the brainstorming session. No JS animation
needed; CSS is performant and accessibility-friendly (`prefers-reduced-motion` can
later disable the spin if requested — out of scope here). The ring uses two
adjacent border colours (top + right) of `var(--vscode-progressBar-background)` /
fallback orange, so it reads as a clear "in-progress" indicator.

## R4 — Debug icon

**Decision**: Inline SVG, `currentColor`, ~18 px in-button — the "Minimal bug"
variant validated in the visual brainstorm (see the design document).

**Rationale**: Inline SVG keeps the icon co-located with the component, scales
crisply, inherits colour (same `currentColor` flow as `Play ▶`), and adds no
asset/bundle weight. The minimal variant survives the small button size where the
detailed bug's legs muddied. Implemented as a tiny `<DebugIcon>` component.

## R5 — Message protocol change

**Decision**: `WebviewMessage` `start` gains `mode?: ServiceMode` (`'run' | 'debug'`).
The `toggleMode` message is removed entirely. The extension's panel handler
(`RunManagerPanel.ts` line 114) reads the optional `mode`, defaulting to `'run'`,
and dispatches to the appropriate runner. The `'toggleMode'` case (line 133) is
deleted.

**Rationale**: Per the spec's Q1 clarification, mode is no longer a persisted
toggle — it is chosen at launch time. A single optional field on `start` captures
that choice cleanly; the dedicated `toggleMode` message becomes dead code.
"Start All" omits `mode` → defaults to `'run'`, matching FR-014.

**Migration**: Internal protocol — extension and webview ship in the same bundle,
so no version-skew concern. The `mode` field on the service config in
`services.json` remains as a *default* hint (no longer surfaced as a toggle) — the
webview's debug button always sends `mode: 'debug'` regardless of any default.

## R6 — `mode` field in `services.json`

**Decision**: Keep the `mode` field as a defaultable hint on `launch` services in
`services.json`, but it no longer drives any UI toggle. If present, it is the
implicit default for "Start All" of that service (still `'run'` if the field is
absent — FR-014 keeps `'run'` as the group default). The webview's per-service
debug button always explicitly sends `mode: 'debug'`.

**Rationale**: Closes design-doc open item #3. Removing the field would be a
backward-incompatible `services.json` schema change for users who already configured
it; keeping it as an optional default preserves compatibility at zero UX cost.
