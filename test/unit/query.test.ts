import { strict as assert } from 'node:assert';
import { queryTasks } from '../../src/index/query.ts';
import { NEXT_ACTION_LABELS } from '../../src/strings.ts';
import type { ArtifactRef, Task, TaskStatus, Verdict, WorkflowType } from '../../src/model/types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 22, 12, 0, 0);

interface TaskShape {
  name: string;
  title?: string;
  description?: string | null;
  tags?: string[];
  type?: WorkflowType;
  status?: TaskStatus;
  verdict?: Verdict;
  decisions?: { text: string; rationale?: string | null }[];
  risks?: string[];
  artifactDecisions?: string[];
  tldr?: string | null;
  activityMtime?: number;
  created?: Date | null;
  author?: Task['author'];
}

function artifactWithSummary(
  tldr: string | null,
  risks: string[],
  decisions: string[] = []
): ArtifactRef {
  return {
    relPath: 'implementation/spec.md',
    label: 'Specification',
    htmlRelPath: null,
    isHero: true,
    source: 'specification',
    summary: {
      tldr,
      decisions: decisions.map((text) => ({ text, rationale: null, source: 'implementation/spec.md' })),
      risks: risks.map((text) => ({ text, resolved: false, source: 'implementation/spec.md' }))
    }
  };
}

function makeTask(shape: TaskShape): Task {
  const hasSummary =
    shape.tldr !== undefined ||
    (shape.risks ?? []).length > 0 ||
    (shape.artifactDecisions ?? []).length > 0;
  return {
    ref: {
      folderUri: `file:///workspace/.maister/tasks/development/${shape.name}`,
      relPath: `.maister/tasks/development/${shape.name}`,
      dirSegment: 'development',
      folderName: shape.name
    },
    type: shape.type ?? 'development',
    title: shape.title ?? shape.name,
    description: shape.description ?? null,
    status: shape.status ?? 'in_progress',
    tags: shape.tags ?? [],
    priority: null,
    created: shape.created ?? null,
    updated: null,
    phases: [],
    currentPhaseId: null,
    verdict: shape.verdict ?? null,
    characteristics: {},
    options: {},
    decisions: (shape.decisions ?? []).map((decision) => ({
      text: decision.text,
      rationale: decision.rationale ?? null,
      source: 'clarifications'
    })),
    risks: [],
    artifacts: hasSummary
      ? [artifactWithSummary(shape.tldr ?? null, shape.risks ?? [], shape.artifactDecisions ?? [])]
      : [],
    hasDashboard: false,
    hasDashboardData: false,
    stateMtime: shape.activityMtime ?? NOW,
    activityMtime: shape.activityMtime ?? NOW,
    author: shape.author ?? null,
    nextAction: { id: 'none', label: NEXT_ACTION_LABELS.none },
    parseIssues: []
  };
}

