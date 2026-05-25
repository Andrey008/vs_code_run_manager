---
description: "Task list for Consolidated Service Controls"
---

# Tasks: Consolidated Service Controls

**Input**: Design documents from `specs/002-consolidated-controls/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — TDD per project standard. Write each test task FIRST and confirm
it FAILS before implementing.

**Organization**: Tasks are grouped by user story so each story is an independently
testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 — the user story the task serves

## Path Conventions

VS Code extension single project. Webview React components in `webview/src/components/`,
unit tests co-located as `*.test.tsx`. Extension code in `src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up a webview Jest project so React components can be unit-tested,
and install supporting libraries.

- [ ] T001 Add `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` to `devDependencies` in `package.json` and run `npm install`
- [ ] T002 [P] Create `jest.webview.config.js` — separate Jest project: `roots: ['<rootDir>/webview/src']`, `testEnvironment: 'jsdom'`, `preset: 'ts-jest'`, `moduleNameMapper` for the `../vscodeApi` import
- [ ] T003 Update `package.json` `scripts.test` to run both projects: `jest --projects jest.config.js jest.webview.config.js`
- [ ] T004 [P] Create `webview/src/__mocks__/vscodeApi.ts` — mock `postMessage` capturing dispatched messages for test assertions

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire the new message protocol both stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T005 Update `WebviewMessage` in `src/types.ts` — add `mode?: ServiceMode` to the `start` variant; remove the `toggleMode` variant entirely
- [ ] T006 Update `src/panel/RunManagerPanel.ts` — `case 'start'` reads `message.mode` (default `'run'` for `launch` services); delete `case 'toggleMode'` (currently line 133); ensure `case 'startGroup'` launches `launch` services in their `services.json` `mode` default (else `'run'`, per FR-014) (depends on T005)

**Checkpoint**: Protocol & wiring ready — user story implementation can begin.

---

## Phase 3: User Story 1 - Morphing action button replaces the garland (Priority: P1) 🎯 MVP

**Goal**: Every service row presents a single `ActionButton` whose shape and ring
convey the status — the standalone `StatusBadge` and the legacy Start/Stop/mode
buttons are gone. `Restart` is always visible. For `launch` services in this slice
the single Play action button is shown (debug for launch lands in US2).

**Independent Test**: Open the Run Manager panel with services in different states
and confirm every service's state is identifiable from its action button alone
(no text badge), and clicking the button starts or stops the service.

### Tests for User Story 1 ⚠️ (write first, confirm they FAIL)

- [ ] T007 [P] [US1] `ActionButton` unit tests in `webview/src/components/ActionButton.test.tsx` — for each `status × kind` cell (5 × 2 = 10) assert the rendered shape/ring/glyph per `contracts/visual-states.md`; assert the `title` tooltip names the state and action; assert click sends the correct `start` (with `mode`) or `stop` message via the `vscodeApi` mock
- [ ] T008 [P] [US1] `ServiceItem` unit tests in `webview/src/components/ServiceItem.test.tsx` — a non-`launch` row renders one `ActionButton` (`kind='run'`) + `Restart` + no `StatusBadge`; `Restart` is visible in every status (`stopped`, `starting`, `running`, `ready`, `crashed`) per FR-007

### Implementation for User Story 1

- [ ] T009 [P] [US1] Implement `webview/src/components/DebugIcon.tsx` — minimal-bug SVG, `currentColor`, the markup from `docs/superpowers/specs/2026-05-22-consolidated-controls-design.md`
- [ ] T010 [US1] Implement `webview/src/components/ActionButton.tsx` — props `{ status, kind, onAction }`; renders Play / Stop-square / spinning-orange-ring / steady-green-ring / amber-⚠ per the visual-states contract; uses `<DebugIcon>` for `kind='debug'` glyphs; CSS `@keyframes` for the starting ring; `title` tooltip per `contracts/visual-states.md`; click handler invokes `onAction(intent, mode)` (depends on T009)
- [ ] T011 [US1] Rewrite `webview/src/components/ServiceItem.tsx` — drop the `StatusBadge` import and the legacy Start/Stop/mode-toggle buttons; render one `ActionButton` (`kind='run'`) for every service (launch debug arrives in US2); always render `Restart` (FR-007); keep the existing `Remove` button for the Active tab; wire `onAction` to post `start` / `stop` via `postMessage` (depends on T010)
- [ ] T012 [US1] Delete `webview/src/components/StatusBadge.tsx` (only consumer was `ServiceItem`, verified in research R2) (depends on T011)

**Checkpoint**: The morphing button works end-to-end for all services in run mode — MVP functional.

