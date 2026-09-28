import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { TaskIndex, type IndexChange } from '../../src/index/taskIndex.ts';

const STATE_FILE = 'orchestrator-state.yml';

interface Harness {
  readonly index: TaskIndex;
  readonly log: string[];
  readonly notifications: string[];
  readonly freshness: IndexChange['snapshot']['freshness'][];
  dispose(): void;
}

const temps: string[] = [];

function makeTempDir(prefix: string): string {
  // Realpath-resolved so the host's own resolution of /var → /private/var on macOS cannot
  // make the folderUri the index reports differ from the one the assertions build.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `maister-lens-${prefix}-`)));
  temps.push(dir);
  return dir;
}

function taskDir(workspace: string, dirSegment: string, name: string): string {
  return path.join(workspace, '.maister', 'tasks', dirSegment, name);
}

function writeFile(fsPath: string, contents: string): void {
  fs.mkdirSync(path.dirname(fsPath), { recursive: true });
  fs.writeFileSync(fsPath, contents, 'utf8');
}

function writeTask(
  workspace: string,
  dirSegment: string,
  name: string,
  options: { title?: string; status?: string; withArtifact?: boolean; state?: string } = {}
): string {
  const dir = taskDir(workspace, dirSegment, name);
  const state =
    options.state ??
    [
      'task:',
      `  title: ${options.title ?? name}`,
      `  status: ${options.status ?? 'in_progress'}`,
      '  description: rotate the signing tokens',
      '  tags:',
      '    - auth',
      'orchestrator:',
      '  completed_phases:',
      '    - phase-1',
      'task_context:',
      '  phase_summaries:',
      '    specification:',
      '      summary: wrote the spec',
      '      decisions:',
      '        - decision: Task identity is folderUri',
      '          rationale: multi-root collisions',
      '      risks:',
      '        - The cache-buster may break resource resolution',
      ...(options.withArtifact === false
        ? []
        : [
            '      artifacts:',
            '        - path: implementation/spec.md',
            '          label: Specification'
          ]),
      ''
    ].join('\n');
  writeFile(path.join(dir, STATE_FILE), state);
  if (options.withArtifact !== false) {
    writeFile(
      path.join(dir, 'implementation', 'spec.md'),
      ['# Specification', '', '## TL;DR', 'Ship the lens.', '', '## Open Questions / Risks', '- Node 26 is very new', ''].join('\n')
    );
  }
  return dir;
}

function folderUriOf(dir: string): string {
  return vscode.Uri.file(dir).toString();
}

function makeHarness(workspaces: readonly string[], storage: string): Harness {
  const log: string[] = [];
  const notifications: string[] = [];
  const freshness: IndexChange['snapshot']['freshness'][] = [];
  const index = new TaskIndex({
    storageUri: vscode.Uri.file(storage),
    log: (line) => log.push(line),
    notify: (message) => notifications.push(message),
    folders: () =>
      workspaces.map((fsPath, i) => ({ uri: vscode.Uri.file(fsPath), name: path.basename(fsPath), index: i })),
    attributionEnabled: () => false
  });
  const subscription = index.onDidChange((change) => freshness.push(change.snapshot.freshness));
  return {
    index,
    log,
    notifications,
    freshness,
    dispose: () => {
      subscription.dispose();
      index.dispose();
    }
  };
}

