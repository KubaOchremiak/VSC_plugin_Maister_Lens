import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { openRiskCount } from '../../src/model/risks.ts';
import type { TaskIndex } from '../../src/index/taskIndex.ts';
import { TaskPanel } from '../../src/panel/panel.ts';
import { DASHBOARD } from '../../src/strings.ts';
import { resetSharedFilter, sharedFilter } from '../../src/views/overviewView.ts';
import type { DashboardPayload } from '../../src/webview/dashboardMode.ts';
import {
  folderStubs,
  folderUriOf,
  makeIndex,
  makeTempDir,
  removeTempDirs,
  spyOnCommand,
  stubContext,
  writeTask
} from '../helpers/tempWorkspace.ts';

after(() => removeTempDirs());

interface Harness {
  readonly panel: TaskPanel;
  readonly index: TaskIndex;
  readonly payloads: DashboardPayload[];
  readonly folderUris: Record<string, string>;
  readonly taskCount: number;
  dispose(): void;
}

/** A small portfolio with a spread of types, statuses, verdicts and risks. */
async function dashboardHarness(prefix: string): Promise<Harness> {
  const workspace = makeTempDir(prefix);
  const folderUris: Record<string, string> = {};
  const write = (
    key: string,
    segment: string,
    options: Parameters<typeof writeTask>[3]
  ): void => {
    folderUris[key] = folderUriOf(writeTask(workspace, segment, key, options));
  };

  write('alpha', 'development', {
    title: 'Alpha',
    status: 'in_progress',
    risks: ['Alpha risk one', 'Alpha risk two']
  });
  write('beta', 'development', { title: 'Beta', status: 'completed', risks: ['Beta risk'] });
  write('gamma', 'research', { title: 'Gamma', status: 'completed', risks: [] });
  write('delta', 'research', { title: 'Delta', status: 'blocked', risks: ['"resolved: Delta risk"'] });
  write('epsilon', 'migrations', { title: 'Epsilon', status: 'pending', risks: [] });

  const index = makeIndex([workspace], makeTempDir(`${prefix}-storage`));
  await index.index.load();

  resetSharedFilter();
  const payloads: DashboardPayload[] = [];
  const panel = new TaskPanel({
    context: stubContext(),
    index: index.index,
    log: () => undefined,
    folders: () => folderStubs([workspace])
  });
  panel.onDidPost((message) => {
    if ((message as { type?: string }).type === 'dashboard') {
      payloads.push(message as DashboardPayload);
    }
  });

  return {
    panel,
    index: index.index,
    payloads,
    folderUris,
    taskCount: index.index.snapshot.tasks.size,
    dispose: () => {
      panel.dispose();
      index.dispose();
      resetSharedFilter();
    }
  };
}

function latest(harness: Harness): DashboardPayload {
  const payload = harness.payloads.at(-1);
  assert.ok(payload !== undefined, 'the panel posted no dashboard payload');
  return payload;
}

function chartOf(payload: DashboardPayload, key: string): DashboardPayload['charts'][number] {
  const chart = payload.charts.find((candidate) => candidate.key === key);
  assert.ok(chart !== undefined, `the payload carries no ${key} chart`);
  return chart;
}

function barTotal(payload: DashboardPayload, key: string): number {
  return chartOf(payload, key).bars.reduce((sum, bar) => sum + bar.count, 0);
}

