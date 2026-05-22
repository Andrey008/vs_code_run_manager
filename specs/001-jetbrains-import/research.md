# Phase 0 Research: Import JetBrains Run Configurations

Resolves the open items carried from the design document and the unknowns in the plan's
Technical Context.

## R1 — XML parsing library

**Decision**: Use `fast-xml-parser`.

**Rationale**: JetBrains stores run configurations as XML. `fast-xml-parser` is pure
JavaScript (no native add-ons), small, fast, bundles cleanly with the project's existing
esbuild build, and exposes attributes and child elements as a plain object tree — a good
fit for the pure, testable `parser.ts` unit.

**Alternatives considered**:
- `xml2js` — callback/promise API, heavier, more configuration surface.
- `@xmldom/xmldom` — full DOM API; correct but verbose to traverse for a fixed, known
  schema.
- Hand-rolled regex parsing — rejected; XML is not a regular language and JetBrains files
  vary enough to make this fragile.

## R2 — Comment-preserving writes to `services.json`

**Decision**: Add `jsonc-parser` and edit `services.json` with its `modify()` +
`applyEdits()` functions.

**Rationale**: `services.json` is JSONC. The project today only *reads* it — `configParser.ts`
has a hand-rolled `stripJsoncComments()` that discards comments before `JSON.parse`. That
is fine for reading but unusable for writing: regenerating the file would destroy the
developer's comments and formatting, violating FR-009. `jsonc-parser` (maintained by
Microsoft, used inside VS Code itself) computes minimal text edits that insert/update
values while leaving surrounding comments and whitespace intact.

**Alternatives considered**:
- `comment-json` — parses to a commented object and re-stringifies; can still reflow
  formatting and is less surgical than edit-based modification.
- Reuse `stripJsoncComments` + `JSON.stringify` — rejected; guarantees comment loss.

## R3 — JetBrains run configuration file format

**Decision**: Read configurations from two sources, parsed with the same per-type logic.

**Findings**:
- **Shared configs**: `.idea/runConfigurations/*.xml`. Each file holds one
  `<component name="ProjectRunConfigurationManager">` with a single `<configuration
  name="..." type="..." factoryName="...">` element.
- **Personal configs**: `.idea/workspace.xml`, inside `<component name="RunManager">`,
  holding multiple `<configuration>` elements (plus `default="true"` template entries,
  which MUST be skipped).
- Per-type payload (the `type` attribute drives mapping):
  - `ShConfigurationType` — `SCRIPT_PATH`, `SCRIPT_OPTIONS`, `SCRIPT_WORKING_DIRECTORY`,
    `INTERPRETER_PATH` as `<option>` elements.
  - `js.build_tools.npm` — `<command>`, `<scripts>`, `package.json` path.
  - `NodeJSConfigurationType` — `path-to-js-file`, `node-parameters`,
    `application-parameters`, `working-dir`.
  - `GradleRunConfiguration` — `ExternalSystemSettings` with `taskNames` and
    `externalProjectPath`.
  - `MavenRunConfiguration` — `MavenSettings` with `goals` and `workingDirectory`.
  - `docker-deploy` — `deploymentName` + a source type; Compose deployments carry the
    compose file path and service name.
  - `Application`, `SpringBootApplicationConfigurationType` — `MAIN_CLASS_NAME`,
    `VM_PARAMETERS`, `PROGRAM_PARAMETERS`, `WORKING_DIRECTORY`, module reference.
- Environment variables appear as a `<envs>` block of `<env name= value=>` pairs and/or
  an env-file reference.

**Rationale**: Covering both sources satisfies FR-001; default template entries are not
real configurations and are excluded.

## R4 — JetBrains type → Run Manager service mapping

**Decision**: A static mapping table in `mapper.ts` produces a `MappedService` with a
confidence level. Imported configs become only `shell` or `docker-compose` services
(the types Run Manager already supports without touching `launch.json`).

| JetBrains `type` | Run Manager type | Confidence | Construction |
|------------------|------------------|------------|--------------|
| `ShConfigurationType` | `shell` | clean | interpreter + script path + options; `cwd` |
| `js.build_tools.npm` | `shell` | clean | `npm run <script>`; `cwd` from package.json dir |
| `NodeJSConfigurationType` | `shell` | clean | `node <node-params> <file> <app-params>` |
| `GradleRunConfiguration` | `shell` | clean | `./gradlew <taskNames>`; `cwd` |
| `MavenRunConfiguration` | `shell` | clean | `mvn <goals>`; `cwd` |
| `docker-deploy` (compose) | `docker-compose` | clean | `file` + `service` |
| `docker-deploy` (other) | `shell` | needs-review | best-effort `docker` command |
| `Application`, `SpringBootApplicationConfigurationType` | `shell` | needs-review | `java` command; classpath cannot be reconstructed |
| any other `type` | — | unmapped | reported, never written |

**Rationale**: Clean rows reconstruct an exact command. JVM rows are flagged because the
classpath depends on the JetBrains project model, which is unavailable. Env-file
references map to the service `envFile` field; inline `<env>` variables are surfaced in
the report as a manual follow-up (per spec Assumptions).

## R5 — Activation-prompt gating

**Decision**: On `activate()`, if a `.idea/` directory exists in the workspace, check
`context.workspaceState`: show the prompt only when neither `jetbrainsImport.done` nor
`jetbrainsImport.dismissed` is set. "Never" sets `jetbrainsImport.dismissed`; a completed
import sets `jetbrainsImport.done`. The manual command ignores both flags.

**Rationale**: `workspaceState` is per-workspace persistent storage (spec Assumption:
dismissal is per-workspace). This keeps the prompt to first-meaningful-contact without a
custom settings file.

**Alternatives considered**: `globalState` — rejected, would suppress the prompt across
unrelated workspaces. A tracking file in `.vscode/` — rejected, unnecessary file noise.

## R6 — Re-import identity, orphan and collision handling

**Decision**: Each imported service records its origin so re-import is deterministic
(see `data-model.md`): `source: "jetbrains"` plus `originId` (a stable key derived from
the JetBrains configuration's name + type). On re-import, `merge.ts`:
- matches existing services by `source` + `originId`, updating them in place (FR-011);
- adds configurations with no match;
- marks a `source:"jetbrains"` service whose `originId` is absent from the current scan
  as `stale: true`, never deleting it (FR-018, clarification 2026-05-22);
- when a fresh import's service `id` collides with any existing service `id`, suffixes
  the imported `id` to a unique value, leaving the existing service untouched (FR-019).

**Rationale**: Origin identity is what makes re-import idempotent; staleness and
suffixing implement the two clarifications without ever destroying developer data.
