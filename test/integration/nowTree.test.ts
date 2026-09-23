import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { createTaskWatcher } from '../../src/index/watcher.ts';
import { openRiskCount } from '../../src/model/risks.ts';
import { NOW } from '../../src/strings.ts';
import {
  NowTreeProvider,
  nowBadge,
  nowMembership,
  taskAccessibleLabel,
  taskContextValue
} from '../../src/views/nowTree.ts';
import {
  STATE_FILE,
  folderUriOf,
  makeIndex,
  makeTempDir,
  removeTempDirs,
  stubContext,
  taskState,
  waitFor,
  writeFile,
  writeTask
} from '../helpers/tempWorkspace.ts';

const LIVE_BUDGET_MS = 1_500;

after(() => removeTempDirs());

describe('nowTree/integration', () => {
  it('shows a new orchestrator-state.yml within 1.5 s and updates its description on a rewrite (AC1)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('now-live');
    const harness = makeIndex([workspace], makeTempDir('now-live-storage'));
    const provider = new NowTreeProvider(harness.index);
    const folder: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(workspace),
      name: path.basename(workspace),
      index: 0
    };
    const watcher = createTaskWatcher(stubContext(), harness.index, () => undefined, [folder]);

    try {
      await harness.index.load();
      assert.equal((await provider.getChildren()).length, 0, 'the tree started non-empty');

      const dir = path.join(workspace, '.maister', 'tasks', 'development', 'token-rotation');
      writeFile(path.join(dir, STATE_FILE), taskState({ title: 'Auth token rotation' }));

      await waitFor(
        () => harness.index.snapshot.tasks.has(folderUriOf(dir)),
        LIVE_BUDGET_MS,
        'the new task'
      );
      const created = await provider.getChildren();
      assert.deepEqual(
        created.map((node) => node.label),
        ['Auth token rotation'],
        'the new task did not reach the Now tree'
      );

      writeFile(
        path.join(dir, STATE_FILE),
        taskState({
          title: 'Auth token rotation',
          status: 'blocked',
          completedPhases: ['phase-1', 'phase-2', 'phase-3']
        })
      );
      await waitFor(
        () => harness.index.snapshot.tasks.get(folderUriOf(dir))?.status === 'blocked',
        LIVE_BUDGET_MS,
        'the rewritten task'
      );
      const rewritten = await provider.getChildren();
      assert.notEqual(
        rewritten[0]?.description,
        created[0]?.description,
        'the description did not follow the rewrite'
      );
      assert.equal(
        provider.getTreeItem(rewritten[0]).contextValue,
        'task.development.blocked.next-resume',
        'the rewritten status did not reach the tree item'
      );
    } finally {
      watcher.dispose();
      provider.dispose();
      harness.dispose();
    }
  });

  it('lists exactly the unfinished statuses by activityMtime descending, badges that count, and ids on folderUri (A1)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('now-members');
    const older = writeTask(workspace, 'development', 'older', { status: 'in_progress' });
    const newest = writeTask(workspace, 'research', 'newest', { status: 'blocked' });
    const pending = writeTask(workspace, 'development', 'pending-one', { status: 'pending' });
    writeTask(workspace, 'development', 'done', { status: 'completed' });
    writeTask(workspace, 'development', 'broken', { status: 'failed' });

    const now = Date.now();
    const { utimesSync } = await import('node:fs');
    utimesSync(path.join(older, STATE_FILE), new Date(now - 60_000), new Date(now - 60_000));
    utimesSync(path.join(pending, STATE_FILE), new Date(now - 30_000), new Date(now - 30_000));

    const harness = makeIndex([workspace], makeTempDir('now-members-storage'));
    const provider = new NowTreeProvider(harness.index);
    try {
      await harness.index.load();
      const nodes = await provider.getChildren();

      assert.deepEqual(
        nodes.map((node) => node.folderUri),
        [newest, pending, older].map(folderUriOf),
        'membership or activity order is wrong'
      );
      assert.equal(nowMembership(harness.index).length, 3);
      assert.equal(nowBadge(harness.index)?.value, 3, 'the badge does not equal the unfinished count');

      const items = await Promise.all(nodes.map((node) => provider.getTreeItem(node)));
      assert.deepEqual(
        items.map((item) => item.id),
        [newest, pending, older].map((dir) => `now:${folderUriOf(dir)}`),
        'tree item ids are not now:{folderUri}'
      );
      const blocked = harness.index.snapshot.tasks.get(folderUriOf(newest));
      assert.ok(blocked);
      assert.equal(items[0].contextValue, taskContextValue(blocked));
      assert.equal(
        items[0].contextValue,
        'task.research.blocked.next-resume',
        'the contextValue no longer matches the manifest regexes'
      );
    } finally {
      provider.dispose();
      harness.dispose();
    }
  });

  it('nests Progress, Last recorded decision, Recent artifacts (≤ 5) and Open risks in that order (A5, A9)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('now-children');
    const artifacts = Array.from({ length: 7 }, (_, n) => ({
      relPath: `implementation/doc-${n}.md`,
      label: `Doc ${n}`
    }));
    const rich = writeTask(workspace, 'development', 'rich', {
      currentPhase: 'phase-8',
      artifacts,
      risks: ['The cache-buster may break resource resolution', 'Node 26 is very new'],
      decisions: ['Rotate refresh tokens on every use']
    });
    const bare = writeTask(workspace, 'development', 'bare', { decisions: [], artifacts: [] });

    const harness = makeIndex([workspace], makeTempDir('now-children-storage'));
    const provider = new NowTreeProvider(harness.index);
    try {
      await harness.index.load();
      const task = harness.index.snapshot.tasks.get(folderUriOf(rich));
      assert.ok(task);

      const children = await provider.getChildren({
        kind: 'task',
        folderUri: folderUriOf(rich),
        label: task.title
      });
      assert.deepEqual(
        children.map((child) => child.kind),
        ['progress', 'decision', 'artifacts', 'risks'],
        'the child order does not match § 4.1'
      );
      assert.equal(children[2].label, NOW.recentArtifacts);

      const artifactNodes = await provider.getChildren(children[2]);
      assert.equal(artifactNodes.length, 5, 'the A9 group node is not capped at five artifacts');
      assert.ok(
        artifactNodes.every((node) => node.description !== undefined && node.description !== ''),
        'artifact children carry no relative modification time'
      );
      const artifactItem = provider.getTreeItem(artifactNodes[0]);
      assert.equal(artifactItem.contextValue, 'artifact.md');

      assert.equal(
        children[3].label,
        `${openRiskCount(task)} open risks`,
        'the risk child does not read openRiskCount'
      );

      const bareTask = harness.index.snapshot.tasks.get(folderUriOf(bare));
      assert.ok(bareTask);
      assert.equal(openRiskCount(bareTask), 0);
      const bareChildren = await provider.getChildren({
        kind: 'task',
        folderUri: folderUriOf(bare),
        label: bareTask.title
      });
      assert.ok(
        !bareChildren.some((child) => child.kind === 'risks'),
        'Open risks was not omitted at zero'
      );
    } finally {
      provider.dispose();
      harness.dispose();
    }
  });

  it('gives every task item a spoken label naming type, phase, activity and next action (AC14)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('now-a11y');
    const dir = writeTask(workspace, 'development', 'auth-token-rotation', {
      title: 'Auth token rotation',
      currentPhase: 'phase-8'
    });

    const harness = makeIndex([workspace], makeTempDir('now-a11y-storage'));
    const provider = new NowTreeProvider(harness.index);
    try {
      await harness.index.load();
      const task = harness.index.snapshot.tasks.get(folderUriOf(dir));
      assert.ok(task);

      const [node] = await provider.getChildren();
      const item = provider.getTreeItem(node);
      const label = item.accessibilityInformation?.label;
      assert.ok(label, 'the task item exposes no accessibilityInformation.label');
      assert.equal(label, taskAccessibleLabel(task));

      assert.ok(label.startsWith('Auth token rotation.'), label);
      assert.ok(label.includes('Development task.'), label);
      assert.ok(/Phase \d+ of \d+/.test(label), `no phase in the spoken label: ${label}`);
      assert.ok(/Written \d+ seconds? ago|Quiet for/.test(label), `no activity: ${label}`);
      assert.ok(label.includes(`Next action: ${task.nextAction.label}`), label);
      assert.ok(
        !/\b(running|waiting|stalled|abandoned)\b/i.test(label.replace(task.title, '')),
        `AC13 wording leaked into the spoken label: ${label}`
      );
    } finally {
      provider.dispose();
      harness.dispose();
    }
  });

  it('opens every node through a rendering command — never vscode.open — and the title launches nothing (AC5, AC17)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('now-commands');
    const dir = writeTask(workspace, 'development', 'auth-token-rotation', {
      title: 'Auth token rotation',
      artifacts: [
        { relPath: 'implementation/spec.md', label: 'Specification' },
        { relPath: 'analysis/brief.html', label: 'Brief' }
      ],
      risks: ['Retries reuse keys across different amounts']
    });
    const folderUri = folderUriOf(dir);

    const harness = makeIndex([workspace], makeTempDir('now-commands-storage'));
    const provider = new NowTreeProvider(harness.index);
    try {
      await harness.index.load();
      const [node] = await provider.getChildren();
      const taskItem = provider.getTreeItem(node);

      assert.deepEqual(
        taskItem.command,
        {
          command: 'maister.openTask',
          title: 'Development',
          arguments: [{ folderUri }]
        },
        'the Now row title does not open the task, or it launches an action (AC17)'
      );

      const children = await provider.getChildren(node);
      const artifactsNode = children.find((child) => child.kind === 'artifacts');
      assert.ok(artifactsNode, 'the task has no Recent artifacts child');
      const artifactItems = (await provider.getChildren(artifactsNode)).map((child) =>
        provider.getTreeItem(child)
      );
      assert.ok(artifactItems.length > 0, 'no artifact children to open');

      for (const item of [taskItem, ...artifactItems, ...children.map((child) => provider.getTreeItem(child))]) {
        assert.notEqual(
          item.command?.command,
          'vscode.open',
          `a Now node opens ${String(item.label)} as source, which AC5 forbids`
        );
        assert.notEqual(
          item.command?.command,
          'maister.openArtifactSource',
          'a Now node opens the source view without the explicit action'
        );
      }

      const md = artifactItems.find((item) => item.contextValue === 'artifact.md');
      assert.ok(md, 'no markdown artifact child');
      assert.equal(md.command?.command, 'maister.openArtifact');
      assert.deepEqual(md.command?.arguments, [
        { folderUri, artifactRelPath: 'implementation/spec.md', variant: 'md' }
      ]);

      const risksItem = children
        .filter((child) => child.kind === 'risks')
        .map((child) => provider.getTreeItem(child))[0];
      assert.ok(risksItem, 'the task has no Open risks child');
      assert.equal(risksItem.command?.command, 'maister.openRisks');
      assert.deepEqual(risksItem.command?.arguments, [{ folderUri }]);
    } finally {
      provider.dispose();
      harness.dispose();
    }
  });
});
