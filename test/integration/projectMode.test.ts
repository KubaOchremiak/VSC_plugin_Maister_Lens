import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { TaskPanel } from '../../src/panel/panel.ts';
import type { DocRenderPayload } from '../../src/panel/render.ts';
import type { ProjectPayload } from '../../src/webview/projectMode.ts';
import {
  folderStubs,
  folderUriOf,
  makeIndex,
  makeTempDir,
  removeTempDirs,
  spyOnCommand,
  stubContext,
  waitFor,
  writeFile
} from '../helpers/tempWorkspace.ts';

after(() => removeTempDirs());

const INDEX_MD = [
  '# Documentation Index',
  '',
  '## Project Documentation',
  '',
  '#### Vision (`project/vision.md`)',
  'Lens is a read-only view over Maister tasks.',
  '',
  '#### Tech Stack (`project/tech-stack.md`)',
  'TypeScript on the VS Code Extension API.',
  '',
  '## Technical Standards',
  ''
].join('\n');

interface Harness {
  readonly panel: TaskPanel;
  readonly workspace: string;
  readonly posted: unknown[];
  dispose(): void;
}

async function projectHarness(prefix: string, withDocs: boolean): Promise<Harness> {
  const workspace = makeTempDir(prefix);
  if (withDocs) {
    const docs = path.join(workspace, '.maister', 'docs');
    writeFile(path.join(docs, 'INDEX.md'), INDEX_MD);
    writeFile(path.join(docs, 'project', 'vision.md'), '# Vision\n\nThe first line.\n');
    writeFile(path.join(docs, 'standards', 'global', 'coding-style.md'), '# Coding style\n');
  }
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
    workspace,
    posted,
    dispose: () => {
      panel.dispose();
      index.dispose();
    }
  };
}

function last<T>(posted: unknown[], type: string): T | undefined {
  return posted.filter((message) => (message as { type?: string }).type === type).at(-1) as
    | T
    | undefined;
}

