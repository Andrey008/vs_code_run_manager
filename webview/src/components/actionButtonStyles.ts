/**
 * The CSS for the `ActionButton`'s starting/ready rings. Lives outside the
 * component so it can be rendered once at the App root with the webview's
 * CSP nonce (a `<style>` element built at runtime in component code would be
 * blocked by VS Code's webview CSP).
 */
export const ACTION_BUTTON_CSS = `
.rm-action-ring {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  pointer-events: none;
}
/* Ready: a thin circle circumscribed around the 14px square so it touches
   the corners but doesn't visually swallow the red square the way a thick
   ring did. */
.rm-action-ring-ready {
  border: 1.5px solid var(--vscode-debugIcon-startForeground, #22c55e);
}
/* Starting: eight orange "minute marks" arranged around the square. Each
   tick fades in and out on the same animation, but with staggered
   animation-delays so the bright tick chases its way around the ring —
   the classic clock-face spinner. */
@keyframes rm-tick-fade {
  0%, 100% { opacity: 0.18; }
  12% { opacity: 1; }
  45% { opacity: 0.18; }
}
.rm-action-tick {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 3px;
  margin: -1.5px 0 0 -1px;
  background: #f59e0b;
  border-radius: 1px;
  transform: rotate(calc(var(--i) * 45deg)) translateY(-9px);
  animation: rm-tick-fade 0.9s linear infinite;
  animation-delay: calc(var(--i) * -0.1125s);
}
`;
