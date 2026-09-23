import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runTests } from '@vscode/test-electron';

/**
 * A10's performance report for AC7 and AC9. It launches the extension host over 300 task
 * folders generated into a temp directory at run time, prints cold index, warm snapshot and
 * query timings against their targets, and exits 0 whatever they say: this reports, it does
 * not gate. A missed target is a finding for the work log, not a failing build.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  { key: 'coldMs', label: 'cold index', target: 5_000, criterion: 'AC9' },
  { key: 'warmMs', label: 'warm cached snapshot', target: 300, criterion: 'AC9' },
  { key: 'queryMs', label: 'decision-text query', target: 100, criterion: 'AC7' }
];

async function main() {
  delete process.env.ELECTRON_RUN_AS_NODE;

  const config = (await import(pathToFileURL(path.join(REPO_ROOT, '.vscode-test.mjs')).href))
    .default;
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'maister-lens-bench-')), 'bench.json');

  await runTests({
    version: config.version,
    cachePath: path.join(REPO_ROOT, config.cachePath),
    extensionDevelopmentPath: REPO_ROOT,
    extensionTestsPath: path.join(REPO_ROOT, 'out', 'test', 'bench', 'index.js'),
    extensionTestsEnv: { MAISTER_BENCH_OUT: out },
    launchArgs: [...config.launchArgs, REPO_ROOT]
  });

  const measurements = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(path.dirname(out), { recursive: true, force: true });

  console.log(`\nMaister Lens benchmark — ${measurements.count} generated tasks`);
  for (const { key, label, target, criterion } of TARGETS) {
    const value = measurements[key];
    console.log(
      `  ${label.padEnd(22)} ${value.toFixed(1).padStart(8)} ms   target < ${target} ms   ` +
        `${value < target ? 'met' : 'MISSED'}   (${criterion})`
    );
  }
  console.log(`  query matched ${measurements.hits} task(s)\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
