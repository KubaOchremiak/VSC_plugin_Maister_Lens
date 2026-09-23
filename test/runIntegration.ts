import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runTests } from '@vscode/test-electron';
import { runUntrustedHost } from './helpers/untrustedHost.ts';

interface TestHostConfig {
  readonly version: string;
  readonly cachePath: string;
  readonly launchArgs: readonly string[];
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function requestedVersion(fallback: string): string {
  const flag = process.argv.find((arg) => arg.startsWith('--vscode-version='));
  return flag ? flag.slice('--vscode-version='.length) : fallback;
}

async function main(): Promise<void> {
  // Inherited from a VS Code integrated terminal, this would make the downloaded
  // build start as plain Node instead of launching the test host.
  delete process.env.ELECTRON_RUN_AS_NODE;

  const module_ = await import(pathToFileURL(path.join(REPO_ROOT, '.vscode-test.mjs')).href);
  const config = module_.default as TestHostConfig;

  await runTests({
    version: requestedVersion(config.version),
    cachePath: path.join(REPO_ROOT, config.cachePath),
    extensionDevelopmentPath: REPO_ROOT,
    extensionTestsPath: path.join(__dirname, 'integration', 'index.js'),
    launchArgs: [...config.launchArgs, REPO_ROOT],
  });

  // Audit I8 — AC15 is only genuinely asserted in a host that never trusted the workspace.
  await runUntrustedHost();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
