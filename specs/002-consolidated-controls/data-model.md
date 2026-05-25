# Phase 1 Data Model: Consolidated Service Controls

This is a UI-layer feature — no new persisted entities, no schema migration. The
only "data" changes are the webview ↔ extension message protocol and one optional
field on the existing service config.

## Message protocol (`src/types.ts`)

### Changed: `WebviewMessage`

| Variant | Before | After |
|---------|--------|-------|
| `start` | `{ type: 'start'; id: string }` | `{ type: 'start'; id: string; mode?: ServiceMode }` |
| `toggleMode` | `{ type: 'toggleMode'; id: string; mode: ServiceMode }` | **removed** |
| `stop`, `restart`, `startGroup`, `startServices`, `saveLayout`, `requestLogs`, `showTerminal`, `ready` | — | unchanged |

`ServiceMode` is the existing `'run' | 'debug'` type — unchanged.

### Dispatch semantics (`src/panel/RunManagerPanel.ts`)

- `case 'start'`: extension reads `message.mode`. For a `launch` service, dispatch
  through the runner in `mode` (default `'run'` if omitted). For non-`launch`
  services, `mode` is ignored.
- `case 'toggleMode'`: **deleted**. No webview path sends this any more.
- `case 'startGroup'`: launches every service in the group; for `launch` services,
  `mode` is the per-service `mode` field from `services.json` if present, else
  `'run'` (FR-014).

## Service config (`services.json`) — optional `mode` field

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `mode` | `'run' \| 'debug'` | optional, **launch services only** | Implicit default mode used by **Start All** for this service. Absent → `'run'`. No longer surfaced as a UI toggle. |

Existing `services.json` files that already use the `mode` field remain valid; the
field's runtime meaning narrows from "current toggle state" to "Start All default."

## UI states (webview)

The action button's appearance is a pure function of the existing
`ServiceStatus` plus a discriminator for `launch` services. No new types.

| Status (existing) | Button appearance | Click action |
|-------------------|-------------------|--------------|
| `stopped` | `kind: 'run'` → green ▶ (Play); `kind: 'debug'` → green debug-bug icon | start (with `mode`) |
| `starting` | Red square with a spinning orange ring | stop |
| `running` | Red square, no ring | stop |
| `ready` | Red square with a steady green ring | stop |
| `crashed` | Amber ⚠ glyph | start (with `mode`) |

`kind` is local UI state on `ActionButton` (`'run' | 'debug'`) — only meaningful for
the `stopped` and `crashed` glyphs and to tag which `mode` the click sends. Not
persisted; not part of any data structure beyond component props.

## Row layout invariants

- Non-`launch` service row: one `ActionButton` (`kind='run'`) + `Restart` (always
  visible) + optional `Remove` (Active tab).
- `launch` service row at rest: two `ActionButton`s (`kind='run'` and `kind='debug'`)
  + `Restart` (always visible) + optional `Remove`.
- `launch` service row when **not** stopped: only the active `ActionButton` is shown;
  both reappear when the service returns to `stopped` (FR-009).
- `Restart` is visible in **every** state (FR-007, clarified 2026-05-25).

## Removed component

- `webview/src/components/StatusBadge.tsx` — verified to have only `ServiceItem` as
  consumer (research R2). Deleted after `ServiceItem` rewrite.