describe('query/unit', () => {
  it('ANDs text tokens across every searched field, ranks 3/2/1 and breaks ties on activityMtime (AC7)', () => {
    const tasks = [
      makeTask({ name: 'token-rotation', title: 'Auth token rotation', activityMtime: NOW - 5 * DAY_MS }),
      makeTask({ name: 'older-title', title: 'Auth token rotation', activityMtime: NOW - 9 * DAY_MS }),
      makeTask({
        name: 'decision-only',
        title: 'Refund idempotency keys',
        decisions: [{ text: 'Rotation of the auth token happens hourly', rationale: 'user choice' }]
      }),
      makeTask({
        name: 'risk-only',
        title: 'Export pipeline',
        risks: ['The auth token may outlive its rotation window']
      }),
      makeTask({ name: 'tldr-only', title: 'Billing rollup', tldr: 'Rotation of every auth token is automated' }),
      makeTask({ name: 'description-only', title: 'Search relevance', description: 'auth only, no rotation here yet' }),
      makeTask({ name: 'tag-only', title: 'Mailer retries', tags: ['auth', 'rotation'] }),
      makeTask({ name: 'half-match', title: 'Auth session pinning' })
    ];

    const hits = queryTasks(tasks, { text: ' AUTH   rotation ' }, NOW);
    const names = hits.map((hit) => hit.task.ref.folderName);

    assert.ok(!names.includes('half-match'), 'a task matching only one token was returned');
    assert.deepEqual(
      names,
      [
        'token-rotation',
        'older-title',
        'decision-only',
        'risk-only',
        'tldr-only',
        'description-only',
        'tag-only'
      ],
      'hits are not ordered by score then activityMtime descending'
    );

    const byName = new Map(hits.map((hit) => [hit.task.ref.folderName, hit]));
    assert.equal(byName.get('token-rotation')?.score, 3, 'a title match does not score 3');
    assert.equal(byName.get('decision-only')?.score, 2, 'a decision match does not score 2');
    assert.equal(byName.get('risk-only')?.score, 2, 'a risk match does not score 2');
    assert.equal(byName.get('tldr-only')?.score, 1, 'a TL;DR match does not score 1');
    assert.equal(byName.get('description-only')?.score, 1, 'a description match does not score 1');
    assert.equal(byName.get('tag-only')?.score, 1, 'a tag match does not score 1');
    assert.deepEqual(byName.get('decision-only')?.matchedIn, ['decision'], 'matchedIn does not report a decision-only hit');

    const folderNameHit = queryTasks(tasks, { text: 'token-rotation' }, NOW);
    assert.deepEqual(
      folderNameHit.map((hit) => hit.task.ref.folderName),
      ['token-rotation'],
      'the folder name is not searched at title weight'
    );
    assert.equal(folderNameHit[0].score, 3);

    const rationaleHit = queryTasks(tasks, { text: 'user choice' }, NOW);
    assert.deepEqual(
      rationaleHit.map((hit) => hit.task.ref.folderName),
      ['decision-only'],
      'decision rationale text is not searched'
    );
  });

  it('ANDs facets, leaves unset facets inert and applies staleness only to unfinished tasks', () => {
    const me = { name: 'Me', email: 'me@example.com', addedAt: new Date(NOW), isMe: true };
    const other = { name: 'Other', email: 'other@example.org', addedAt: new Date(NOW), isMe: false };
    const tasks = [
      makeTask({
        name: 'quiet-dev',
        type: 'development',
        status: 'in_progress',
        activityMtime: NOW - 5 * DAY_MS,
        author: me,
        created: new Date(Date.UTC(2026, 7, 1))
      }),
      makeTask({
        name: 'quiet-research',
        type: 'research',
        status: 'blocked',
        activityMtime: NOW - 5 * DAY_MS,
        author: other,
        created: new Date(Date.UTC(2026, 8, 20))
      }),
      makeTask({
        name: 'long-completed',
        type: 'development',
        status: 'completed',
        verdict: 'failed',
        activityMtime: NOW - 400 * DAY_MS,
        author: me
      }),
      makeTask({ name: 'fresh-dev', type: 'development', status: 'in_progress', activityMtime: NOW - 60_000 })
    ];

    assert.equal(queryTasks(tasks, {}, NOW).length, 4, 'an empty query filters something out');
    assert.equal(queryTasks(tasks, { types: [], statuses: [] }, NOW).length, 4, 'an empty facet array filters');

    assert.deepEqual(
      queryTasks(tasks, { quietAtLeastDays: 3 }, NOW).map((hit) => hit.task.ref.folderName),
      ['quiet-dev', 'quiet-research'],
      'staleness did not exclude the completed task or admitted a fresh one'
    );

    assert.deepEqual(
      queryTasks(tasks, { quietAtLeastDays: 3, types: ['development'] }, NOW).map((h) => h.task.ref.folderName),
      ['quiet-dev'],
      'facets did not combine with AND'
    );

    assert.deepEqual(
      queryTasks(tasks, { author: 'me' }, NOW).map((h) => h.task.ref.folderName),
      ['quiet-dev', 'long-completed']
    );
    assert.deepEqual(
      queryTasks(tasks, { author: 'others' }, NOW).map((h) => h.task.ref.folderName),
      ['quiet-research']
    );
    assert.deepEqual(
      queryTasks(tasks, { author: { email: 'OTHER@example.ORG' } }, NOW).map((h) => h.task.ref.folderName),
      ['quiet-research'],
      'the author email facet is not case-insensitive'
    );

    assert.deepEqual(
      queryTasks(tasks, { verdicts: ['failed'] }, NOW).map((h) => h.task.ref.folderName),
      ['long-completed']
    );
    assert.deepEqual(
      queryTasks(tasks, { verdicts: ['none'] }, NOW).map((h) => h.task.ref.folderName),
      ['fresh-dev', 'quiet-dev', 'quiet-research'],
      "the 'none' verdict does not select tasks with no verdict"
    );

    assert.deepEqual(
      queryTasks(tasks, { createdAfter: new Date(Date.UTC(2026, 8, 1)) }, NOW).map((h) => h.task.ref.folderName),
      ['quiet-research'],
      'createdAfter did not exclude earlier and undated tasks'
    );
    assert.deepEqual(
      queryTasks(tasks, { createdBefore: new Date(Date.UTC(2026, 8, 1)) }, NOW).map((h) => h.task.ref.folderName),
      ['quiet-dev']
    );

    assert.deepEqual(
      queryTasks(tasks, { statuses: ['in_progress'], quietAtLeastDays: 3, types: ['research'] }, NOW),
      [],
      'contradictory facets returned a hit'
    );
  });

  it("searches every registered artifact's summary decisions at decision weight (§ 3.7, AC7)", () => {
    const tasks = [
      makeTask({
        name: 'artifact-decision-only',
        title: 'Export pipeline',
        artifactDecisions: ['Rotation of the auth token is delegated to the gateway']
      }),
      makeTask({ name: 'unrelated', title: 'Billing rollup' })
    ];

    const hits = queryTasks(tasks, { text: 'auth rotation' }, NOW);
    assert.deepEqual(
      hits.map((hit) => hit.task.ref.folderName),
      ['artifact-decision-only'],
      "an artifact summary's decisions are not part of the searched set"
    );
    assert.equal(hits[0].score, 2, 'an artifact-summary decision does not score at decision weight');
    assert.deepEqual(hits[0].matchedIn, ['decision']);
  });
});
