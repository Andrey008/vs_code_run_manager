# Quickstart: Consolidated Service Controls

## For the user

After installing v1.2.0, open any workspace that uses Run Manager:

- Each service row now shows a **single morphing action button** (or two for
  `launch` services) plus **Restart**. The text status badge is gone — the button
  itself tells you the state.
- **Stopped** → green Play ▶ (or the green debug-bug for `launch` services). Click
  to start.
- **Starting** → red square with a spinning orange ring. Click to cancel.
- **Running** → red square. **Ready** → red square with a steady green ring (health
  check passed). Click either to stop.
- **Crashed** → amber ⚠. Click to run again.
- **`launch` services**: at rest you see two buttons — Play and the debug bug.
  Click whichever mode you want; the other hides while the service runs.
- **Restart (↺)** stays visible in every state — same as before.

## For the developer

**Module touchpoints:**

- `webview/src/components/ActionButton.tsx` (new) — the morphing button. Pure of
  `status` + `kind`; emits actions via callback.
- `webview/src/components/DebugIcon.tsx` (new) — the minimal-bug SVG.
- `webview/src/components/ServiceItem.tsx` (rewritten) — renders `ActionButton`(s) +
  `Restart` (+ `Remove`); the `StatusBadge` import is gone.
- `webview/src/components/StatusBadge.tsx` (deleted).
- `src/types.ts` — `WebviewMessage.start` gains `mode?`; `toggleMode` removed.
- `src/panel/RunManagerPanel.ts` — `case 'start'` reads `message.mode`; `case
  'toggleMode'` deleted.

**Run the tests:**

```bash
npm test                  # Jest unit tests — both projects (extension + webview)
npm run lint              # tsc --noEmit
```

The webview Jest project (`jest.webview.config.js`) runs `webview/src/**/*.test.tsx`
in `jsdom`. The mock `webview/src/__mocks__/vscodeApi.ts` captures dispatched
messages so an `ActionButton` test can assert "click at status=stopped, kind=debug
posts `{ type: 'start', id, mode: 'debug' }`".

**Manual check** (Extension Development Host):

1. Press <kbd>F5</kbd>; open `test-workspace/` (or any project with services).
2. Verify each service status renders the matching button (cycle stopped →
   starting → running/ready → stopped).
3. For a `launch` config: at rest there are two buttons; click the debug bug,
   confirm the editor's debug session starts; click Stop on the morphed button,
   both buttons reappear.
4. Confirm `Restart` is visible in every state and works from stopped (acts as
   "start").
5. Trigger a crash (kill the process) → verify the ⚠ glyph appears.

**Done when:** both Jest projects pass, `npm run lint` is clean, and the manual
check above behaves as described.