---

## Phase 4: User Story 2 - Run/debug for `launch` services without a switcher (Priority: P2)

**Goal**: A `launch` service at rest shows two `ActionButton`s — run and debug.
Clicking either launches the service in that mode; the clicked one morphs through
`starting → running/ready`, the other hides while not stopped, both reappear on
return to stopped.

**Independent Test**: Open the panel with a `launch` service, confirm two buttons
at rest, click debug, verify the service starts in debug mode and only the active
button shows while running; stop, verify both reappear.

### Tests for User Story 2 ⚠️ (write first, confirm they FAIL)

- [ ] T013 [P] [US2] Extend `webview/src/components/ServiceItem.test.tsx` for `launch` services — at `status='stopped'` and `'crashed'` two `ActionButton`s render (one `kind='run'`, one `kind='debug'`); while `status` is not stopped, only the active button is rendered; both reappear when status returns to `stopped`
- [ ] T014 [P] [US2] Click tests in `webview/src/components/ServiceItem.test.tsx` — clicking the debug `ActionButton` on a `launch` service posts `{ type: 'start', id, mode: 'debug' }`; clicking run posts `{ type: 'start', id, mode: 'run' }`

### Implementation for User Story 2

- [ ] T015 [US2] Extend `webview/src/components/ServiceItem.tsx` — for `launch` services render run + debug `ActionButton`s at rest; track local "active kind" state (which button was last clicked); while not stopped, render only the active button; both reappear on return to `stopped`; non-`launch` services keep the single-button rendering from US1 (depends on T011)

**Checkpoint**: Run and debug for `launch` services both work without a mode switcher.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Release-facing updates and end-to-end verification.

- [ ] T016 [P] Add an `## [Unreleased]` entry in `CHANGELOG.md` for the Consolidated controls feature (Keep a Changelog format)
- [ ] T017 [P] Update `README.md` — mention the morphing action button and the run/debug two-button layout for `launch` services
- [ ] T018 Run quickstart validation per `quickstart.md` — `npm test` (both Jest projects green), `npm run lint`, `npm run build`, and the F5 Extension Development Host manual check

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–4)**: each depends on Foundational. US1 is the MVP; US2
  extends the `ServiceItem` produced in US1 (T011).
- **Polish (Phase 5)**: depends on the user stories.

### User Story Dependencies

- **US1 (P1)**: depends on Foundational only. Standalone MVP.
- **US2 (P2)**: depends on Foundational and on **US1's T011** (the new
  `ServiceItem`).

### Within Each User Story

- Test tasks written and confirmed failing before the matching implementation.
- `DebugIcon` (T009) before `ActionButton` (T010) before `ServiceItem` rewrite (T011)
  before `StatusBadge` deletion (T012).

### Parallel Opportunities

- T002 and T004 run in parallel.
- T007, T008 (US1 tests) run in parallel.
- T009 runs in parallel with the US1 tests; T010 → T011 → T012 are sequential.
- T013, T014 (US2 tests) run in parallel.
- T016, T017 (polish docs) run in parallel.

---

## Parallel Example: User Story 1

```text
# Write US1 unit tests together (they must fail first):
Task: "ActionButton unit tests in webview/src/components/ActionButton.test.tsx"
Task: "ServiceItem unit tests for non-launch in webview/src/components/ServiceItem.test.tsx"

# Then implement DebugIcon in parallel; ActionButton and ServiceItem are sequential:
Task: "Implement DebugIcon in webview/src/components/DebugIcon.tsx"
Task: "Implement ActionButton in webview/src/components/ActionButton.tsx"
Task: "Rewrite ServiceItem in webview/src/components/ServiceItem.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (webview Jest project + libraries).
2. Phase 2: Foundational (`start.mode`, drop `toggleMode`, group default).
3. Phase 3: User Story 1.
4. **STOP and VALIDATE** — F5 the dev host; confirm every service's state is
   readable from its action button and click starts/stops it; confirm `Restart`
   is always visible.
5. Demo: the panel is no longer a "garland".

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → test independently → MVP (run-mode only for launch services).
3. US2 → test independently → debug button for `launch` services.
4. Polish → CHANGELOG + README + full validation.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Confirm every test FAILS before implementing against it.
- The webview Jest project (T002) and the `vscodeApi` mock (T004) unblock every
  webview test on this branch.
- `ServiceItem.tsx` is touched by both US1 (T011, rewrite) and US2 (T015, extend);
  US2 must follow US1.
- Restart's always-visible behavior (FR-007 clarified) is folded into T011 (US1).
- Commit after each task or logical group.
