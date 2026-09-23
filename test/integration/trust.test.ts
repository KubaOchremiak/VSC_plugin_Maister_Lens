import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { TaskPanel } from '../../src/panel/panel.ts';
import type { FallbackPayload } from '../../src/webview/fallbackTask.ts';
import { PANEL } from '../../src/strings.ts';
import {
  folderStubs,
  folderUriOf,
  makeIndex,
  makeTempDir,
  removeTempDirs,
  stubContext,
  writeHostedTask
} from '../helpers/tempWorkspace.ts';

after(() => removeTempDirs());

describe('trust/integration', () => {
  it('runs no hosted HTML, forces the fallback view, renders no browser button and drops the trust-gated messages (AC15, A2.2)', async function () {
    this.timeout(60_000);

    assert.equal(
      vscode.workspace.isTrusted,
      false,
      'this suite only means anything in an untrusted host; run it through test/helpers/untrustedHost.ts'
    );

    const workspace = makeTempDir('trust');
    const dir = writeHostedTask(workspace, 'hosted');
    const folderUri = folderUriOf(dir);
    const index = makeIndex([workspace], makeTempDir('trust-storage'));
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

    try {
      await panel.show({ mode: 'task', folderUri });
      const html = panel.html ?? '';

      assert.equal(panel.isHosting, false, 'an untrusted workspace still hosted the task dashboard');
      assert.ok(!html.includes('<base href'), 'the hosted insertions reached an untrusted workspace');
      assert.ok(!html.includes('MAISTER_DATA'), "the task's own dashboard markup was served");
      // The fallback body is built from the posted payload, so AC15 is asserted there.
      const payload = posted.find(
        (message) => (message as { type?: string }).type === 'task'
      ) as FallbackPayload | undefined;
      assert.ok(payload !== undefined, 'the fallback view posted no payload');
      assert.equal(payload.banner, PANEL.bannerUntrusted, 'the fallback view shows no trust banner');
      assert.equal(
        payload.openInBrowser,
        false,
        'the "Open dashboard in browser" button is rendered in an untrusted workspace (A2.2)'
      );
      assert.equal(payload.nextAction, null, 'a next-action button reached an untrusted workspace');
      assert.ok(
        !html.includes(PANEL.openInBrowser),
        'the browser button text reached the untrusted document'
      );

      for (const message of [
        { type: 'startWorkflow' },
        { type: 'runNextAction', folderUri },
        { type: 'openInBrowser', folderUri, artifactRelPath: 'dashboard.html' }
      ]) {
        const before = log.length;
        await panel.handleMessage(message);
        assert.equal(
          log.length,
          before + 1,
          `${message.type} was not dropped and logged in an untrusted workspace`
        );
        assert.match(log[log.length - 1], /trusted/);
      }

      assert.equal(panel.location?.mode, 'task', 'a dropped message still moved the panel');
    } finally {
      panel.dispose();
      index.dispose();
    }
  });
});
