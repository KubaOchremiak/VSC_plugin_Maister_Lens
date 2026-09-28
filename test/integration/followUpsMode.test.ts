import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaskIndex } from '../../src/index/taskIndex.ts';
import { collectFollowUps, readDashboardData } from '../../src/model/followUps.ts';
import { TaskPanel } from '../../src/panel/panel.ts';
import { resetSharedFilter } from '../../src/views/overviewView.ts';
import type { FollowUpsPayload } from '../../src/webview/followUpsMode.ts';
import { FIXTURE_ROOT } from '../helpers/fixtures.ts';
import {
  folderStubs,
  folderUriOf,
  makeIndex,
  makeTempDir,
  removeTempDirs,
  stubContext
} from '../helpers/tempWorkspace.ts';

after(() => removeTempDirs());

const DATA_FILE = 'dashboard-data.js';

interface Harness {
  readonly panel: TaskPanel;
  readonly index: TaskIndex;
  readonly payloads: FollowUpsPayload[];
  readonly dirs: Record<string, string>;
  dispose(): void;
}

async function followUpsHarness(prefix: string): Promise<Harness> {
  const workspace = makeTempDir(prefix);
  const dirs: Record<string, string> = {};
  for (const name of ['fu-completed', 'fu-inprogress']) {
    const dir = path.join(workspace, '.maister', 'tasks', 'development', name);
    fs.cpSync(path.join(FIXTURE_ROOT, name), dir, { recursive: true });
    dirs[name] = dir;
  }

  const index = makeIndex([workspace], makeTempDir(`${prefix}-storage`));
  await index.index.load();

  resetSharedFilter();
  const payloads: FollowUpsPayload[] = [];
  const panel = new TaskPanel({
    context: stubContext(),
    index: index.index,
    log: () => undefined,
    folders: () => folderStubs([workspace])
  });
  panel.onDidPost((message) => {
    if ((message as { type?: string }).type === 'followUps') {
      payloads.push(message as FollowUpsPayload);
    }
  });

  return {
    panel,
    index: index.index,
    payloads,
    dirs,
    dispose: () => {
      panel.dispose();
      index.dispose();
      resetSharedFilter();
    }
  };
}

function latest(harness: Harness): FollowUpsPayload {
  const payload = harness.payloads.at(-1);
  assert.ok(payload !== undefined, 'the panel posted no follow-ups payload');
  return payload;
}

describe('followUpsMode/integration', () => {
  it('lists the follow-ups of completed tasks only, with the verdict breakdown and issue severities', async function () {
    this.timeout(60_000);

    const harness = await followUpsHarness('fu-all');
    try {
      await harness.panel.show({ mode: 'followUps' });
      const payload = latest(harness);

      const completedUri = folderUriOf(harness.dirs['fu-completed']);
      assert.deepEqual(
        payload.groups.map((group) => group.folderUri),
        [completedUri],
        'an unfinished task reached the Follow-ups view'
      );
      assert.deepEqual(payload.verdicts, { passed: 0, passedWithIssues: 1, failed: 0 });
      assert.equal(payload.scopedNotCompleted, false);
      assert.equal(payload.unreadable, 0);

      const task = harness.index.snapshot.tasks.get(completedUri);
      assert.ok(task !== undefined);
      const data = readDashboardData(
        fs.readFileSync(path.join(harness.dirs['fu-completed'], DATA_FILE), 'utf8')
      );
      const expected = collectFollowUps([task], new Map([[completedUri, data]])).groups[0].items;
      assert.deepEqual(
        payload.groups[0].items,
        expected.map((item) => ({ ...item, severity: item.severity ?? null }))
      );
      assert.ok(
        payload.groups[0].items.some(
          (item) => item.source === 'issue' && item.severity === 'critical'
        ),
        'the unfixed critical issue is missing'
      );
      assert.ok(
        payload.groups[0].items.every((item) => item.source === 'issue' || item.severity === null),
        'a non-issue row carries a severity'
      );
    } finally {
      harness.dispose();
    }
  });

  it('opens a scoped, empty view with the not-completed state for an unfinished task', async function () {
    this.timeout(60_000);

    const harness = await followUpsHarness('fu-scoped');
    try {
      const folderUri = folderUriOf(harness.dirs['fu-inprogress']);
      await harness.panel.handleMessage({ type: 'openFollowUps', folderUri });
      assert.deepEqual(harness.panel.location, { mode: 'followUps', folderUri });

      const payload = latest(harness);
      assert.equal(payload.scopedNotCompleted, true);
      assert.equal(payload.scopedTitle, 'In-progress task');
      assert.deepEqual(payload.groups, []);
    } finally {
      harness.dispose();
    }
  });

  it('re-reads dashboard-data.js on every build, so a fixed issue drops out without a cache', async function () {
    this.timeout(60_000);

    const harness = await followUpsHarness('fu-reread');
    try {
      const folderUri = folderUriOf(harness.dirs['fu-completed']);
      await harness.panel.show({ mode: 'followUps', folderUri });
      const before = latest(harness).groups[0].items.filter((item) => item.source === 'issue');
      assert.equal(before.length, 2);

      const dataPath = path.join(harness.dirs['fu-completed'], DATA_FILE);
      fs.writeFileSync(
        dataPath,
        fs.readFileSync(dataPath, 'utf8').replace(/"fixed": false/g, '"fixed": true')
      );
      await harness.panel.show({ mode: 'dashboard' });
      await harness.panel.show({ mode: 'followUps', folderUri });

      const after = latest(harness).groups[0].items.filter((item) => item.source === 'issue');
      assert.equal(after.length, 0, 'the Follow-ups view served a cached dashboard-data.js');
    } finally {
      harness.dispose();
    }
  });
});
