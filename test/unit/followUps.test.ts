import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  collectFollowUps,
  followUpCount,
  readDashboardData,
  unreadableCount,
  type DashboardData
} from '../../src/model/followUps.ts';
import { parseState } from '../../src/model/parseState.ts';
import type { Task } from '../../src/model/types.ts';
import { FIXTURE_ROOT } from '../helpers/fixtures.ts';

function fixtureText(name: string, file: string): string {
  return fs.readFileSync(path.join(FIXTURE_ROOT, name, file), 'utf8');
}

function fixtureTask(name: string): Task {
  const folder = path.join(FIXTURE_ROOT, name);
  return parseState({
    text: fixtureText(name, 'orchestrator-state.yml'),
    ref: {
      folderUri: pathToFileURL(folder).toString(),
      relPath: `.maister/tasks/development/${name}`,
      dirSegment: 'development',
      folderName: name
    },
    stateMtime: 0,
    activityMtime: 0,
    hasDashboard: false,
    hasDashboardData: fs.existsSync(path.join(folder, 'dashboard-data.js'))
  });
}

function dataFor(...names: string[]): Map<string, DashboardData | null> {
  const map = new Map<string, DashboardData | null>();
  for (const name of names) {
    map.set(fixtureTask(name).ref.folderUri, readDashboardData(fixtureText(name, 'dashboard-data.js')));
  }
  return map;
}

describe('dashboard-data reader', () => {
  it('accepts a JSON-style file and keeps every well-shaped issue', () => {
    const data = readDashboardData(fixtureText('fu-completed', 'dashboard-data.js'));
    assert.ok(data !== null);
    assert.equal(data.issues.length, 3);
    assert.deepEqual(data.issues[0], {
      description: 'Missing null check in reader',
      severity: 'warning',
      fixed: false
    });
  });

  it('reads a JS-literal file with bare keys and JS string escapes as the orchestrator writes it', () => {
    const data = readDashboardData(fixtureText('fu-bare', 'dashboard-data.js'));
    assert.ok(data !== null);
    assert.equal(data.issues.length, 3);
    assert.deepEqual(
      data.issues.filter((issue) => !issue.fixed).map((issue) => issue.description),
      ['CHANGELOG rename entry does not name the old location', 'key:value, inside a string {stays:put}']
    );
  });

  it('unescapes a JS single-quote escape but keeps an escaped backslash before a quote intact', () => {
    const text = String.raw`window.MAISTER_DATA = {verification:{issues:[{severity:"info", description:"a\\'b it\'s", fixed:false}]}};`;
    assert.equal(readDashboardData(text)?.issues[0].description, "a\\'b it's");
  });

  it('counts the data files that could not be read', () => {
    assert.equal(unreadableCount(new Map([['a', null], ['b', { issues: [] }], ['c', null]])), 2);
  });

  it('skips unquoted-key and expression files without throwing', () => {
    assert.equal(readDashboardData(fixtureText('fu-unquoted', 'dashboard-data.js')), null);
    assert.equal(readDashboardData(fixtureText('fu-expr', 'dashboard-data.js')), null);
  });

  it('skips the whole file when any issue has a bad shape', () => {
    const bad = (issues: unknown): string =>
      `window.MAISTER_DATA = ${JSON.stringify({ verification: { issues } })};`;
    assert.equal(readDashboardData(bad([{ description: 'a', severity: 'major', fixed: false }])), null);
    assert.equal(readDashboardData(bad([{ description: 'a', severity: 'info', fixed: 'no' }])), null);
    assert.equal(
      readDashboardData(bad([{ description: 'a', severity: 'info', fixed: false }, { severity: 'info', fixed: false }])),
      null
    );
    assert.equal(readDashboardData(bad('none')), null);
    assert.equal(readDashboardData('window.MAISTER_DATA = { "verification": null };'), null);
    assert.equal(readDashboardData(''), null);
  });

  it('never evaluates the file', () => {
    const marker = '__followUpsSideEffect';
    const text = `globalThis.${marker} = true; throw new Error('evaluated');`;
    assert.doesNotThrow(() => readDashboardData(text));
    assert.equal(readDashboardData(text), null);
    assert.equal((globalThis as Record<string, unknown>)[marker], undefined);
  });
});

