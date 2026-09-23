import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { TaskIndex } from '../../src/index/taskIndex.ts';
import { TaskPanel } from '../../src/panel/panel.ts';
import {
  folderStubs,
  folderUriOf,
  makeIndex,
  makeTempDir,
  removeTempDirs,
  spyOnCommand,
  stubContext,
  waitFor,
  writeFile,
  writeHostedTask
} from '../helpers/tempWorkspace.ts';

after(() => removeTempDirs());

interface Harness {
  readonly panel: TaskPanel;
  readonly index: TaskIndex;
  readonly folderUri: string;
  readonly dir: string;
  readonly log: string[];
  readonly posted: unknown[];
  dispose(): Promise<void>;
}

async function hostedPanel(prefix: string): Promise<Harness> {
  const workspace = makeTempDir(prefix);
  const dir = writeHostedTask(workspace, 'hosted', {
    artifacts: [{ relPath: 'implementation/spec.md', label: 'Specification' }]
  });
  const index = makeIndex([workspace], makeTempDir(`${prefix}-storage`));
  await index.index.load();

  const log: string[] = [];
  const posted: unknown[] = [];
  const panel = new TaskPanel({
    context: stubContext(),
    index: index.index,
    log: (line) => log.push(line),
    folders: () => folderStubs([workspace])
  });
  panel.onDidPost((message) => posted.push(message));

  return {
    panel,
    index: index.index,
    dir,
    folderUri: folderUriOf(dir),
    log,
    posted,
    dispose: async () => {
      panel.dispose();
      index.dispose();
    }
  };
}

describe('panel/integration', () => {
  it('posts refresh to the shim within 1.5 s of a dashboard-data.js change (AC3)', async function () {
    this.timeout(60_000);

    const harness = await hostedPanel('panel-refresh');
    try {
      await harness.panel.show({ mode: 'task', folderUri: harness.folderUri });
      assert.equal(harness.panel.isHosting, true, 'the real dashboard was not recognized as hostable');

      const startedAt = Date.now();
      fs.appendFileSync(path.join(harness.dir, 'dashboard-data.js'), '\n// touched\n');
      await harness.index.touchActivity(harness.folderUri);
      harness.index.publishPending();

      const elapsed = await waitFor(
        () => harness.posted.some((message) => (message as { type?: string }).type === 'refresh'),
        5_000,
        'the panel posted no refresh'
      );
      assert.ok(
        Date.now() - startedAt <= 1_500,
        `refresh reached the shim after ${elapsed} ms, past the 1.5 s budget`
      );
    } finally {
      await harness.dispose();
    }
  });

  it('routes a navigate to an in-task .md into artifact mode, opening no editor tab and no browser (AC4)', async function () {
    this.timeout(60_000);

    const harness = await hostedPanel('panel-navigate');
    try {
      await harness.panel.show({ mode: 'task', folderUri: harness.folderUri });
      // Counted with the panel already open, so only an editor the navigate opens would show.
      const tabsBefore = vscode.window.tabGroups.all.reduce(
        (count, group) => count + group.tabs.length,
        0
      );
      await harness.panel.handleMessage({ type: 'navigate', href: 'implementation/spec.md' });

      assert.deepEqual(harness.panel.location, {
        mode: 'artifact',
        folderUri: harness.folderUri,
        artifactRelPath: 'implementation/spec.md',
        variant: 'md'
      });
      assert.equal(
        vscode.window.tabGroups.all.reduce((count, group) => count + group.tabs.length, 0),
        tabsBefore,
        'the navigate opened an editor tab instead of staying in the panel'
      );
      assert.deepEqual(
        harness.log.filter((line) => /openExternal|browser/i.test(line)),
        [],
        'the navigate reached the system browser'
      );

      await harness.panel.handleMessage({ type: 'navigate', href: '../elsewhere/dashboard.html' });
      assert.equal(
        harness.panel.location?.mode,
        'artifact',
        'an out-of-folder navigate moved the panel (A2.1)'
      );
      assert.equal(harness.log.length, 1, `the out-of-folder navigate was not logged: ${harness.log.join(' | ')}`);

      assert.equal(harness.panel.canGoBack, true, 'the panel kept no history');
      await harness.panel.back();
      assert.equal(harness.panel.location?.mode, 'task', 'back did not return to Task mode');
    } finally {
      await harness.dispose();
    }
  });
  it('registers every command package.json contributes, including Reveal in Explorer (A4)', async function () {
    this.timeout(60_000);

    const extension = vscode.extensions.all.find(
      (candidate) => (candidate.packageJSON as { name?: string }).name === 'maister-lens'
    );
    assert.ok(extension, 'the extension under test is not installed in the host');
    await extension.activate();

    const contributed = (
      extension.packageJSON as { contributes: { commands: { command: string }[] } }
    ).contributes.commands.map((entry) => entry.command);
    const registered = new Set(await vscode.commands.getCommands(true));
    const missing = contributed.filter((command) => !registered.has(command));

    assert.deepEqual(missing, [], `contributed but never registered: ${missing.join(', ')}`);
  });

  it('reveals the artifact a Now-tree row names, without opening an editor', async function () {
    this.timeout(60_000);

    const harness = await hostedPanel('panel-reveal');
    const spy = spyOnCommand('revealInExplorer');
    try {
      await harness.panel.revealInExplorer({
        folderUri: harness.folderUri,
        artifactRelPath: 'implementation/spec.md'
      });

      assert.equal(spy.calls.length, 1, 'revealInExplorer was not asked to reveal anything');
      assert.equal(
        (spy.calls[0] as vscode.Uri).fsPath,
        path.join(harness.dir, 'implementation', 'spec.md'),
        'the revealed file is not the artifact the caller named'
      );

      // With no artifact named, a task row reveals its state file.
      await harness.panel.revealInExplorer({ folderUri: harness.folderUri });
      assert.equal(
        (spy.calls[1] as vscode.Uri).fsPath,
        path.join(harness.dir, 'orchestrator-state.yml')
      );
    } finally {
      spy.dispose();
      await harness.dispose();
    }
  });
  it('opens an openFile path under the workspace folder the surface belongs to, decoded (multi-root)', async function () {
    this.timeout(60_000);

    const first = makeTempDir('panel-openfile-first');
    const second = makeTempDir('panel-openfile-second');
    const dir = writeHostedTask(second, 'hosted');
    const target = path.join(second, 'notes', 'a b.md');
    writeFile(target, '# a note\n');
    writeFile(path.join(first, 'notes', 'a b.md'), '# the wrong note\n');

    const index = makeIndex([second], makeTempDir('panel-openfile-storage'));
    await index.index.load();
    const log: string[] = [];
    const panel = new TaskPanel({
      context: stubContext(),
      index: index.index,
      log: (line) => log.push(line),
      folders: () => folderStubs([first, second])
    });
    const spy = spyOnCommand('vscode.open');
    try {
      await panel.show({ mode: 'task', folderUri: folderUriOf(dir) });
      await panel.handleMessage({ type: 'openFile', workspaceRelPath: 'notes/a%20b.md' });

      assert.equal(spy.calls.length, 1, `openFile opened nothing: ${log.join(' | ')}`);
      assert.equal(
        (spy.calls[0] as vscode.Uri).fsPath,
        target,
        'openFile resolved against the wrong workspace folder or did not decode its path'
      );
    } finally {
      spy.dispose();
      panel.dispose();
      index.dispose();
    }
  });
});
