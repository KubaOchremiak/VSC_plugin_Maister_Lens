import { build, context } from 'esbuild';
import { readdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const webviewEntries = readdirSync('src/webview')
  .filter((name) => name.endsWith('.ts'))
  .map((name) => `src/webview/${name}`);

const targets = [
  {
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
  },
  {
    entryPoints: webviewEntries,
    outdir: 'dist/webview',
    platform: 'browser',
    format: 'iife',
  },
];

const shared = {
  bundle: true,
  sourcemap: true,
  target: ['node18', 'chrome110'],
  logLevel: 'info',
};

if (watch) {
  const contexts = await Promise.all(targets.map((target) => context({ ...shared, ...target })));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
  await Promise.all(targets.map((target) => build({ ...shared, ...target })));
}
