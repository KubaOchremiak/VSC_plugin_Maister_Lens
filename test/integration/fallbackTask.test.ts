import { strict as assert } from 'node:assert';
import { openRiskCount } from '../../src/model/risks.ts';
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
  writeTask
} from '../helpers/tempWorkspace.ts';

after(() => removeTempDirs());

describe('fallbackTask/integration', () => {
  it('the html_output:false task payload carries the banner reason, phases, decisions and risks (AC6)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('fallback');
    const dir = writeTask(workspace, 'development', 'auth-rotation', {
      title: 'Auth token rotation',
      risks: [
        'Mobile clients on v3.x cannot handle a rotated token',
        'resolved: Clock skew on token expiry'
      ],
      decisions: ['Rotate on every use'],
      artifacts: [{ relPath: 'implementation/spec.md', label: 'Specification' }]
    });
    const folderUri = folderUriOf(dir);
    const index = makeIndex([workspace], makeTempDir('fallback-storage'));
    await index.index.load();

    const posted: unknown[] = [];
    const panel = new TaskPanel({
      context: stubContext(),
      index: index.index,
      log: () => undefined,
      folders: () => folderStubs([workspace])
    });
    panel.onDidPost((message) => posted.push(message));

    try {
      await panel.show({ mode: 'task', folderUri });
      assert.equal(panel.isHosting, false, 'a task without a dashboard was hosted');

      const payload = posted.find(
        (message) => (message as { type?: string }).type === 'task'
      ) as FallbackPayload | undefined;
      assert.ok(payload !== undefined, `no task payload was posted: ${JSON.stringify(posted)}`);

      assert.equal(payload.banner, PANEL.bannerNoDashboard);
      assert.equal(payload.openInBrowser, false, 'a task with no dashboard offered the browser button');

      assert.ok(payload.phases.length > 0, 'the payload carries no phases');
      assert.ok(
        payload.phases.every((phase) => phase.glyph !== '' && phase.statusText !== ''),
        'a phase glyph carries no text beside it'
      );

      assert.ok(payload.decisions.length > 0, 'the payload carries no decisions');
      assert.ok(
        payload.decisions.some((group) =>
          group.items.some((item) => item.text.includes('Rotate on every use'))
        ),
        `the recorded decision is missing: ${JSON.stringify(payload.decisions)}`
      );
      assert.ok(
        payload.decisions.every((group) => group.source !== ''),
        'decisions are not grouped by source'
      );

      const task = index.index.snapshot.tasks.get(folderUri);
      assert.ok(task !== undefined);
      assert.equal(
        payload.risks.filter((risk) => !risk.resolved).length,
        openRiskCount(task),
        'the fallback view recounts risks instead of reading collectRisks (A5)'
      );
      assert.ok(
        payload.risks.some((risk) => risk.text.includes('Mobile clients')),
        `the recorded risk is missing: ${JSON.stringify(payload.risks)}`
      );
      assert.deepEqual(
        payload.risks.map((risk) => risk.resolved),
        [...payload.risks.map((risk) => risk.resolved)].sort((left, right) =>
          Number(left) - Number(right)
        ),
        'resolved risks are not ordered after the open ones'
      );
    } finally {
      panel.dispose();
      index.dispose();
    }
  });
});
