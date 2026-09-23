import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default {
  version: '1.138.0',
  cachePath: '.vscode-test',
  // The test host's profile lives inside the (git-ignored) cache, so a test that writes a
  // user setting can never reach the developer's own VS Code installation.
  launchArgs: [
    '--disable-extensions',
    '--disable-workspace-trust',
    `--user-data-dir=${path.join(repoRoot, '.vscode-test', 'user-data')}`,
  ],
};
