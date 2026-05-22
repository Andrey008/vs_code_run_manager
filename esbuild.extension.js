const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  // Prefer ESM builds of dependencies: jsonc-parser's UMD `main` uses a factory
  // `require` parameter that esbuild cannot bundle, leaving a broken runtime
  // `require('./impl/format')`. Its ESM `module` build bundles cleanly.
  mainFields: ['module', 'main'],
  sourcemap: true,
  minify: false,
};

if (watch) {
  esbuild.context(options).then(ctx => ctx.watch());
} else {
  esbuild.build(options).catch(() => process.exit(1));
}
