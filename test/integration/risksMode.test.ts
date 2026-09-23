import { strict as assert } from 'node:assert';
import type { TaskIndex } from '../../src/index/taskIndex.ts';
import { validate } from '../../src/panel/messages.ts';
import { collectRisks, openRiskCount } from '../../src/model/risks.ts';
import { TaskPanel } from '../../src/panel/panel.ts';
import { resetSharedFilter, sharedFilter } from '../../src/views/overviewView.ts';
import type { RisksPayload } from '../../src/webview/risksMode.ts';
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

interface Harness {
  readonly panel: TaskPanel;
  readonly index: TaskIndex;
  readonly payloads: RisksPayload[];
  readonly folderUris: Record<string, string>;
  dispose(): void;
}

async function risksHarness(prefix: string): Promise<Harness> {
  const workspace = makeTempDir(prefix);
  const folderUris: Record<string, string> = {};
  const write = (key: string, segment: string, options: Parameters<typeof writeTask>[3]): void => {
    folderUris[key] = folderUriOf(writeTask(workspace, segment, key, options));
  };

  write('alpha', 'development', {
    title: 'Alpha',
    status: 'in_progress',
    risks: [
      'Retries reuse keys across different amounts',
      '"resolved: Limits were tuned on staging traffic only"'
    ]
  });
  write('beta', 'research', {
    title: 'Beta',
    status: 'completed',
    risks: ['Two reporting services read the old store directly']
  });
  write('gamma', 'development', { title: 'Gamma', status: 'completed', risks: [] });

  const index = makeIndex([workspace], makeTempDir(`${prefix}-storage`));
  await index.index.load();

  resetSharedFilter();
  const payloads: RisksPayload[] = [];
  const panel = new TaskPanel({
    context: stubContext(),
    index: index.index,
    log: () => undefined,
    folders: () => folderStubs([workspace])
  });
  panel.onDidPost((message) => {
    if ((message as { type?: string }).type === 'risks') {
      payloads.push(message as RisksPayload);
    }
  });

  return {
    panel,
    index: index.index,
    payloads,
    folderUris,
    dispose: () => {
      panel.dispose();
      index.dispose();
      resetSharedFilter();
    }
  };
}

function latest(harness: Harness): RisksPayload {
  const payload = harness.payloads.at(-1);
  assert.ok(payload !== undefined, 'the panel posted no risks payload');
  return payload;
}

const RISK_KEYS = ['text', 'resolved', 'source', 'sourceKind', 'artifactRelPath'];

describe('risksMode/integration', () => {
  it('lists each risk once per task, orders groups by activityMtime, and carries no severity and no age field (AC18)', async function () {
    this.timeout(60_000);

    const harness = await risksHarness('risks-shape');
    try {
      await harness.panel.show({ mode: 'risks' });
      const payload = latest(harness);

      assert.ok(payload.groups.length > 0, 'the risks payload carries no groups');
      for (const group of payload.groups) {
        const task = harness.index.snapshot.tasks.get(group.folderUri);
        assert.ok(task !== undefined, `group ${group.folderUri} is not in the index`);
        assert.deepEqual(
          [...group.risks].map((risk) => risk.text).sort(),
          collectRisks(task).map((risk) => risk.text).sort(),
          'a group does not list collectRisks once per task (A5)'
        );
        assert.equal(
          new Set(group.risks.map((risk) => risk.text)).size,
          group.risks.length,
          'a risk is listed twice in one group'
        );
        for (const risk of group.risks) {
          assert.deepEqual(
            Object.keys(risk).sort(),
            [...RISK_KEYS].sort(),
            `a risk row carries fields Maister does not record: ${JSON.stringify(risk)}`
          );
        }
      }

      const activity = payload.groups.map(
        (group) => harness.index.snapshot.tasks.get(group.folderUri)?.activityMtime ?? 0
      );
      assert.deepEqual(
        activity,
        [...activity].sort((left, right) => right - left),
        'groups are not ordered by the owning task activityMtime'
      );

      const serialized = JSON.stringify(payload);
      assert.equal(/severity/i.test(serialized), false, 'the risks payload invents a severity');
      assert.equal(
        /\bage\b|daysOld|riskAge/i.test(serialized),
        false,
        'the risks payload invents a risk age'
      );
    } finally {
      harness.dispose();
    }
  });

  it('carries the full resolved-and-unresolved set so only the type facet round-trips (A2)', async function () {
    this.timeout(60_000);

    const harness = await risksHarness('risks-local');
    try {
      await harness.panel.show({ mode: 'risks' });
      const payload = latest(harness);

      const alpha = payload.groups.find((group) => group.folderUri === harness.folderUris.alpha);
      assert.ok(alpha !== undefined, 'the task with risks has no group');
      assert.ok(
        alpha.risks.some((risk) => risk.resolved),
        'the payload withholds resolved risks, so Show resolved would need a round-trip'
      );
      assert.ok(
        alpha.risks.some((risk) => !risk.resolved),
        'the payload withholds open risks'
      );
      assert.ok(
        payload.groups.some((group) => group.unfinished) &&
          payload.groups.some((group) => !group.unfinished),
        'the payload cannot serve the Unfinished/Completed toggles locally'
      );

      // Text search, status toggles, show-resolved and group-by are webview-local by A2:
      // there is no message for them at all.
      for (const type of ['setGroupBy', 'setShowResolved', 'setRiskSearch', 'setRiskStatus']) {
        assert.equal(
          validate({ type }, { isIndexed: () => true, isTrusted: true }).ok,
          false,
          `${type} crossed the A2 allowlist`
        );
      }

      // The type facet is the one exception — it round-trips through the shared filter.
      await harness.panel.handleMessage({ type: 'setFilter', patch: { types: ['research'] } });
      assert.deepEqual(sharedFilter().value.types, ['research']);
      const scoped = latest(harness);
      assert.deepEqual(
        scoped.groups.map((group) => group.folderUri),
        [harness.folderUris.beta],
        'the shared type facet did not re-scope the risks payload'
      );
      assert.ok(
        scoped.typeFacets.some((facet) => facet.key === 'research' && facet.pressed),
        'the type chips do not reflect the shared facet'
      );
    } finally {
      harness.dispose();
    }
  });

  it('scopes the mode to one task when openRisks carries a folderUri, with openRiskCount rows (success criterion 6)', async function () {
    this.timeout(60_000);

    const harness = await risksHarness('risks-scope');
    try {
      await harness.panel.handleMessage({
        type: 'openRisks',
        folderUri: harness.folderUris.alpha
      });
      assert.deepEqual(harness.panel.location, {
        mode: 'risks',
        folderUri: harness.folderUris.alpha
      });

      const payload = latest(harness);
      assert.deepEqual(
        payload.groups.map((group) => group.folderUri),
        [harness.folderUris.alpha],
        'a scoped Risks mode shows other tasks'
      );
      assert.equal(payload.scopedTitle, 'Alpha', 'a scoped Risks mode does not name its task');

      const task = harness.index.snapshot.tasks.get(harness.folderUris.alpha);
      assert.ok(task !== undefined);
      const group = payload.groups[0];
      assert.equal(group.openCount, openRiskCount(task), 'the group count is not openRiskCount');
      assert.equal(
        group.risks.filter((risk) => !risk.resolved).length,
        openRiskCount(task),
        'the rows shown disagree with openRiskCount (AC18)'
      );
      const tile = payload.kpis.find((kpi) => kpi.key === 'openRisks');
      assert.equal(tile?.value, openRiskCount(task), 'the Open risks tile disagrees with the rows');
    } finally {
      harness.dispose();
    }
  });
});
