const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['webview/src/index.tsx'],
  bundle: true,
  outfile: 'webview/dist/webview.js',
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  // Use the modern JSX runtime so components don't need `import React` in scope —
  // matches tsconfig.webview.json's `"jsx": "react-jsx"`.
  jsx: 'automatic',
  sourcemap: true,
  minify: false,
  define: {
    'process.env.NODE_ENV': '"development"',
  },
};

if (watch) {
  esbuild.context(options).then(ctx => ctx.watch());
} else {
  esbuild.build(options).catch(() => process.exit(1));
}
