import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { StateInput, TaskRef } from '../../src/model/types.ts';

/** Resolved from the repository root, so the same helper serves the unit and integration runs. */
export const FIXTURE_ROOT = path.resolve(process.cwd(), 'test', 'fixtures', 'tasks');

/** dirSegment each fixture folder stands for; the index derives it from the real path (§ 3.2). */
const DIR_SEGMENTS: Record<string, string> = {
  'both-level-options': 'development',
  corrupt: 'development',
  'date-only': 'research',
  'dev-real': 'development',
  empty: 'development',
  'extra-phase': 'development',
  'failed-phases': 'development',
  'list-mixed': 'development',
  'migration-dir': 'migrations',
  'multi-context': 'development',
  'no-dashboard': 'development',
  'pd-real': 'product-design',
  truncated: 'development',
  'unknown-segment': 'experiments'
};

export function taskFixtureNames(): string[] {
  return Object.keys(DIR_SEGMENTS).sort();
}

export function fixtureRef(name: string): TaskRef {
  const dirSegment = DIR_SEGMENTS[name];
  if (dirSegment === undefined) {
    throw new Error(`unknown fixture "${name}"`);
  }
  const folder = path.join(FIXTURE_ROOT, name);
  return {
    folderUri: pathToFileURL(folder).toString(),
    relPath: `.maister/tasks/${dirSegment}/${name}`,
    dirSegment,
    folderName: name
  };
}

export function fixtureInput(name: string): StateInput {
  const folder = path.join(FIXTURE_ROOT, name);
  const statePath = path.join(folder, 'orchestrator-state.yml');
  const stateMtime = fs.statSync(statePath).mtimeMs;
  const hasDashboardData = fs.existsSync(path.join(folder, 'dashboard-data.js'));
  return {
    text: fs.readFileSync(statePath, 'utf8'),
    ref: fixtureRef(name),
    stateMtime,
    activityMtime: hasDashboardData
      ? Math.max(stateMtime, fs.statSync(path.join(folder, 'dashboard-data.js')).mtimeMs)
      : stateMtime,
    hasDashboard: fs.existsSync(path.join(folder, 'dashboard.html')),
    hasDashboardData
  };
}

export function readSummaryFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_ROOT, 'summary-headings', name), 'utf8');
}
