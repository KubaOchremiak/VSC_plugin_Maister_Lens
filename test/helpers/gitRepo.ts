import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * A two-author repository generated at run time (A10 — never committed): the first task was
 * added by "me" under a differently-cased address, the second by somebody else, and the third
 * is on disk but never committed.
 */
export interface GeneratedRepo {
  readonly root: string;
  /** `git config user.email`, cased differently from the commit author address on purpose. */
  readonly myConfiguredEmail: string;
  readonly myCommitEmail: string;
  readonly otherEmail: string;
  readonly mineTaskDir: string;
  readonly othersTaskDir: string;
  readonly uncommittedTaskDir: string;
  dispose(): void;
}

const MY_CONFIGURED_EMAIL = 'Me@Example.COM';
const MY_COMMIT_EMAIL = 'me@example.com';
const OTHER_EMAIL = 'other@example.org';

function run(root: string, args: readonly string[]): void {
  execFileSync('git', args, {
    cwd: root,
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: path.join(root, 'absent-global-config'),
      GIT_CONFIG_SYSTEM: path.join(root, 'absent-system-config'),
      GIT_TERMINAL_PROMPT: '0'
    }
  });
}

function writeTask(root: string, relDir: string, title: string): string {
  const dir = path.join(root, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'orchestrator-state.yml'),
    `task:\n  title: ${title}\n  status: in_progress\norchestrator:\n  completed_phases: []\n`,
    'utf8'
  );
  return dir;
}

function commitAs(root: string, email: string, name: string, message: string): void {
  run(root, ['add', '-A']);
  run(root, ['-c', `user.email=${email}`, '-c', `user.name=${name}`, 'commit', '-m', message]);
}

export function createTwoAuthorRepo(): GeneratedRepo {
  // Realpath-resolved so the paths here match what `git rev-parse --show-toplevel` reports.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maister-lens-git-')));

  run(root, ['init', '-b', 'main']);
  run(root, ['config', 'user.name', 'Me']);
  run(root, ['config', 'user.email', MY_CONFIGURED_EMAIL]);
  run(root, ['config', 'commit.gpgsign', 'false']);

  const mineTaskDir = writeTask(root, '.maister/tasks/development/mine', 'My task');
  commitAs(root, MY_COMMIT_EMAIL, 'Me', 'add my task');

  const othersTaskDir = writeTask(root, '.maister/tasks/research/theirs', 'Their task');
  commitAs(root, OTHER_EMAIL, 'Other Person', 'add their task');

  // A later commit by somebody else must not steal the first task: log order is newest-first,
  // so only the last record for a path — its earliest addition — counts.
  fs.appendFileSync(path.join(mineTaskDir, 'orchestrator-state.yml'), '  note: touched\n', 'utf8');
  commitAs(root, OTHER_EMAIL, 'Other Person', 'touch my task');

  const uncommittedTaskDir = writeTask(root, '.maister/tasks/development/uncommitted', 'Uncommitted task');

  return {
    root,
    myConfiguredEmail: MY_CONFIGURED_EMAIL,
    myCommitEmail: MY_COMMIT_EMAIL,
    otherEmail: OTHER_EMAIL,
    mineTaskDir,
    othersTaskDir,
    uncommittedTaskDir,
    dispose: () => fs.rmSync(root, { recursive: true, force: true })
  };
}
