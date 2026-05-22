---
description: "Task list for Import JetBrains Run Configurations"
---

# Tasks: Import JetBrains Run Configurations

**Input**: Design documents from `specs/001-jetbrains-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — the project mandates TDD (Jest unit + `@vscode/test-electron`
integration). Write each test task FIRST and confirm it FAILS before implementing.

**Organization**: Tasks are grouped by user story so each story is an independently
testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 — the user story the task serves

## Path Conventions

Single project. New module at `src/jetbrains-import/`; unit tests co-located as
`*.test.ts`; integration tests in `src/test/suite/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and module skeleton.

- [ ] T001 Add `fast-xml-parser` and `jsonc-parser` to `dependencies` in `package.json` and run `npm install`
- [ ] T002 [P] Create the module folders `src/jetbrains-import/` and `src/jetbrains-import/__fixtures__/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schema, types, and fixtures every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T003 Add optional `source`, `originId`, and `stale` fields to `ServiceConfigBase` in `src/types.ts`
- [ ] T004 Define importer types (`JetBrainsRunConfig`, `MappingConfidence`, `MappedService`, `ImportReportEntry`, `ImportReport`) in `src/jetbrains-import/types.ts` (depends on T003)
- [ ] T005 [P] Create unit-test fixtures in `src/jetbrains-import/__fixtures__/` — one `.idea` run-config XML per JetBrains type, one malformed XML file, and `services.json` samples (empty, with comments, with a prior import)

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 - Migrate JetBrains run configs through a preview (Priority: P1) 🎯 MVP

**Goal**: A developer runs the manual import command, reviews a preview, confirms, and the
selected JetBrains configurations are written into `.vscode/services.json` under a
`JetBrains` group — preserving any existing content.

**Independent Test**: Open a workspace with JetBrains run configurations, run
`Run Manager: Import from JetBrains`, confirm a selection, and verify the chosen
configurations exist as runnable services in `.vscode/services.json`.

### Tests for User Story 1 ⚠️ (write first, confirm they FAIL)

- [ ] T006 [P] [US1] Unit tests for the scanner in `src/jetbrains-import/scanner.test.ts` — finds `runConfigurations/*.xml` and `workspace.xml`, tags provenance, handles a missing `.idea/`
- [ ] T007 [P] [US1] Unit tests for the parser in `src/jetbrains-import/parser.test.ts` — each type fixture parses to a `JetBrainsRunConfig`, default template entries are skipped, malformed XML yields null
- [ ] T008 [P] [US1] Unit tests for the mapper in `src/jetbrains-import/mapper.test.ts` — clean / needs-review / unmapped confidence per type and correct command construction (per `research.md` R4)
- [ ] T009 [P] [US1] Unit tests for first-import merge in `src/jetbrains-import/merge.test.ts` — writes a `JetBrains` group, preserves existing services and comments, creates the file when absent, suffixes a colliding `id`, aborts on malformed `services.json`

### Implementation for User Story 1

- [ ] T010 [P] [US1] Implement the scanner in `src/jetbrains-import/scanner.ts` — locate `.idea/runConfigurations/*.xml` and `.idea/workspace.xml`, return raw XML with `shared`/`personal` provenance
- [ ] T011 [P] [US1] Implement the parser in `src/jetbrains-import/parser.ts` — raw XML → `JetBrainsRunConfig` via `fast-xml-parser`, skip `default="true"` templates, return null on malformed input
- [ ] T012 [P] [US1] Implement the mapper in `src/jetbrains-import/mapper.ts` — `JetBrainsRunConfig` → `MappedService` using the static mapping table and confidence levels
- [ ] T013 [US1] Implement first-import merge in `src/jetbrains-import/merge.ts` — JSONC-safe write into the `JetBrains` group with `jsonc-parser`, preserve existing content, suffix colliding ids, abort on malformed `services.json` (depends on T003, T004)
- [ ] T014 [US1] Implement the orchestrator in `src/jetbrains-import/importCommand.ts` — run scan → parse → map, show the multi-select QuickPick preview, call merge, build and present the `ImportReport` (notification + "Run Manager: JetBrains Import" Output channel) (depends on T010–T013)
- [ ] T015 [US1] Register the `runManager.importFromJetBrains` command in `src/extension.ts` and contribute it under `contributes.commands` in `package.json` (depends on T014)

**Checkpoint**: The manual import command works end-to-end — MVP is functional.

---

## Phase 4: User Story 2 - Discover JetBrains configs automatically on activation (Priority: P2)

**Goal**: On activation, when a `.idea/` directory holds run configurations and the import
was not completed or permanently dismissed, Run Manager offers to import them.

**Independent Test**: Open a workspace containing JetBrains run configurations with no
previous import, and verify Run Manager shows the import notification.

### Tests for User Story 2 ⚠️ (write first, confirm they FAIL)

- [ ] T016 [P] [US2] Unit tests for activation gating in `src/jetbrains-import/activation.test.ts` — prompt shown when `.idea/` exists and no flag is set, suppressed by `jetbrainsImport.done` or `jetbrainsImport.dismissed`, no `.idea/` means no prompt

### Implementation for User Story 2

- [ ] T017 [US2] Implement activation gating in `src/jetbrains-import/activation.ts` — detect `.idea/`, read `workspaceState` flags, show the Import / Not now / Never notification (depends on T004)
- [ ] T018 [US2] Wire the activation prompt into `activate()` in `src/extension.ts` — invoke the pipeline on Import, set `jetbrainsImport.done` on success and `jetbrainsImport.dismissed` on Never (depends on T014, T017)

**Checkpoint**: Opening a JetBrains workspace surfaces the import prompt; US1 still works.

---

## Phase 5: User Story 3 - Keep imported services in sync on re-import (Priority: P3)

**Goal**: Re-running the import updates previously imported services in place, adds new
ones, marks orphans stale, and never creates duplicates or touches hand-written services.

**Independent Test**: Import configurations, change one JetBrains config, add another,
delete a third, re-import, and verify the changed service is updated in place, the new one
added, the orphan marked stale, hand-written services untouched, and no duplicates.

### Tests for User Story 3 ⚠️ (write first, confirm they FAIL)

- [ ] T019 [P] [US3] Extend `src/jetbrains-import/merge.test.ts` with smart-sync cases — re-import matches by `source`+`originId` and updates in place, adds new configs, marks orphaned imported services `stale`, never duplicates, never modifies hand-written services

### Implementation for User Story 3

- [ ] T020 [US3] Extend merge in `src/jetbrains-import/merge.ts` with smart-sync — match existing services by `source`+`originId`, update in place, add new, mark orphaned imported services `stale: true` without deleting (FR-011, FR-018) (depends on T013)
- [ ] T021 [US3] Update `src/jetbrains-import/importCommand.ts` so the report distinguishes `updated` and `stale` outcomes (depends on T014, T020)

**Checkpoint**: Re-import is idempotent and safe; all three stories work independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end verification and release-facing updates.

- [ ] T022 [P] Add an integration test in `src/test/suite/jetbrainsImport.test.ts` — activation prompt fires against a `.idea/` fixture workspace, the command writes `services.json`, and a second run produces no duplicates
- [ ] T023 [P] Exclude `specs/` and `src/**/__fixtures__/` from the published package in `.vscodeignore`
- [ ] T024 [P] Document the JetBrains import feature in `README.md`
- [ ] T025 Add a CHANGELOG.md entry for the JetBrains import feature
- [ ] T026 Run quickstart.md validation — `npm test`, `npm run lint`, and the F5 manual check

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: each depends only on Foundational. US1 is the MVP; US2
  and US3 reuse US1's pipeline, so in practice US1 is implemented first.
- **Polish (Phase 6)**: depends on the user stories being complete.

### User Story Dependencies

- **US1 (P1)**: depends on Foundational only. Standalone MVP.
- **US2 (P2)**: depends on Foundational; reuses US1's `importCommand` pipeline (T014).
- **US3 (P3)**: depends on Foundational; extends US1's `merge.ts` (T013) and
  `importCommand.ts` (T014).

### Within Each User Story

- Test tasks are written and confirmed failing before the matching implementation.
- Types/fixtures (Foundational) before any unit.
- `scanner`, `parser`, `mapper` before `merge`; `merge` before `importCommand`;
  `importCommand` before the `extension.ts` wiring.

### Parallel Opportunities

- T002 runs parallel to T001.
- T005 (fixtures) runs parallel to T003/T004.
- US1 tests T006–T009 all run in parallel (separate files).
- US1 implementation T010–T012 (`scanner`, `parser`, `mapper`) run in parallel; T013
  (`merge`) follows; T014 (`importCommand`) follows.
- Polish tasks T022–T024 run in parallel.

---

## Parallel Example: User Story 1

```text
# Write all US1 unit tests together (they must fail first):
Task: "Unit tests for the scanner in src/jetbrains-import/scanner.test.ts"
Task: "Unit tests for the parser in src/jetbrains-import/parser.test.ts"
Task: "Unit tests for the mapper in src/jetbrains-import/mapper.test.ts"
Task: "Unit tests for first-import merge in src/jetbrains-import/merge.test.ts"

# Then implement the pure pipeline units together:
Task: "Implement the scanner in src/jetbrains-import/scanner.ts"
Task: "Implement the parser in src/jetbrains-import/parser.ts"
Task: "Implement the mapper in src/jetbrains-import/mapper.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup.
2. Phase 2: Foundational (blocks everything).
3. Phase 3: User Story 1.
4. **STOP and VALIDATE** — run the manual import command end-to-end.
5. Demo: a developer can migrate JetBrains configs.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → test independently → MVP.
3. US2 → test independently → discoverability.
4. US3 → test independently → safe re-import.
5. Polish → integration test + release-facing docs.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Confirm every test FAILS before implementing against it.
- `merge.ts` and `importCommand.ts` are touched by more than one story — US3 extends what
  US1 created; sequence those tasks accordingly.
- Commit after each task or logical group.
- Existing discovery code (`src/config/`) is not modified.
