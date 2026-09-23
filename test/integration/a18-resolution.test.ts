import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { TaskPanel } from '../../src/panel/panel.ts';
import {
  folderStubs,
  folderUriOf,
  makeIndex,
  makeTempDir,
  removeTempDirs,
  stubContext,
  waitFor,
  writeHostedTask
} from '../helpers/tempWorkspace.ts';

// This suite runs from out/test/integration; use the actual release identity so
// registering a different publisher does not silently break activation coverage.
const manifest = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')
) as { publisher: string; name: string };
const EXTENSION_ID = `${manifest.publisher}.${manifest.name}`;

after(() => removeTempDirs());

describe('smoke/integration', () => {
  it('@vscode/test-electron launches the pinned stable build and the extension activates', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} is not installed in the test host`);
    await extension.activate();
    assert.equal(extension.isActive, true);
    assert.ok(vscode.version.length > 0, 'the host reports no VS Code version');
  });
});

/**
 * The group-1 probe proved the resolution dependency; this keeps it proven through the real
 * panel now that the probe command is retired. The shim's `ready` carries the diagnostics,
 * since the extension host cannot read a webview's DOM (A16).
 */
describe('A18/integration', () => {
  it('the hosted panel loads dashboard-data.js with its ?t= cache-buster and populates window.MAISTER_DATA', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('a18');
    const dir = writeHostedTask(workspace, 'hosted');
    const index = makeIndex([workspace], makeTempDir('a18-storage'));
    await index.index.load();

    const received: Record<string, unknown>[] = [];
    const panel = new TaskPanel({
      context: stubContext(),
      index: index.index,
      log: () => undefined,
      folders: () => folderStubs([workspace])
    });
    panel.onDidReceive((message) => received.push(message as Record<string, unknown>));

    try {
      await panel.show({ mode: 'task', folderUri: folderUriOf(dir) });
      assert.equal(panel.isHosting, true, 'the real dashboard was not recognized as hostable');

      await waitFor(
        () => received.some((message) => message.type === 'ready'),
        30_000,
        'the shim never reported from the hosted dashboard'
      );
      const ready = received.find((message) => message.type === 'ready') ?? {};

      assert.equal(ready.dataLoaded, true, `the data script failed to load: ${String(ready.failure)}`);
      assert.match(
        String(ready.dataSrc),
        /dashboard-data\.js\?t=\d+$/,
        `the cache-buster did not survive resolution: ${String(ready.dataSrc)}`
      );
      assert.ok(
        String(ready.taskTitle).length > 0,
        'window.MAISTER_DATA carries no task title, so the fixture data did not execute'
      );
    } finally {
      panel.dispose();
      index.dispose();
    }
  });
});
