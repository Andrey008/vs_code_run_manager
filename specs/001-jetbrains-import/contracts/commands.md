# Contract: Commands & Activation

The interfaces this feature exposes to the user through VS Code.

## Command — `runManager.importFromJetBrains`

**Contributed in** `package.json` under `contributes.commands`.

| Field | Value |
|-------|-------|
| `command` | `runManager.importFromJetBrains` |
| `title` | `Run Manager: Import from JetBrains` |

**Behavior**:

1. Always available from the Command Palette, regardless of the activation-prompt
   dismissal state (FR-003, FR-016).
2. Runs the full pipeline: scan → parse → map → preview → merge → report.
3. If no `.idea/` directory or no configurations are found, shows an information message
   ("No JetBrains run configurations found") and writes nothing.

## Activation prompt

**Trigger**: extension `activate()`.

**Precondition to show**: a `.idea/` directory exists in the workspace, **at least one
run configuration is discovered** within it, AND `context.workspaceState` has neither
`jetbrainsImport.done` nor `jetbrainsImport.dismissed` set. (The notification text states
the discovered count, so a non-zero count is required — matches spec FR-002.)

**UI**: an information notification — *"Run Manager found N JetBrains run configurations.
Import them?"* — with three actions:

| Action | Effect |
|--------|--------|
| `Import` | Runs the same pipeline as the command. On success, sets `jetbrainsImport.done`. |
| `Not now` | Dismisses; no state written — the prompt re-appears next activation. |
| `Never` | Sets `jetbrainsImport.dismissed`; the prompt never shows again for this workspace. |

## Preview (QuickPick)

A multi-select QuickPick shown before any write.

- One item per discovered configuration: label = config name, description = target
  service type, detail/badge = mapping confidence (`✓` clean, `⚠ needs review`).
- `unmapped` configurations appear as disabled, non-selectable informational rows.
- `clean` and `needs-review` items are pre-selected.
- Confirming writes only the selected items; cancelling writes nothing.

## Import report

After a write (or an aborted write):

- An information notification with the summary counts (`imported / needs-review /
  skipped / stale`), or an error notification when the write was aborted.
- A dedicated **"Run Manager: JetBrains Import"** Output channel containing one line per
  `ImportReportEntry` — every discovered configuration accounted for (FR-013, FR-017).

## Workspace state keys

| Key (`context.workspaceState`) | Type | Meaning |
|--------------------------------|------|---------|
| `jetbrainsImport.done` | `boolean` | An import completed in this workspace. |
| `jetbrainsImport.dismissed` | `boolean` | The developer chose "Never". |