describe('projectMode/integration', () => {
  it('renders the project payload with the TL;DR and grouped docs (R2, R3, R4)', async () => {
    const harness = await projectHarness('project', true);
    try {
      await harness.panel.show({ mode: 'project' });
      const payload = last<ProjectPayload>(harness.posted, 'project');

      assert.ok(payload, 'no project payload was posted');
      assert.equal(payload.empty, false);
      assert.equal(payload.multiRoot, false);
      assert.equal(payload.sections.length, 1);
      const section = payload.sections[0];
      assert.equal(section.docsFolderUri, folderUriOf(harness.workspace));
      assert.equal(section.tldr.goal, 'The first line.');
      assert.equal(section.tldr.goalSource, 'project/vision.md');
      assert.equal(section.tldr.techStackSource, 'project/tech-stack.md');
      const relPaths = section.groups.flatMap((group) => group.docs.map((doc) => doc.relPath));
      assert.ok(relPaths.includes('project/vision.md'));
      assert.ok(relPaths.includes('standards/global/coding-style.md'));
    } finally {
      harness.dispose();
    }
  });

  it('posts an empty project payload when no folder has .maister/docs (R6)', async () => {
    const harness = await projectHarness('project-empty', false);
    try {
      await harness.panel.show({ mode: 'project' });
      const payload = last<ProjectPayload>(harness.posted, 'project');

      assert.equal(payload?.empty, true);
      assert.deepEqual(payload?.sections, []);
    } finally {
      harness.dispose();
    }
  });

  it('opens a real doc from an openDoc message in doc mode (R7)', async () => {
    const harness = await projectHarness('project-doc', true);
    const docsFolderUri = folderUriOf(harness.workspace);
    try {
      await harness.panel.show({ mode: 'project' });
      await harness.panel.handleMessage({
        type: 'openDoc',
        docsFolderUri,
        docRelPath: 'project/vision.md'
      });
      const payload = last<DocRenderPayload>(harness.posted, 'render');

      assert.deepEqual(harness.panel.location, {
        mode: 'doc',
        docsFolderUri,
        docRelPath: 'project/vision.md'
      });
      assert.equal(payload?.kind, 'doc');
      assert.equal(payload?.refused, false);
      assert.match(payload?.bodyHtml ?? '', /The first line/);
    } finally {
      harness.dispose();
    }
  });

  it('opens the shown doc from an editDoc built from the Project page and render payloads', async () => {
    const harness = await projectHarness('project-edit-roundtrip', true);
    const spy = spyOnCommand('vscode.open');
    try {
      await harness.panel.show({ mode: 'project' });
      const section = last<ProjectPayload>(harness.posted, 'project')?.sections[0];
      assert.ok(section, 'no project section was posted');
      await harness.panel.handleMessage({
        type: 'openDoc',
        docsFolderUri: section.docsFolderUri,
        docRelPath: 'project/vision.md'
      });
      const { location } = last<DocRenderPayload>(harness.posted, 'render') ?? assert.fail('no render');

      await harness.panel.handleMessage({
        type: 'editDoc',
        docsFolderUri: location.docsFolderUri,
        docRelPath: location.docRelPath
      });

      assert.equal(spy.calls.length, 1);
      assert.equal(
        (spy.calls[0] as vscode.Uri).fsPath,
        path.join(harness.workspace, '.maister', 'docs', 'project', 'vision.md')
      );
    } finally {
      spy.dispose();
      harness.dispose();
    }
  });

  it('opens nothing for a refused editDoc', async () => {
    const harness = await projectHarness('project-edit-refused', true);
    const spy = spyOnCommand('vscode.open');
    try {
      await harness.panel.handleMessage({
        type: 'editDoc',
        docsFolderUri: folderUriOf(harness.workspace),
        docRelPath: 'project/tech-stack.yml'
      });
      await harness.panel.handleMessage({
        type: 'editDoc',
        docsFolderUri: folderUriOf(makeTempDir('project-edit-outside')),
        docRelPath: 'INDEX.md'
      });

      assert.equal(spy.calls.length, 0);
    } finally {
      spy.dispose();
      harness.dispose();
    }
  });

  it('republishes the open doc at the same location when it is edited (R11)', async () => {
    const harness = await projectHarness('project-watch', true);
    const docsFolderUri = folderUriOf(harness.workspace);
    try {
      await harness.panel.show({ mode: 'doc', docsFolderUri, docRelPath: 'project/vision.md' });
      const before = harness.panel.location;
      writeFile(
        path.join(harness.workspace, '.maister', 'docs', 'project', 'vision.md'),
        '# Vision\n\nAn edited line.\n'
      );

      await waitFor(
        () => /An edited line/.test(last<DocRenderPayload>(harness.posted, 'render')?.bodyHtml ?? ''),
        5_000,
        'the edited doc republish'
      );
      assert.equal(harness.panel.location, before);
    } finally {
      harness.dispose();
    }
  });

  it('does not republish a doc in folder A when docs in folder B change (R11)', async () => {
    const a = makeTempDir('project-a');
    const b = makeTempDir('project-b');
    for (const workspace of [a, b]) {
      writeFile(path.join(workspace, '.maister', 'docs', 'INDEX.md'), INDEX_MD);
      writeFile(path.join(workspace, '.maister', 'docs', 'project', 'vision.md'), '# Vision\n');
    }
    const index = makeIndex([a, b], makeTempDir('project-ab-storage'));
    await index.index.load();
    const posted: unknown[] = [];
    const panel = new TaskPanel({
      context: stubContext(),
      index: index.index,
      log: () => undefined,
      folders: () => folderStubs([a, b])
    });
    panel.onDidPost((message) => posted.push(message));
    try {
      await panel.show({ mode: 'doc', docsFolderUri: folderUriOf(a), docRelPath: 'project/vision.md' });
      const renders = posted.filter((m) => (m as { type?: string }).type === 'render').length;
      writeFile(path.join(b, '.maister', 'docs', 'project', 'vision.md'), '# Vision\n\nChanged in B.\n');
      await new Promise((resolve) => setTimeout(resolve, 1_000));

      assert.equal(posted.filter((m) => (m as { type?: string }).type === 'render').length, renders);
    } finally {
      panel.dispose();
      index.dispose();
    }
  });

  it('limits doc-mode resource roots to media, bundles and <folder>/.maister/docs (R7)', async () => {
    const harness = await projectHarness('project-roots', true);
    const docsFolderUri = folderUriOf(harness.workspace);
    try {
      await harness.panel.show({ mode: 'doc', docsFolderUri, docRelPath: 'project/vision.md' });
      const roots = (harness.panel as unknown as { resourceRoots(): { path: string }[] })
        .resourceRoots()
        .map((uri) => uri.path);

      assert.equal(roots.length, 3);
      assert.ok(roots[0].endsWith('/media'));
      assert.ok(roots[1].endsWith('/dist/webview'));
      assert.equal(roots[2], `${new URL(docsFolderUri).pathname}/.maister/docs`);
    } finally {
      harness.dispose();
    }
  });
});
