# Contract: Webview ↔ Extension Message Protocol

Internal contract: the messages the React webview posts to the extension host. Only
the changes for this feature are listed; all other variants in `WebviewMessage`
remain unchanged.

## Changed: `start`

```ts
{ type: 'start'; id: string; mode?: ServiceMode }
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `id` | `string` | yes | Service id. |
| `mode` | `'run' \| 'debug'` | optional | The mode to launch a `launch` service in. Ignored for non-`launch` services. **Default**: `'run'` when omitted. |

**Senders**:
- The single `ActionButton` of a non-`launch` service — omits `mode`.
- The run `ActionButton` of a `launch` service — sends `mode: 'run'` (explicit).
- The debug `ActionButton` of a `launch` service — sends `mode: 'debug'`.
- `startGroup` and `startServices` (group launches) — never send `mode` explicitly;
  the extension applies the per-service default from `services.json` (`mode` field
  if set, else `'run'`) — see `data-model.md` and FR-014.

**Extension dispatch** (`src/panel/RunManagerPanel.ts`, currently line 114):
read `message.mode ?? servicesJsonDefault ?? 'run'`, then route through the existing
runner. No other code in the panel dispatch path changes for this case.

## Removed: `toggleMode`

```ts
// REMOVED — no webview path sends this any more.
// { type: 'toggleMode'; id: string; mode: ServiceMode }
```

**Extension side**: the `case 'toggleMode'` handler in `RunManagerPanel.ts`
(currently line 133) is deleted. Removing it is safe because no code path outside
the old mode-toggle button posted it.

## Unchanged

`stop`, `restart`, `startGroup`, `startServices`, `saveLayout`, `requestLogs`,
`showTerminal`, `ready` — unchanged. The extension → webview message stream
(`ExtensionMessage`) is unchanged: status updates still flow as today's
`statusUpdate` messages, and the new `ActionButton` reacts to them the same way
`ServiceItem` does now.
