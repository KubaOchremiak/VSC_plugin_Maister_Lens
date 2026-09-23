import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { Author } from '../model/types.ts';

const execFileAsync = promisify(execFile);

/** § 3.8 — git is a data source only, never a shell, and never allowed to hang the index. */
const GIT_TIMEOUT_MS = 10_000;
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

const LOG_ARGS: readonly string[] = [
  'log',
  '--diff-filter=A',
  `--format=${RECORD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI`,
  '--name-only',
  '--',
  ':(glob).maister/tasks/*/*/orchestrator-state.yml'
];

export type AttributionLog = (line: string) => void;

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function git(
  command: string,
  args: readonly string[],
  cwd: string,
  log: AttributionLog
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, [...args], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
      windowsHide: true
    });
    return stdout;
  } catch (error) {
    log(`attribution: ${command} ${args[0]} failed in ${cwd}: ${reason(error)}`);
    return null;
  }
}

/**
 * One `git log` per repository (§ 3.8), keyed by the absolute path of each task's state file.
 * A missing binary, a directory outside any repository and a timeout all degrade to an empty
 * result plus one output-channel line — never a notification, and never a thrown error.
 *
 * `gitCommand` is overridable so the degraded path can be exercised without altering PATH.
 */
export async function readAuthors(
  cwd: string,
  log: AttributionLog,
  gitCommand = 'git'
): Promise<ReadonlyMap<string, Author>> {
  const authors = new Map<string, Author>();

  const toplevel = await git(gitCommand, ['rev-parse', '--show-toplevel'], cwd, log);
  if (toplevel === null) {
    return authors;
  }
  const repoRoot = toplevel.trim();
  if (repoRoot === '') {
    return authors;
  }

  const configured = await git(gitCommand, ['config', 'user.email'], repoRoot, () => undefined);
  const myEmail = (configured ?? '').trim().toLowerCase();

  const history = await git(gitCommand, LOG_ARGS, repoRoot, log);
  if (history === null) {
    return authors;
  }

  for (const record of history.split(RECORD_SEPARATOR)) {
    if (record.trim() === '') {
      continue;
    }
    const [name, email, rest] = record.split(FIELD_SEPARATOR);
    if (rest === undefined) {
      continue;
    }
    const [isoDate, ...paths] = rest.split('\n');
    const addedAt = new Date(isoDate.trim());
    if (Number.isNaN(addedAt.getTime())) {
      continue;
    }
    const author: Author = {
      name,
      email,
      addedAt,
      isMe: myEmail !== '' && email.toLowerCase() === myEmail
    };
    for (const line of paths) {
      const repoRelPath = line.trim();
      if (repoRelPath === '') {
        continue;
      }
      // Log order is newest-first, so the last record seen for a path is its earliest addition.
      authors.set(path.resolve(repoRoot, repoRelPath), author);
    }
  }

  return authors;
}
