# Implementation Plan: Consolidated Service Controls

**Branch**: `002-consolidated-controls` | **Date**: 2026-05-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-consolidated-controls/spec.md`

## Summary

Replace the per-service control "garland" in the Run Manager webview with a single
morphing action button whose shape and ring convey the service status. `launch`-type
services show a run button plus a custom debug-bug icon at rest, with no mode
switcher — mode is chosen at launch time. `Restart` stays always-visible; the
`StatusBadge` component is removed. Internal change: the webview→extension `start`
message gains an optional `mode` field; `toggleMode` is removed.

## Technical Context

**Language/Version**: TypeScript 5.3 — extension host code and the React 18 webview.

**Primary Dependencies**: VS Code Extension API (`@types/vscode` ^1.85), React 18,
esbuild. **No new runtime dependencies** — the morphing button is a small React
component, the debug icon is an inline SVG, the starting/ready rings are pure CSS.

**Storage**: None. No persisted state added or removed (mode is no longer persisted
per-service — clarified in the spec).

**Testing**: Jest for unit tests. The existing Jest config roots at `src/` only,
not `webview/src/` — there is no webview component test harness on `main`. The plan
adds a separate Jest project for `webview/src/` (jsdom environment) for this
feature; see Phase 0 / research.md.

**Target Platform**: VS Code ^1.85, desktop. The webview runs in VS Code's Chromium
host.

**Project Type**: VS Code extension — extension host + webview.

**Performance Goals**: Button rendering is instantaneous; the starting-ring CSS
animation runs at 60 fps on commodity hardware (single `@keyframes rotate`).

**Constraints**: No backward-incompatible schema changes to `services.json`. The
webview ↔ extension message protocol change (`start.mode`, `toggleMode` removal) is
internal and atomic with this feature.

**Scale/Scope**: A typical panel holds 5–50 services.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is the unpopulated Spec Kit template — no
project-specific gates are ratified. The plan upholds the project's working
principles:

- **Test-first (Jest)** — `ActionButton` is a pure presentational component built
  against unit tests. **PASS.**
- **Isolation & small modules** — one new component (`ActionButton`), one new SVG
  component (`DebugIcon`), a focused `ServiceItem` rewrite, one deleted component
  (`StatusBadge`). No tangled responsibilities. **PASS.**
- **Simplicity / YAGNI** — no new dependencies; no persisted state; scope strictly
  per-row controls (group-level controls and the "+ New group" placement remain out
  of scope per the spec). **PASS.**

Post-Phase-1 re-check: no new violations — the design adds two small components and
trims one; the message-protocol change is one optional field plus one removed case.
**PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/002-consolidated-controls/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── visual-states.md
│   └── message-protocol.md
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
webview/src/components/
├── ActionButton.tsx          # NEW — morphing action button; appearance is pure of ServiceStatus + kind
├── ActionButton.test.tsx     # NEW — unit tests for each status × kind
├── DebugIcon.tsx             # NEW — minimal-bug SVG, colour via currentColor
└── ServiceItem.tsx           # MODIFIED — drop StatusBadge + Start/Stop/mode-toggle; use ActionButton(s); keep Restart + Remove
# webview/src/components/StatusBadge.tsx     — DELETED (ServiceItem is its only consumer, verified)

src/
├── types.ts                  # MODIFIED — WebviewMessage: `start` gains `mode?: ServiceMode`; remove `toggleMode`
└── panel/
    └── RunManagerPanel.ts    # MODIFIED — line 114 'start' handler reads `mode`; remove 'toggleMode' case (line 133)

# NEW — webview Jest project (jsdom env)
jest.webview.config.js        # NEW — separate Jest project for webview/src
webview/src/__mocks__/
└── vscodeApi.ts              # NEW — mock for postMessage in webview tests
```

**Structure Decision**: Single project, mostly webview changes. The single non-webview
change is the message-type definition (`src/types.ts`) and the panel dispatch
(`src/panel/RunManagerPanel.ts`). The webview test setup is the only meaningful new
infrastructure — a small separate Jest config in jsdom mode for `webview/src/`,
keeping the existing `src/` Jest project untouched.

## Complexity Tracking

No constitution violations — section intentionally empty.
