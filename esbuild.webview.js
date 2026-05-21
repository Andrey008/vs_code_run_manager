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
