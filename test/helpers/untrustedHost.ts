import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

/**
 * Audit I8 — a second test host in which `vscode.workspace.isTrusted` really is false.
 *
 * `runTests()` cannot do this: it appends `--disable-workspace-trust` to every launch, and
 * the workbench then reports every workspace as trusted, so an AC15 assertion made through
 * it would be worthless. This launches the downloaded build directly with the same
 * arguments minus that flag, and with a user-data directory of its own so no trust decision
 * carries over from the trusted pass or from the developer's own VS Code.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const UNTRUSTED_USER_DATA = path.join(REPO_ROOT, '.vscode-test', 'untrusted-user-data');

interface TestHostConfig {
  readonly version: string;
  readonly cachePath: string;
  readonly launchArgs: readonly string[];
}

function seedUntrustedProfile(): void {
  fs.rmSync(UNTRUSTED_USER_DATA, { recursive: true, force: true });
  const userDir = path.join(UNTRUSTED_USER_DATA, 'User');
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDir, 'settings.json'),
    JSON.stringify(
      {
        'security.workspace.trust.enabled': true,
        // No modal and no banner, so the window never waits for a person to answer.
        'security.workspace.trust.startupPrompt': 'never',
        'security.workspace.trust.banner': 'never',
        'security.workspace.trust.untrustedFiles': 'open'
      },
      null,
      2
    ),
    'utf8'
  );
}

export async function runUntrustedHost(): Promise<void> {
  delete process.env.ELECTRON_RUN_AS_NODE;
  seedUntrustedProfile();

  const module_ = await import(pathToFileURL(path.join(REPO_ROOT, '.vscode-test.mjs')).href);
  const config = module_.default as TestHostConfig;
  const cachePath = path.join(REPO_ROOT, config.cachePath);
  const executable = await downloadAndUnzipVSCode({ version: config.version, cachePath });

  const args = [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--no-cached-data',
    '--disable-extensions',
    `--extensionTestsPath=${path.join(__dirname, '..', 'integration', 'index.js')}`,
    `--extensionDevelopmentPath=${REPO_ROOT}`,
    `--user-data-dir=${UNTRUSTED_USER_DATA}`,
    `--extensions-dir=${path.join(cachePath, 'extensions')}`,
    REPO_ROOT
  ];

  await new Promise<void>((resolve, reject) => {
    const host = spawn(executable, args, {
      env: { ...process.env, MAISTER_TEST_SUITE: 'untrusted' },
      stdio: 'inherit'
    });
    host.on('error', reject);
    host.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`the untrusted test host exited with code ${String(code)}`));
    });
  });
}
