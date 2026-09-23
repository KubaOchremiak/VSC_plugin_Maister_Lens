import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import {
  FILTERED_CONTEXT_KEY,
  OverviewViewProvider,
  resetSharedFilter,
  sharedFilter
} from '../../src/views/overviewView.ts';
import { OVERVIEW } from '../../src/strings.ts';
import {
  STATE_FILE,
  folderUriOf,
  makeIndex,
  makeTempDir,
  removeTempDirs,
  stubContext,
  taskState,
  writeFile,
  writeTask
} from '../helpers/tempWorkspace.ts';
import * as path from 'node:path';

after(() => removeTempDirs());

describe('overview/integration', () => {
  it('round-trips setFilter, clearFilter and openDashboard over one shared TaskQuery (AC8)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('overview-filter');
    const alpha = writeTask(workspace, 'development', 'alpha', { status: 'in_progress' });
    writeTask(workspace, 'research', 'beta', { status: 'completed' });

    resetSharedFilter();
    const harness = makeIndex([workspace], makeTempDir('overview-filter-storage'));
    const log: string[] = [];
    const provider = new OverviewViewProvider(stubContext(), harness.index, (line) => log.push(line));

    const dispatched: unknown[] = [];
    const commands = await vscode.commands.getCommands(true);
    const spy = commands.includes('maister.openDashboard')
      ? undefined
      : vscode.commands.registerCommand('maister.openDashboard', (argument: unknown) =>
          dispatched.push(argument ?? 'maister.openDashboard')
        );

    try {
      await harness.index.load();

      assert.equal(
        provider.filter,
        sharedFilter(),
        'Overview does not hold the shared filter instance Dashboard mode reads'
      );
      assert.equal(provider.filter.isFiltered, false);
      assert.equal(FILTERED_CONTEXT_KEY, 'maister.overview.filtered');

      await provider.handleMessage({ type: 'setFilter', patch: { types: ['development'] } });
      assert.deepEqual(sharedFilter().value.types, ['development'], 'setFilter did not reach the shared query');
      assert.equal(provider.filter.isFiltered, true, 'the filtered context key would still read false');
      assert.deepEqual(
        provider.buildPayload().groups.flatMap((group) => group.rows.map((row) => row.folderUri)),
        [folderUriOf(alpha)],
        'the filtered payload does not reflect the shared query'
      );

      await provider.handleMessage({ type: 'openDashboard' });
      if (spy !== undefined) {
        assert.equal(dispatched.length, 1, 'openDashboard did not execute maister.openDashboard');
      }
      assert.deepEqual(
        sharedFilter().value.types,
        ['development'],
        'opening the dashboard lost the shared filter'
      );

      await provider.handleMessage({ type: 'clearFilter' });
      assert.equal(provider.filter.isFiltered, false, 'clearFilter left a facet set');

      await provider.handleMessage({ type: 'setGroupBy', groupBy: 'status' });
      await provider.handleMessage({ type: 'setFilter', patch: { text: 'x'.repeat(201) } });
      await provider.handleMessage({ type: 'openTask', folderUri: 'file:///not/in/the/index' });
      assert.equal(log.length, 3, `the A2 allowlist let a message through: ${log.join(' | ')}`);
      assert.equal(provider.filter.isFiltered, false, 'a refused message still changed the filter');
    } finally {
      spy?.dispose();
      provider.dispose();
      harness.dispose();
      resetSharedFilter();
    }
  });

  it('posts row fields only, at most 50 tasks per group, and never a Task object (A2)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('overview-payload');
    for (let n = 0; n < 55; n += 1) {
      writeTask(workspace, 'development', `task-${String(n).padStart(2, '0')}`, {
        status: 'in_progress',
        artifacts: [{ relPath: 'implementation/spec.md', label: 'Specification' }]
      });
    }

    resetSharedFilter();
    const harness = makeIndex([workspace], makeTempDir('overview-payload-storage'));
    const provider = new OverviewViewProvider(stubContext(), harness.index, () => undefined);
    try {
      await harness.index.load();
      await provider.handleMessage({ type: 'setFilter', patch: { statuses: ['in_progress'] } });

      const payload = provider.buildPayload();
      const development = payload.groups.find((group) => group.key === 'development');
      assert.ok(development, 'no development group in the payload');
      assert.equal(development.count, 55);
      assert.equal(development.rows.length, 50, 'the payload is not capped at 50 rows per group');
      assert.equal(development.truncated, true, 'the truncation flag is missing');

      const row = development.rows[0];
      assert.deepEqual(
        Object.keys(row).sort(),
        [
          'description',
          'folderUri',
          'heroes',
          'markers',
          'nextAction',
          'statusGlyph',
          'statusText',
          'title'
        ],
        'the row carries fields beyond the § 4.2 set'
      );
      assert.equal(row.statusText, 'in progress', 'status is carried by the glyph alone');

      const serialized = JSON.stringify(payload);
      for (const leaked of ['"ref"', '"phases"', '"parseIssues"', '"artifacts"', '"stateMtime"']) {
        assert.ok(!serialized.includes(leaked), `a full Task leaked into the payload: ${leaked}`);
      }
      assert.equal(payload.stats.total, 55);
      assert.equal(payload.stats.matched, 55);
      assert.equal(payload.stats.filterCount, 1);
    } finally {
      provider.dispose();
      harness.dispose();
      resetSharedFilter();
    }
  });

  it('groups by Month from created, falls back to the folder date prefix and orders newest first (§ 4.2)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('overview-month');
    // `orchestrator.created` wins over the folder name, so the two disagree on purpose.
    const datedDir = path.join(workspace, '.maister', 'tasks', 'development', '2026-01-09-dated');
    writeFile(
      path.join(datedDir, STATE_FILE),
      taskState({ title: 'Dated' }).replace('orchestrator:\n', 'orchestrator:\n  created: 2026-07-04T09:00:00Z\n')
    );
    writeTask(workspace, 'development', '2026-09-14-by-prefix', { title: 'By prefix' });
    writeTask(workspace, 'development', '2026-08-02-older', { title: 'Older' });
    writeTask(workspace, 'development', 'no-date-anywhere', { title: 'Undated' });

    resetSharedFilter();
    const harness = makeIndex([workspace], makeTempDir('overview-month-storage'));
    const provider = new OverviewViewProvider(stubContext(), harness.index, () => undefined);
    try {
      await harness.index.load();
      await provider.setGroupBy('month');
      assert.equal(provider.groupBy, 'month', 'Month is not a selectable grouping');

      const payload = provider.buildPayload();
      assert.equal(payload.groupBy, 'month', 'the payload does not carry the Month grouping');

      const keys = payload.groups.map((group) => group.key);
      assert.deepEqual(
        keys.filter((key) => /^\d{4}-\d{2}$/.test(key)),
        ['2026-09', '2026-08', '2026-07'],
        'dated month groups are not newest first, or created lost to the folder prefix'
      );
      assert.ok(keys.includes(OVERVIEW.monthUndated), 'a task with no date anywhere has no group');

      const july = payload.groups.find((group) => group.key === '2026-07');
      assert.deepEqual(
        july?.rows.map((row) => row.title),
        ['Dated'],
        'orchestrator.created did not win over the folder date prefix'
      );
      assert.equal(july?.label, '2026-07', 'a month group is not labelled by its YYYY-MM key');
    } finally {
      provider.dispose();
      harness.dispose();
      resetSharedFilter();
    }
  });
});
