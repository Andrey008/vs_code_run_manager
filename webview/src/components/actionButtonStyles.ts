/**
 * The CSS for the `ActionButton`'s starting/ready rings. Lives outside the
 * component so it can be rendered once at the App root with the webview's
 * CSP nonce (a `<style>` element built at runtime in component code would be
 * blocked by VS Code's webview CSP).
 */
export const ACTION_BUTTON_CSS = `
@keyframes rm-action-spin { to { transform: rotate(360deg); } }
.rm-action-ring {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  pointer-events: none;
}
.rm-action-ring-spinning {
  border: 3px solid transparent;
  /* Vivid orange — VS Code's progressBar variable is blue in default themes,
     which doesn't match the "in-progress" semantic the design wants. */
  border-top-color: #f59e0b;
  border-right-color: #f59e0b;
  animation: rm-action-spin 0.7s linear infinite;
}
.rm-action-ring-ready {
  border: 3px solid var(--vscode-debugIcon-startForeground, #22c55e);
}
`;
