# Feature Specification: Import JetBrains Run Configurations

**Feature Branch**: `001-jetbrains-import`

**Created**: 2026-05-22

**Status**: Draft

**Input**: User description: "Import JetBrains run configurations into Run Manager. On first activation (and via a manual command), detect JetBrains run/debug configurations in the workspace and migrate them into .vscode/services.json, without touching launch.json."

## Clarifications

### Session 2026-05-22

- Q: On re-import, what happens to a previously imported service whose source JetBrains configuration no longer exists? → A: Mark it as stale and keep it — never auto-delete — and surface it in the import report.
- Q: When an imported service's identifier collides with an existing service's identifier, how is it resolved? → A: Auto-suffix the imported service's identifier to make it unique; the existing service is left untouched.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Migrate JetBrains run configs through a preview (Priority: P1)

A developer moving a project from a JetBrains IDE to VS Code already has run/debug
configurations defined in that project. They open the project in VS Code, run the
Run Manager import command, review the list of discovered configurations in a preview,
deselect the few they do not want, and confirm. Run Manager writes the chosen
configurations into `.vscode/services.json`, and they immediately appear in the Run
Manager panel ready to start.

**Why this priority**: This is the core value of the feature and a viable standalone
MVP — even with nothing else, a developer can migrate their run configurations without
hand-editing any file. The single biggest friction of switching from a JetBrains IDE is
recreating run configurations; this story removes it.

**Independent Test**: Open a workspace that contains JetBrains run configurations, invoke
the import command, confirm a selection in the preview, and verify the chosen
configurations exist as runnable services in `.vscode/services.json`.

**Acceptance Scenarios**:

1. **Given** a workspace with JetBrains run configurations and no prior import, **When**
   the developer runs the import command and confirms a selection in the preview,
   **Then** the selected configurations appear as services in `.vscode/services.json`
   under a dedicated "JetBrains" group.
2. **Given** a JetBrains shell-script configuration, **When** it is imported, **Then** the
   resulting Run Manager service runs the same command the JetBrains configuration ran.
3. **Given** a configuration that cannot be fully reconstructed (for example a JVM
   application), **When** it appears in the preview, **Then** it is marked "needs review"
   so the developer knows to verify it before relying on it.
4. **Given** a configuration of a type Run Manager cannot represent, **When** the import
   runs, **Then** it is listed in the import report as skipped and is not written to
   `services.json`.
5. **Given** the developer deselects a configuration in the preview, **When** they confirm,
   **Then** that configuration is not written to `services.json`.

---

### User Story 2 - Discover JetBrains configs automatically on activation (Priority: P2)

A developer opens a JetBrains-originated project in VS Code for the first time and may
not know Run Manager can import their configurations. Run Manager detects the JetBrains
configurations and proactively offers to import them, so the developer discovers the
capability without having to look for it.

**Why this priority**: Builds on User Story 1 by making the capability discoverable.
Without it the feature still works, but only developers who already know about the
command benefit. It raises adoption at the moment it matters most — first contact.

**Independent Test**: Open a workspace containing JetBrains run configurations with no
previous import, and verify Run Manager shows a notification offering to import them.

**Acceptance Scenarios**:

1. **Given** a workspace containing JetBrains run configurations and no previous import or
   dismissal, **When** Run Manager activates, **Then** it shows a notification offering to
   import the configurations.
2. **Given** the developer chooses "Never" on the prompt, **When** Run Manager activates
   again later, **Then** the prompt is not shown again.
3. **Given** the developer previously chose "Never", **When** they run the manual import
   command, **Then** the import still proceeds normally.
4. **Given** a workspace with no JetBrains configurations, **When** Run Manager activates,
   **Then** no import prompt is shown.

---

### User Story 3 - Keep imported services in sync on re-import (Priority: P3)

A developer who already imported their JetBrains configurations later changes a
configuration in the JetBrains project files, or adds a new one. They run the import
again. Run Manager updates the services it previously imported and adds the new ones,
without creating duplicates and without disturbing services the developer wrote by hand.

**Why this priority**: Makes the feature safe to use more than once. Without it, the
first import is a one-shot migration and any later change forces manual editing or risks
duplicates. It is lower priority because the first import already delivers the core value.

**Independent Test**: Import configurations, change one JetBrains configuration, add
another, re-import, and verify the changed service is updated in place, the new one is
added, and no duplicates appear.

**Acceptance Scenarios**:

1. **Given** services were previously imported, **When** the developer changes a JetBrains
   configuration and re-imports, **Then** the corresponding service is updated in place
   and no duplicate is created.
2. **Given** the developer hand-wrote a service in `services.json`, **When** a re-import
   runs, **Then** the hand-written service is left unchanged.
3. **Given** a new JetBrains configuration was added since the last import, **When** the
   developer re-imports, **Then** the new configuration is added alongside the existing
   imported services.

---

### Edge Cases

- **No JetBrains project files**: when the workspace has no `.idea/` directory, the manual
  command reports that nothing was found and the activation prompt does not appear.
- **`.idea/` present but empty of run configs**: the import reports zero configurations
  found and writes nothing.
- **Malformed configuration file**: when one JetBrains configuration file is corrupt or
  unreadable, it is skipped and noted in the report; the remaining configurations still
  import.
- **Unmappable configuration type**: configurations Run Manager cannot represent are
  listed in the report as skipped, never written, and never silently dropped.
- **Existing `services.json` with hand-written content**: imported services are added
  without overwriting or removing any service, comment, or formatting the developer
  authored.
