# Quickstart: Import JetBrains Run Configurations

## For the user

1. Open a workspace that was previously used in a JetBrains IDE (it contains a `.idea/`
   directory with run configurations).
2. On activation, Run Manager shows: *"Run Manager found N JetBrains run configurations.
   Import them?"* — choose **Import**. (Or run **Run Manager: Import from JetBrains** from
   the Command Palette at any time.)
3. In the preview, review the discovered configurations. Items badged **⚠ needs review**
   were imported best-effort and should be verified. Deselect anything you do not want.
4. Confirm. The selected configurations appear in the Run Manager panel under a
   **JetBrains** group, ready to start. Open the **Run Manager: JetBrains Import** output
   channel for the full per-configuration report.
5. Later, if you change configurations in the JetBrains project, run the command again —
   it updates what changed, adds what is new, and never creates duplicates.

## For the developer

**Module**: `src/jetbrains-import/`. Pipeline: `scanner` → `parser` → `mapper` →
(QuickPick) → `merge` → report. `parser`, `mapper`, and `merge` are pure and unit-tested;
`importCommand` and `activation` own all VS Code API calls.

**Run the tests**:

```bash
npm test                  # Jest unit tests (parser, mapper, merge)
npm run test:integration  # @vscode/test-electron — activation prompt, command, re-run
```

**Unit test fixtures** live in `src/jetbrains-import/__fixtures__/`:
- one `.idea` XML sample per JetBrains type, plus a malformed file;
- `services.json` samples: empty, with comments, and with a prior import.

**Manual check** (Extension Development Host):

1. Ensure `src/test/suite/` has a fixture workspace with a `.idea/` directory, or open
   any JetBrains project.
2. Press <kbd>F5</kbd> to launch the Extension Development Host.
3. Confirm the activation prompt appears, run the import, and verify `.vscode/services.json`
   gains a `JetBrains` group while existing content and comments are untouched.
4. Run the import again — confirm no duplicates and that the report lists every config.

**Done when**: all unit and integration tests pass, `npm run lint` is clean, and the
manual check above behaves as described.