describe('dashboardMode/integration', () => {
  it('carries pre-aggregated charts over the whole index and rows capped at 1,000, with charts unfiltered while rows follow the TaskQuery (AC8)', async function () {
    this.timeout(60_000);

    const harness = await dashboardHarness('dash-charts');
    try {
      await harness.panel.show({ mode: 'dashboard' });
      const unfiltered = latest(harness);

      assert.equal(unfiltered.rowLimit, 1_000, 'the row cap is not 1,000');
      assert.equal(
        unfiltered.rows.length,
        Math.min(unfiltered.matched, unfiltered.rowLimit),
        'rows are not the matched set capped at the row limit'
      );
      assert.equal(unfiltered.total, harness.taskCount);
      assert.equal(unfiltered.rows.length, harness.taskCount, 'an unfiltered dashboard hid rows');

      assert.equal(barTotal(unfiltered, 'status'), harness.taskCount, 'the status chart is not over the whole index');
      assert.equal(barTotal(unfiltered, 'type'), harness.taskCount, 'the type chart is not over the whole index');
      assert.equal(
        chartOf(unfiltered, 'created').weeks.length,
        12,
        'the created chart does not carry 12 weeks'
      );
      assert.ok(
        chartOf(unfiltered, 'created').bars.length === 0,
        'week columns must not be bars — they are not filters'
      );

      // AC8 — the panel writes the one shared TaskQuery instance, not a copy of its own.
      const before = sharedFilter().value;
      await harness.panel.handleMessage({ type: 'setFilter', patch: { types: ['research'] } });
      assert.notEqual(sharedFilter().value, before, 'the shared filter was not updated');
      assert.deepEqual(sharedFilter().value.types, ['research']);

      const filtered = latest(harness);
      assert.deepEqual(
        filtered.rows.map((row) => row.title).sort(),
        ['Delta', 'Gamma'],
        'dashboard rows do not follow the shared TaskQuery'
      );
      assert.equal(barTotal(filtered, 'status'), harness.taskCount, 'a filter changed the chart counts');
      assert.equal(barTotal(filtered, 'type'), harness.taskCount, 'a filter changed the chart counts');
      assert.ok(
        chartOf(filtered, 'type').bars.some((bar) => bar.key === 'research' && bar.pressed),
        'the pressed bar does not reflect the active facet'
      );
      assert.ok(
        filtered.filter.chips.some((chip) => chip.label.includes('Research')),
        `the filter chip bar does not show the active facet: ${JSON.stringify(filtered.filter.chips)}`
      );
    } finally {
      harness.dispose();
    }
  });

  it('gives the Open risks KPI the sum of openRiskCount over the index and names the same k tasks (A5, AC18)', async function () {
    this.timeout(60_000);

    const harness = await dashboardHarness('dash-kpi');
    try {
      await harness.panel.show({ mode: 'dashboard' });
      const payload = latest(harness);

      const tasks = [...harness.index.snapshot.tasks.values()];
      const expected = tasks.reduce((sum, task) => sum + openRiskCount(task), 0);
      const tasksWithRisks = tasks.filter((task) => openRiskCount(task) > 0).length;
      assert.ok(expected > 0, 'the fixture portfolio records no open risks');

      const tile = payload.kpis.find((kpi) => kpi.key === 'openRisks');
      assert.ok(tile !== undefined, 'the dashboard carries no Open risks tile');
      assert.equal(tile.value, expected, 'the Open risks tile recounts risks instead of reading openRiskCount');
      assert.equal(tile.context, DASHBOARD.openRisksContext.replace('{k}', String(tasksWithRisks)));
      assert.deepEqual(
        payload.kpis.map((kpi) => kpi.key),
        ['tasks', 'failedVerification', 'quiet', 'openRisks'],
        'the KPI tiles are out of § 5.5 order'
      );
      assert.ok(
        payload.kpis.every((kpi) => kpi.glyph !== '' && kpi.label !== '' && kpi.context !== ''),
        'a KPI tile carries colour without a glyph, a label and a context line'
      );
    } finally {
      harness.dispose();
    }
  });

  it('runs the composed command from the Next cell, and a row title launches nothing (AC17)', async function () {
    this.timeout(60_000);

    const harness = await dashboardHarness('dash-next');
    const spy = spyOnCommand('maister.runNextAction');
    const dispatched = spy.calls as { folderUri?: string }[];
    try {
      await harness.panel.show({ mode: 'dashboard' });
      const payload = latest(harness);
      const row = payload.rows.find((candidate) => candidate.folderUri === harness.folderUris.alpha);
      assert.ok(row !== undefined, 'the unfinished task has no dashboard row');
      assert.ok(row.nextAction !== null, 'an unfinished task shows no next action in the Next cell');

      await harness.panel.handleMessage({ type: 'runNextAction', folderUri: row.folderUri });
      assert.deepEqual(dispatched, [{ folderUri: row.folderUri }], 'the Next cell did not reach the command');

      await harness.panel.handleMessage({ type: 'openTask', folderUri: row.folderUri });
      assert.equal(dispatched.length, 1, 'activating a row title launched a next action');
      assert.equal(harness.panel.location?.mode, 'task', 'a row title did not open Task mode');
    } finally {
      spy.dispose();
      harness.dispose();
    }
  });
});

describe('panel/integration', () => {
  it('runs the composed command for runNextAction from all four surfaces (AC17)', async function () {
    this.timeout(60_000);

    const harness = await dashboardHarness('next-surfaces');
    const spy = spyOnCommand('maister.runNextAction');
    const dispatched = spy.calls as { folderUri?: string }[];
    const folderUri = harness.folderUris.alpha;
    try {
      // Now row — the tree item's inline command carries the node.
      await vscode.commands.executeCommand('maister.runNextAction', { folderUri });

      // Overview row, fallback header and the Dashboard Next cell all post the same message;
      // the host cannot reach a webview DOM (A16), so each surface is exercised at its boundary.
      await harness.panel.show({ mode: 'task', folderUri });
      await harness.panel.handleMessage({ type: 'runNextAction', folderUri });

      await harness.panel.show({ mode: 'dashboard' });
      await harness.panel.handleMessage({ type: 'runNextAction', folderUri });

      const { OverviewViewProvider } = await import('../../src/views/overviewView.ts');
      const provider = new OverviewViewProvider(stubContext(), harness.index, () => undefined);
      try {
        await provider.handleMessage({ type: 'runNextAction', folderUri });
      } finally {
        provider.dispose();
      }

      assert.deepEqual(
        dispatched.map((argument) => argument?.folderUri ?? ''),
        [folderUri, folderUri, folderUri, folderUri],
        'one of the four surfaces did not reach maister.runNextAction with the task folderUri'
      );
    } finally {
      spy.dispose();
      harness.dispose();
    }
  });
});
