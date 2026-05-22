# Phase 1 Data Model: Import JetBrains Run Configurations

All importer types live in `src/jetbrains-import/types.ts` unless noted. The schema
additions to the existing `ServiceConfig` live in `src/types.ts`.

## Existing schema change — `ServiceConfigBase` (`src/types.ts`)

Three optional, backward-compatible fields are added to `ServiceConfigBase` (the shared
base of every `ServiceConfig`). Existing hand-written `services.json` files remain valid.

| Field | Type | Meaning |
|-------|------|---------|
| `source` | `'jetbrains'` (optional) | Marks a service created by the importer. Absent on hand-written services — `merge.ts` MUST never modify a service without it. |
| `originId` | `string` (optional) | Stable key of the JetBrains configuration this service was imported from. Used to match on re-import. Present only when `source` is set. |
| `stale` | `boolean` (optional) | Set to `true` when a re-import finds the source configuration gone. Never auto-removed. |

`configParser.ts` validation MUST accept these fields (they are optional; current
validation already passes unknown fields through via the `...raw` spread).

## Importer entities (`src/jetbrains-import/types.ts`)

### `JetBrainsRunConfig`

Normalized output of `parser.ts`, one per discovered configuration. Pure data, no VS Code
types.

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | The configuration's display name. |
| `type` | `string` | Raw JetBrains `type` attribute (e.g. `ShConfigurationType`). |
| `provenance` | `'shared' \| 'personal'` | `shared` = `runConfigurations/*.xml`; `personal` = `workspace.xml`. |
| `options` | `Record<string, string>` | Flattened type-specific settings (script path, task names, goals, …). |
| `envVars` | `Record<string, string>` | Inline environment variables, if any. |
| `envFile` | `string \| undefined` | Referenced env file path, if any. |
| `workingDir` | `string \| undefined` | Working directory, if specified. |

**Identity**: `originId` is derived deterministically from `name` + `type` (slugified).
Two configs with the same name and type are treated as the same origin.

### `MappingConfidence`

`'clean' | 'needs-review' | 'unmapped'` — output of `mapper.ts` per config (see
`research.md` R4).

### `MappedService`

Output of `mapper.ts`, one per `JetBrainsRunConfig`.

| Field | Type | Notes |
|-------|------|-------|
| `originId` | `string` | Carried from the source config; written to the service. |
| `originName` | `string` | The JetBrains config name, for display in the preview/report. |
| `confidence` | `MappingConfidence` | Drives preview badges and report grouping. |
| `service` | `ServiceConfig \| null` | The constructed service (`shell`/`docker-compose`) with `source: 'jetbrains'`; `null` when `confidence` is `unmapped`. |
| `notes` | `string[]` | Human-readable caveats (e.g. "classpath could not be reconstructed", "inline env vars not applied"). |

**State transitions** (a service across imports):
`absent → imported` (first import) → `updated` (re-import, source changed) →
`stale` (re-import, source gone). A `stale` service returns to `updated` if its source
configuration reappears.

### `ImportReportEntry`

| Field | Type | Notes |
|-------|------|-------|
| `originName` | `string` | The JetBrains configuration name. |
| `outcome` | `'imported' \| 'updated' \| 'needs-review' \| 'skipped' \| 'stale'` | Final disposition. |
| `detail` | `string` | Why — e.g. mapping caveat, skip reason, malformed-file note. |

### `ImportReport`

| Field | Type | Notes |
|-------|------|-------|
| `entries` | `ImportReportEntry[]` | One per discovered configuration (FR-017 — no silent drops). |
| `counts` | `{ imported: number; needsReview: number; skipped: number; stale: number }` | Summary shown in the notification. |
| `aborted` | `boolean` | `true` when the write was aborted (e.g. malformed `services.json`, FR-015). |
| `abortReason` | `string \| undefined` | Set when `aborted` is `true`. |

## Validation rules

- A `MappedService` with `confidence: 'unmapped'` MUST have `service: null` and MUST NOT
  be written.
- Every constructed `service` MUST carry `source: 'jetbrains'` and a non-empty `originId`.
- Imported services MUST land in a single dedicated group named `"JetBrains"` (FR-012);
  if such a group already exists it is reused, never duplicated.
- On write, every service `id` in the resulting `services.json` MUST be unique (FR-019).
- A service lacking `source: 'jetbrains'` MUST never be modified or removed by `merge.ts`
  (FR-010).
