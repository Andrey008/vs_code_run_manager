# Contract: `services.json` Schema Additions

The importer extends the existing `.vscode/services.json` schema with three optional
fields and writes into one dedicated group. The change is fully backward compatible —
existing files remain valid and untouched unless the importer adds to them.

## New optional fields on every service

Added to `ServiceConfigBase` in `src/types.ts`:

```jsonc
{
  "id": "gradle-bootrun",
  "name": "bootRun",
  "type": "shell",
  "cmd": "./gradlew bootRun",
  "cwd": "${workspaceFolder}",

  // --- fields added by this feature ---
  "source": "jetbrains",        // marks an importer-created service
  "originId": "bootrun-gradlerunconfiguration", // stable key of the source config
  "stale": false                // true once the source config disappears
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `source` | `"jetbrains"` | optional | Present only on imported services. Its absence means "hand-written" — such a service is never modified or removed by the importer. |
| `originId` | `string` | optional | Present whenever `source` is present. Matches a service to its JetBrains configuration on re-import. |
| `stale` | `boolean` | optional | Set to `true` when re-import finds the source configuration gone. Omitted or `false` otherwise. |

## Dedicated import group

Imported services are placed in a single group:

```jsonc
{
  "groups": [
    // ... the developer's existing groups, untouched ...
    {
      "name": "JetBrains",
      "services": [ /* imported services */ ]
    }
  ]
}
```

- If a group named `"JetBrains"` already exists, it is reused — never duplicated.
- Hand-written services inside any group, including a pre-existing `"JetBrains"` group,
  are identified by the absence of `source: "jetbrains"` and are never touched.

## Write guarantees

- The file is edited with `jsonc-parser` minimal edits — existing services, comments,
  key order, and formatting outside the imported group are preserved (FR-009).
- `launch.json` is never read for writing and never modified (FR-008).
- If `services.json` exists but cannot be parsed as JSONC, the write is aborted and the
  file is left byte-for-byte unchanged (FR-015).
- If `services.json` does not exist, it is created with a single `"JetBrains"` group.
- Every service `id` in the written file is unique; a colliding imported `id` is
  suffixed (FR-019).
