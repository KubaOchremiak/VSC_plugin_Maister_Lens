import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { TaskIndex } from '../../src/index/taskIndex.ts';
import { generateTasks } from '../helpers/generateTasks.ts';
import { folderStubs, makeTempDir, removeTempDirs } from '../helpers/tempWorkspace.ts';

/**
 * AC7 and AC9 measured where they actually happen: inside the extension host, over the real
 * `TaskIndex`. A10 makes this a report, never a gate — `scripts/bench.mjs` launches this
 * module, prints the numbers against their targets and always exits 0.
 */

const TASK_COUNT = 300;
const QUERY_RUNS = 5;

interface Measurements {
  readonly count: number;
  readonly coldMs: number;
  readonly warmMs: number;
  readonly queryMs: number;
  readonly hits: number;
}

function indexOver(root: string, storage: string): TaskIndex {
  return new TaskIndex({
    storageUri: vscode.Uri.file(storage),
    log: () => undefined,
    notify: () => undefined,
    folders: () => folderStubs([root]),
    attributionEnabled: () => false
  });
}

async function measure(): Promise<Measurements> {
  const tasks = generateTasks(TASK_COUNT);
  const storage = makeTempDir('bench-storage');

  try {
    const cold = indexOver(tasks.root, storage);
    const coldStartedAt = performance.now();
    await cold.load();
    const coldMs = performance.now() - coldStartedAt;
    if (cold.snapshot.tasks.size !== TASK_COUNT) {
      throw new Error(
        `the index found ${cold.snapshot.tasks.size} of ${TASK_COUNT} generated tasks`
      );
    }

    // § 3.7 — the decision text search over the whole index; the slowest run is reported.
    let queryMs = 0;
    let hits = 0;
    for (let run = 0; run < QUERY_RUNS; run += 1) {
      const startedAt = performance.now();
      const found = cold.query({ text: tasks.needle });
      queryMs = Math.max(queryMs, performance.now() - startedAt);
      hits = found.length;
    }

    await cold.flush();
    cold.dispose();

    // § 3.4 — the cached paint a second start opens with, before any disk reconcile.
    const warm = indexOver(tasks.root, storage);
    let warmMs = Number.NaN;
    const warmStartedAt = performance.now();
    const subscription = warm.onDidChange((change) => {
      if (change.snapshot.freshness === 'cached' && Number.isNaN(warmMs)) {
        warmMs = performance.now() - warmStartedAt;
      }
    });
    await warm.load();
    subscription.dispose();
    warm.dispose();
    if (Number.isNaN(warmMs)) {
      throw new Error('the second start never published a cached snapshot');
    }

    return { count: TASK_COUNT, coldMs, warmMs, queryMs, hits };
  } finally {
    tasks.dispose();
    removeTempDirs();
  }
}

export async function run(): Promise<void> {
  const measurements = await measure();
  const out = process.env.MAISTER_BENCH_OUT;
  if (out === undefined || out === '') {
    throw new Error('MAISTER_BENCH_OUT is not set; run the benchmark through scripts/bench.mjs');
  }
  fs.writeFileSync(out, JSON.stringify(measurements), 'utf8');
}