describe('followUps', () => {
  it('collects all four sources for a completed task, unfixed issues and unresolved risks only', () => {
    const task = fixtureTask('fu-completed');
    const result = collectFollowUps([task], dataFor('fu-completed'));

    assert.equal(result.groups.length, 1);
    const items = result.groups[0].items;
    assert.deepEqual(
      items.filter((i) => i.source === 'issue').map((i) => [i.text, i.severity]),
      [
        ['Missing null check in reader', 'warning'],
        ['Unescaped HTML in row', 'critical']
      ]
    );
    assert.deepEqual(items.filter((i) => i.source === 'risk').map((i) => i.text), ['Watcher may miss rapid renames']);
    assert.deepEqual(items.filter((i) => i.source === 'deferred').map((i) => i.text), [
      'Deferred the retry logic to a follow-up task'
    ]);
    assert.deepEqual(items.filter((i) => i.source === 'e2e').map((i) => i.text), [
      'Run the E2E suite against a real workspace'
    ]);
    assert.ok(items.filter((i) => i.source !== 'issue').every((i) => i.severity === undefined));
  });

  it('lists completed tasks only, honours the scope, and still lists tasks whose data file was skipped', () => {
    const tasks = [fixtureTask('fu-completed'), fixtureTask('fu-inprogress'), fixtureTask('fu-expr')];
    const data = dataFor('fu-completed', 'fu-expr');

    const all = collectFollowUps(tasks, data);
    assert.deepEqual(
      all.groups.map((g) => g.task.ref.folderName),
      ['fu-completed', 'fu-expr']
    );
    const expr = all.groups[1].items;
    assert.equal(expr.filter((i) => i.source === 'issue').length, 0);
    assert.equal(expr.length, 3);

    assert.equal(collectFollowUps(tasks, data, tasks[1].ref.folderUri).groups.length, 0);
    assert.deepEqual(
      collectFollowUps(tasks, data, tasks[0].ref.folderUri).groups.map((g) => g.task.ref.folderName),
      ['fu-completed']
    );
  });

  it('matches deferral wording with the follow-up regex only', () => {
    const base = fixtureTask('fu-completed');
    const task: Task = {
      ...base,
      decisions: [
        { text: 'Defer caching; follow up later', rationale: null, source: 'x' },
        { text: 'deferring docs to a followup', rationale: null, source: 'x' },
        { text: 'Deferred the migration', rationale: null, source: 'x' },
        { text: 'Follow-up was deferred', rationale: null, source: 'x' }
      ]
    };
    const texts = collectFollowUps([task], new Map())
      .groups[0].items.filter((i) => i.source === 'deferred')
      .map((i) => i.text);
    assert.deepEqual(texts, ['Defer caching; follow up later', 'deferring docs to a followup']);
  });

  it('turns an e2e_followup string into one item and a list into one per entry', () => {
    const base = fixtureTask('fu-completed');
    assert.deepEqual(base.e2eFollowUp, ['Run the E2E suite against a real workspace']);
    assert.deepEqual(fixtureTask('fu-inprogress').e2eFollowUp, ['First', 'Second']);

    const task: Task = { ...base, e2eFollowUp: ['First', 'Second'] };
    const e2e = collectFollowUps([task], new Map()).groups[0].items.filter((i) => i.source === 'e2e');
    assert.deepEqual(e2e.map((i) => i.text), ['First', 'Second']);
  });

  it('counts verdicts over completed tasks and sums the KPI across tasks', () => {
    const base = fixtureTask('fu-completed');
    const tasks: Task[] = [
      base,
      { ...base, ref: { ...base.ref, folderUri: 'file:///a' }, verdict: 'passed', decisions: [], risks: [], e2eFollowUp: [] },
      { ...base, ref: { ...base.ref, folderUri: 'file:///b' }, verdict: 'failed' },
      fixtureTask('fu-inprogress')
    ];
    const data = dataFor('fu-completed');
    const result = collectFollowUps(tasks, data);

    assert.deepEqual(result.verdicts, { passed: 1, passedWithIssues: 1, failed: 1 });
    assert.equal(result.groups.length, 2);
    assert.deepEqual(followUpCount(tasks, data), { count: 5 + 3, tasks: 2 });
  });

  it('gives a scoped completed task with nothing open no group but still counts its verdict', () => {
    const base = fixtureTask('fu-completed');
    const task: Task = { ...base, verdict: 'passed', risks: [], decisions: [], e2eFollowUp: [] };
    const result = collectFollowUps([task], new Map(), task.ref.folderUri);
    assert.equal(result.groups.length, 0);
    assert.deepEqual(result.verdicts, { passed: 1, passedWithIssues: 0, failed: 0 });
  });

  it('rejects a data file without the window.MAISTER_DATA prefix', () => {
    assert.equal(readDashboardData('{"verification":{"issues":[]}}'), null);
  });
});