after(() => {
  for (const dir of temps) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('index/integration', () => {
  it('discovers .maister/tasks/*/*/orchestrator-state.yml per workspace folder with a null exclude, keyed on folderUri (A1)', async function () {
    this.timeout(60_000);

    const first = makeTempDir('ws-a');
    const second = makeTempDir('ws-b');
    const alpha = writeTask(first, 'development', 'alpha');
    const beta = writeTask(first, 'migrations', 'beta');
    const gamma = writeTask(second, 'product-design', 'gamma');

    // Neither depth is the `*/*` the pattern names, so neither may be indexed.
    writeFile(path.join(first, '.maister', 'tasks', 'too-shallow', STATE_FILE), 'task:\n  title: shallow\n');
    writeFile(
      path.join(first, '.maister', 'tasks', 'development', 'deep', 'nested', STATE_FILE),
      'task:\n  title: deep\n'
    );

    const harness = makeHarness([first, second], makeTempDir('storage-a'));
    try {
      await harness.index.load();
      const tasks = harness.index.snapshot.tasks;

      assert.deepEqual(
        [...tasks.keys()].sort(),
        [folderUriOf(alpha), folderUriOf(beta), folderUriOf(gamma)].sort(),
        'discovery is not keyed on folderUri, or matched the wrong depth'
      );

      const alphaTask = tasks.get(folderUriOf(alpha));
      assert.ok(alphaTask);
      assert.equal(alphaTask.ref.relPath, '.maister/tasks/development/alpha');
      assert.equal(alphaTask.ref.dirSegment, 'development');
      assert.equal(alphaTask.ref.folderName, 'alpha');
      assert.equal(tasks.get(folderUriOf(beta))?.type, 'migration', 'the migrations segment did not map to migration');

      const summary = alphaTask.artifacts[0]?.summary;
      assert.ok(summary, 'the index did not populate the registered artifact § 7 summary');
      assert.equal(summary.tldr, 'Ship the lens.');
      assert.ok(
        summary.risks.length > 0,
        'the index did not populate the registered artifact § 7 risks'
      );

      const excludeKey = '**/.maister/**';
      const files = vscode.workspace.getConfiguration('files');
      await files.update('exclude', { [excludeKey]: true }, vscode.ConfigurationTarget.Global);
      try {
        const pattern = new vscode.RelativePattern(vscode.Uri.file(first), '.maister/tasks/*/*/orchestrator-state.yml');
        const withDefaultExcludes = await vscode.workspace.findFiles(pattern, undefined);
        assert.equal(withDefaultExcludes.length, 0, 'the control did not hide the tasks, so the exclude argument is untested');

        const rediscovered = new TaskIndex({
          storageUri: vscode.Uri.file(makeTempDir('storage-a2')),
          log: () => undefined,
          notify: () => undefined,
          folders: () => [{ uri: vscode.Uri.file(first), name: 'first', index: 0 }],
          attributionEnabled: () => false
        });
        try {
          await rediscovered.load();
          assert.equal(
            rediscovered.snapshot.tasks.size,
            2,
            'files.exclude hid tasks, so the exclude argument is not null'
          );
        } finally {
          rediscovered.dispose();
        }
      } finally {
        await files.update('exclude', undefined, vscode.ConfigurationTarget.Global);
      }
    } finally {
      harness.dispose();
    }
  });

  it('round-trips persistence: version gates, per-entry mtime invalidation, and a silent rebuild on corruption', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('ws-persist');
    const storage = makeTempDir('storage-persist');
    const indexFile = path.join(storage, 'index-v1.json');
    const alpha = writeTask(workspace, 'development', 'alpha', { title: 'Alpha one' });
    writeTask(workspace, 'research', 'beta', { title: 'Beta one' });

    const cold = makeHarness([workspace], storage);
    try {
      await cold.index.load();
      await cold.index.flush();
    } finally {
      cold.dispose();
    }

    const persisted = JSON.parse(fs.readFileSync(indexFile, 'utf8')) as Record<string, unknown>;
    assert.equal(persisted.schemaVersion, 1);
    assert.equal(persisted.registryVersion, '2.2.3');
    assert.ok(
      Object.keys(persisted.entries as object).every((key) => key.startsWith('file:')),
      'persisted entries are not keyed on folderUri (A1)'
    );

    const warm = makeHarness([workspace], storage);
    try {
      await warm.index.load();
      assert.deepEqual(warm.freshness, ['cached', 'fresh'], 'the cached paint did not precede the fresh publish');
      assert.equal(warm.index.snapshot.tasks.size, 2);
    } finally {
      warm.dispose();
    }

    // A registry bump must discard the whole file, not one entry.
    const bumped = JSON.parse(fs.readFileSync(indexFile, 'utf8')) as Record<string, unknown>;
    bumped.registryVersion = '9.9.9';
    fs.writeFileSync(indexFile, JSON.stringify(bumped), 'utf8');
    const mismatched = makeHarness([workspace], storage);
    try {
      await mismatched.index.load();
      assert.deepEqual(mismatched.freshness, ['fresh'], 'a registry-version mismatch still painted a cached snapshot');
      assert.equal(mismatched.index.snapshot.tasks.size, 2);
      await mismatched.index.flush();
    } finally {
      mismatched.dispose();
    }

    // One changed state file invalidates one entry; the other is reused as-is.
    writeTask(workspace, 'development', 'alpha', { title: 'Alpha two' });
    const invalidated = makeHarness([workspace], storage);
    try {
      await invalidated.index.load();
      assert.equal(invalidated.index.snapshot.tasks.get(folderUriOf(alpha))?.title, 'Alpha two');
      const reconciled = invalidated.log.find((line) => /reused/.test(line));
      assert.ok(reconciled, `no reconcile line was logged: ${invalidated.log.join(' | ')}`);
      assert.match(reconciled, /1 reused/, `only the changed entry should be reparsed: ${reconciled}`);
      assert.match(reconciled, /1 reparsed/, `the changed entry was not reparsed: ${reconciled}`);
      await invalidated.index.flush();
    } finally {
      invalidated.dispose();
    }

    fs.writeFileSync(indexFile, '{ this is not json', 'utf8');
    const corrupt = makeHarness([workspace], storage);
    try {
      await corrupt.index.load();
      assert.deepEqual(corrupt.freshness, ['fresh'], 'a corrupt index file was painted as a cached snapshot');
      assert.equal(corrupt.index.snapshot.tasks.size, 2, 'the index did not rebuild from disk');
      assert.deepEqual(corrupt.notifications, [], 'a corrupt index file produced a user-facing message');
      assert.ok(
        corrupt.log.some((line) => /index/i.test(line) && /(corrupt|discard)/i.test(line)),
        `the corrupt index was not logged: ${corrupt.log.join(' | ')}`
      );
      await corrupt.index.flush();
      assert.ok(fs.existsSync(indexFile), 'the index file was not rewritten after the rebuild');
      assert.doesNotThrow(() => JSON.parse(fs.readFileSync(indexFile, 'utf8')));
      assert.ok(!fs.existsSync(`${indexFile}.tmp`), 'the atomic write left its temporary file behind');
    } finally {
      corrupt.dispose();
    }
  });

  it('drops persisted entries whose folderUri no longer resolves to an open workspace folder (A1)', async function () {
    this.timeout(60_000);

    const kept = makeTempDir('ws-kept');
    const closed = makeTempDir('ws-closed');
    const storage = makeTempDir('storage-folders');
    const keptTask = writeTask(kept, 'development', 'kept');
    const closedTask = writeTask(closed, 'development', 'closed');

    const both = makeHarness([kept, closed], storage);
    try {
      await both.index.load();
      assert.equal(both.index.snapshot.tasks.size, 2);
      await both.index.flush();
    } finally {
      both.dispose();
    }

    const single = makeHarness([kept], storage);
    try {
      const cached: string[][] = [];
      const subscription = single.index.onDidChange((change) => cached.push([...change.snapshot.tasks.keys()]));
      try {
        await single.index.load();
      } finally {
        subscription.dispose();
      }
      assert.deepEqual(cached[0], [folderUriOf(keptTask)], 'the cached paint kept a task from a closed folder');
      assert.deepEqual([...single.index.snapshot.tasks.keys()], [folderUriOf(keptTask)]);
      assert.ok(
        !single.index.snapshot.tasks.has(folderUriOf(closedTask)),
        'a task outside every open workspace folder survived the load'
      );
    } finally {
      single.dispose();
    }
  });

  it('lists a corrupt state file as unreadable while every other task indexes correctly (AC10)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('ws-corrupt');
    const healthy = writeTask(workspace, 'development', 'healthy', { title: 'Healthy task' });
    const broken = writeTask(workspace, 'development', 'broken-task', {
      state: 'orchestrator: [1, 2\ntask:\n\t- "mixed indentation and tabs\n  ::::\n'
    });
    const empty = writeTask(workspace, 'development', 'empty-task', { state: '' });

    const harness = makeHarness([workspace], makeTempDir('storage-corrupt'));
    try {
      await harness.index.load();
      const tasks = harness.index.snapshot.tasks;
      assert.equal(tasks.size, 3, 'a corrupt task stopped the other tasks from indexing');

      const healthyTask = tasks.get(folderUriOf(healthy));
      assert.ok(healthyTask);
      assert.equal(healthyTask.title, 'Healthy task');
      assert.equal(healthyTask.status, 'in_progress');
      assert.deepEqual(
        healthyTask.parseIssues.filter((issue) => issue.severity === 'error'),
        [],
        'the healthy task inherited an error from its neighbour'
      );

      const brokenTask = tasks.get(folderUriOf(broken));
      assert.ok(brokenTask);
      assert.equal(brokenTask.status, 'unknown', 'a corrupt state file did not list as unreadable');
      assert.equal(brokenTask.title, 'Broken task', 'the folder-derived title was not used');
      assert.ok(
        brokenTask.parseIssues.some((issue) => issue.severity === 'error'),
        'a corrupt state file recorded no error issue'
      );

      const emptyTask = tasks.get(folderUriOf(empty));
      assert.ok(emptyTask);
      assert.equal(emptyTask.status, 'unknown');
      assert.ok(emptyTask.parseIssues.some((issue) => issue.severity === 'error'));
    } finally {
      harness.dispose();
    }
  });
});
