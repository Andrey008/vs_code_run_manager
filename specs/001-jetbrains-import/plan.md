# Implementation Plan: Import JetBrains Run Configurations

**Branch**: `001-jetbrains-import` | **Date**: 2026-05-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-jetbrains-import/spec.md`

## Summary

Add a self-contained importer that discovers JetBrains run/debug configurations in a
workspace and migrates them into `.vscode/services.json` as Run Manager services. The
importer runs through a fixed pipeline — scan → parse → map → preview → merge → report —
exposed both as a manual command and as an opt-in activation prompt. It never modifies
`launch.json`, preserves existing `services.json` content and comments, and is safe to
re-run (smart sync by origin identity, stale-marking of orphans, id-collision suffixing).

## Technical Context

**Language/Version**: TypeScript 5.3 (extension host code), targeting Node.js as bundled
by VS Code.

**Primary Dependencies**: VS Code Extension API (`@types/vscode` ^1.85). Two new runtime
dependencies: `fast-xml-parser` (parse JetBrains XML) and `jsonc-parser` (comment-
preserving edits to `services.json`). Both are pure-JS and bundled by the existing
esbuild build.

**Storage**: Filesystem — reads `.idea/runConfigurations/*.xml` and `.idea/workspace.xml`,
writes `.vscode/services.json`. `context.workspaceState` stores the activation-prompt
dismissal flag.

**Testing**: Jest for unit tests (co-located `*.test.ts`), `@vscode/test-electron` for
integration tests (`src/test/suite/`).

**Target Platform**: VS Code ^1.85, desktop.

**Project Type**: VS Code extension (single project).

**Performance Goals**: An import completes well within one minute (SC-001); parsing a few
dozen small XML files is effectively instant.

**Constraints**: MUST NOT modify `launch.json`. MUST preserve existing `services.json`
services, comments, and formatting. Fully offline — only local files.

**Scale/Scope**: A workspace typically holds 5–50 JetBrains run configurations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution file (`.specify/memory/constitution.md`) is the unpopulated
Spec Kit template — no project-specific gates are ratified. The plan therefore upholds
the project's established working principles instead:

- **Test-first (Jest)** — every pure unit (`parser`, `mapper`, `merge`) is built
  test-first with fixtures. **PASS** (designed in).
- **Isolation & small modules** — the importer is a new self-contained module of
  single-purpose units behind clear interfaces; existing discovery code is untouched.
  **PASS**.
- **Simplicity / YAGNI** — scope is bounded by the spec's Assumptions; no two-way sync,
  no compound configs, no env-file generation. **PASS**.

Post-Phase-1 re-check: no new violations — the design adds one module of small pure units
plus thin VS Code wiring; no shortcuts or added complexity. **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/001-jetbrains-import/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── commands.md
│   └── services-json-schema.md
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── jetbrains-import/         # NEW — self-contained importer module
│   ├── types.ts              # JetBrainsRunConfig, MappedService, ImportReport
│   ├── scanner.ts            # locate .idea sources, return raw XML + provenance
│   ├── scanner.test.ts
│   ├── parser.ts             # raw XML -> JetBrainsRunConfig (pure)
│   ├── parser.test.ts
│   ├── mapper.ts             # JetBrainsRunConfig -> MappedService (pure, mapping table)
│   ├── mapper.test.ts
│   ├── merge.ts              # smart-sync MappedService[] into services.json (JSONC-safe)
│   ├── merge.test.ts
│   ├── activation.ts         # activation-prompt detection + workspaceState gating
│   ├── importCommand.ts      # orchestrator: pipeline + QuickPick + report channel
│   └── __fixtures__/         # sample .idea XML + services.json fixtures
├── types.ts                  # MODIFIED — add source/originId/stale to ServiceConfigBase
└── extension.ts              # MODIFIED — register import command + activation prompt

src/test/suite/
└── jetbrainsImport.test.ts   # NEW — integration test (activation prompt, command, re-run)
```

**Structure Decision**: Single-project layout, matching the existing extension. The
feature lives in one new module, `src/jetbrains-import/`, with unit tests co-located as
`*.test.ts` (project convention, see `src/config/configParser.test.ts`). The only
existing files touched are `src/types.ts` (schema fields), `src/extension.ts` (wiring),
and `package.json` (command contribution + two dependencies).

## Complexity Tracking

No constitution violations — section intentionally empty.