- **Malformed `services.json`**: when the target file cannot be safely understood, the
  import aborts the write, leaves the file untouched, and explains why.
- **Re-import with no changes**: re-running the import when nothing changed produces no
  duplicates and no spurious modifications.
- **Inline environment variables**: when a JetBrains configuration carries environment
  variables that cannot be represented directly, they are surfaced in the report as a
  manual follow-up rather than being lost silently.
- **Orphaned imported service**: when a re-import finds that a previously imported
  service's source JetBrains configuration no longer exists, the service is marked stale
  and kept — never auto-deleted — and is listed in the import report.
- **Identifier collision**: when an imported service's identifier matches that of an
  existing service, the imported identifier is automatically made unique; the existing
  service is not modified.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect JetBrains run configurations from both shared project
  files and personal workspace files within the workspace's `.idea/` directory.
- **FR-002**: System MUST, on activation, when JetBrains run configurations are present and
  the import has not previously been completed or permanently dismissed, prompt the
  developer to import them.
- **FR-003**: Developers MUST be able to start the import on demand through a manual
  command, regardless of whether the activation prompt was dismissed.
- **FR-004**: System MUST present a preview that lists every discovered configuration and
  lets the developer select or deselect which ones to import before anything is written.
- **FR-005**: System MUST map each importable JetBrains configuration to an equivalent
  Run Manager service definition.
- **FR-006**: System MUST import configurations that map cleanly directly, and MUST flag
  configurations that cannot be fully reconstructed as "needs review" in both the preview
  and the report.
- **FR-007**: System MUST report configurations it cannot map at all as skipped, and MUST
  NOT write them to `services.json`.
- **FR-008**: System MUST write imported services into `.vscode/services.json` and MUST
  NOT modify `launch.json`.
- **FR-009**: System MUST preserve the existing services, comments, and formatting of an
  existing `services.json` file when adding imported services.
- **FR-010**: System MUST NOT overwrite or remove any service the developer authored by
  hand.
- **FR-011**: System MUST record which services it imported so that a later re-import
  updates those services in place, adds newly discovered configurations, and produces no
  duplicates.
- **FR-012**: System MUST place imported services under a dedicated, clearly named group
  within `services.json`.
- **FR-013**: System MUST, after an import, present a summary report stating how many
  configurations were imported, flagged as needs-review, and skipped, with per-config
  detail available.
- **FR-014**: System MUST handle a malformed or unreadable configuration file by skipping
  it and noting it in the report, without aborting the rest of the import.
- **FR-015**: System MUST abort the write and leave `services.json` intact if that file
  cannot be safely understood.
- **FR-016**: System MUST treat a permanent dismissal of the activation prompt as
  suppressing only future automatic prompts, never the manual command.
- **FR-017**: System MUST account for every discovered configuration in the report —
  imported, needs-review, or skipped — so that none is silently dropped.
- **FR-018**: System MUST, on re-import, mark a previously imported service whose source
  JetBrains configuration no longer exists as stale and retain it; such a service MUST
  NOT be deleted automatically and MUST be reported to the developer.
- **FR-019**: System MUST, when an imported service's identifier would collide with an
  existing service's identifier, automatically adjust the imported identifier to a unique
  value; the existing service MUST be left untouched.

### Key Entities *(include if feature involves data)*

- **JetBrains Run Configuration**: a run or debug configuration defined in the JetBrains
  project. Has a name, a type, and type-specific settings such as a command, script,
  task list, working directory, or environment variables. Originates from either a shared
  project file or a personal workspace file.
- **Run Manager Service**: an entry in `services.json` describing a runnable process —
  the import target. Carries an identifier, a display name, a service type, and the
  details needed to run it.
- **Import Mapping**: the correspondence between one JetBrains Run Configuration and one
  Run Manager Service, together with a confidence level — clean, needs-review, or
  unmapped — and any notes for the developer.
- **Import Report**: the per-run summary describing, for every discovered configuration,
  whether it was imported, flagged as needs-review, or skipped, and why.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can migrate their JetBrains run configurations into Run Manager
  in under one minute, without hand-editing any file.
- **SC-002**: Every cleanly mappable configuration type (shell scripts, package-script
  runners, common build-tool tasks, and single Compose services) produces a Run Manager
  service that starts the same process the JetBrains configuration did.
- **SC-003**: Re-running the import never produces a duplicate service.
- **SC-004**: Existing hand-written content in `services.json` — services, comments, and
  formatting — is preserved across every import, with zero data loss.
- **SC-005**: No import run modifies `launch.json`.
- **SC-006**: A malformed JetBrains configuration file never aborts an import; all
  remaining configurations still import successfully.
- **SC-007**: Every discovered configuration is accounted for in the import report, with
  no silent drops.

## Assumptions

- The target user is a developer migrating a project from a JetBrains IDE to VS Code who
  already has run/debug configurations defined in that project.
- Run Manager already supports `services.json` with shell-command and single-Compose
  service types; the import reuses these existing capabilities rather than introducing new
  service types.
- `launch.json` retains higher discovery priority in Run Manager, so imported
  configurations are written to the lower-priority `services.json` to avoid conflicting
  with it.
- JVM application and Spring Boot configurations cannot be fully reconstructed without the
  JetBrains project model; they are imported on a best-effort basis and flagged for
  developer review.
- Compound run configurations, two-way synchronization (Run Manager back to JetBrains),
  and generating environment files from inline environment variables are out of scope for
  the first version.
- Inline environment variables that cannot be represented directly are surfaced to the
  developer as a manual follow-up rather than applied automatically.
- The activation prompt's dismissal state is remembered per workspace.
