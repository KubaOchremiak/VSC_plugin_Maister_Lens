import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { sameArtifactLocation, type RenderPayload } from '../../src/panel/render.ts';
import { TaskPanel } from '../../src/panel/panel.ts';
import {
  folderStubs,
  folderUriOf,
  makeIndex,
  makeTempDir,
  removeTempDirs,
  stubContext,
  waitFor,
  writeFile,
  writeTask
} from '../helpers/tempWorkspace.ts';

after(() => removeTempDirs());

const ARTIFACT = 'implementation/implementation-plan.md';

interface Harness {
  readonly panel: TaskPanel;
  readonly index: ReturnType<typeof makeIndex>;
  readonly folderUri: string;
  readonly dir: string;
  readonly posted: unknown[];
  readonly workspace: string;
  dispose(): void;
}

async function readerPanel(prefix: string): Promise<Harness> {
  const workspace = makeTempDir(prefix);
  const dir = writeTask(workspace, 'development', 'auth-rotation', {
    title: 'Auth token rotation',
    artifacts: [
      { relPath: 'implementation/spec.md', label: 'Specification' },
      { relPath: ARTIFACT, label: 'Implementation Plan' }
    ]
  });
  writeFile(
    path.join(dir, ARTIFACT),
    '# Implementation Plan\n\n## TL;DR\n\nFour task groups.\n\n## Overview\n\nFirst body line.\n'
  );
  const index = makeIndex([workspace], makeTempDir(`${prefix}-storage`));
  await index.index.load();

  const posted: unknown[] = [];
  const panel = new TaskPanel({
    context: stubContext(),
    index: index.index,
    log: () => undefined,
    folders: () => folderStubs([workspace])
  });
  panel.onDidPost((message) => posted.push(message));

  return {
    panel,
    index,
    dir,
    workspace,
    folderUri: folderUriOf(dir),
    posted,
    dispose: () => {
      panel.dispose();
      index.dispose();
    }
  };
}

function renders(posted: readonly unknown[]): RenderPayload[] {
  return posted.filter(
    (message) => (message as { type?: string }).type === 'render'
  ) as RenderPayload[];
}

function openTabs(): number {
  return vscode.window.tabGroups.all.reduce((count, group) => count + group.tabs.length, 0);
}

describe('reader/integration', () => {
  it('routes every artifact navigation through render.ts and reaches vscode.open only via openSource (AC5)', async function () {
    this.timeout(60_000);

    const harness = await readerPanel('reader-route');
    try {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('maister.openArtifactSource'),
        'maister.openArtifactSource is contributed but not registered'
      );
      assert.ok(
        commands.includes('maister.panel.toggleVariant'),
        'maister.panel.toggleVariant is contributed but not registered'
      );

      await harness.panel.show({ mode: 'task', folderUri: harness.folderUri });
      const tabsBefore = openTabs();

      await harness.panel.handleMessage({
        type: 'openArtifact',
        folderUri: harness.folderUri,
        artifactRelPath: ARTIFACT,
        variant: 'md'
      });

      const rendered = renders(harness.posted);
      assert.equal(rendered.length, 1, `the artifact did not route through render.ts: ${rendered.length}`);
      assert.ok(rendered[0].bodyHtml.includes('First body line.'), 'the body was not rendered');
      assert.equal(rendered[0].summary?.tldr, 'Four task groups.');
      assert.equal(rendered[0].artifactLabel, 'Implementation Plan');
      assert.deepEqual(
        rendered[0].heroes.map((hero) => hero.current),
        rendered[0].heroes.map((hero) => hero.artifactRelPath === ARTIFACT),
        'the current hero chip is not the open artifact'
      );
      assert.equal(openTabs(), tabsBefore, 'rendering an artifact opened a source editor');

      await harness.panel.handleMessage({
        type: 'openSource',
        folderUri: harness.folderUri,
        artifactRelPath: ARTIFACT
      });
      await waitFor(() => openTabs() > tabsBefore, 5_000, 'openSource opened no editor');
    } finally {
      harness.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    }
  });

  it('re-renders and re-posts an open artifact on a watcher change, at the same location so scroll is restored', async function () {
    this.timeout(60_000);

    const harness = await readerPanel('reader-live');
    try {
      await harness.panel.show({
        mode: 'artifact',
        folderUri: harness.folderUri,
        artifactRelPath: ARTIFACT,
        variant: 'md'
      });
      const first = renders(harness.posted);
      assert.equal(first.length, 1, 'the first render was not posted');
      const htmlBefore = harness.panel.html;

      writeFile(
        path.join(harness.dir, ARTIFACT),
        '# Implementation Plan\n\n## TL;DR\n\nFour task groups.\n\n## Overview\n\nSecond body line.\n'
      );
      await harness.index.index.touchActivity(harness.folderUri);
      harness.index.index.publishPending();

      await waitFor(
        () => renders(harness.posted).length > 1,
        5_000,
        'the changed artifact was not re-posted'
      );
      const latest = renders(harness.posted).at(-1) as RenderPayload;
      assert.ok(latest.bodyHtml.includes('Second body line.'), 'the re-render carried stale HTML');
      assert.ok(
        sameArtifactLocation(latest.location, first[0].location),
        'the re-post changed location, so the reader would not restore scrollY'
      );
      assert.equal(
        harness.panel.html,
        htmlBefore,
        'the panel document was rebuilt, which discards the reader scroll position'
      );
    } finally {
      harness.dispose();
    }
  });
});
