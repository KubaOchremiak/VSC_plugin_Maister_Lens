import type { Decision, Risk, Task, TaskStatus, Verdict, WorkflowType } from '../model/types.ts';

/**
 * § 3.7 — the query engine runs over tier 1 only. It is free of the `vscode` module so the
 * index can stay a thin caller and the ranking rules stay unit-testable without a host.
 */
export interface TaskQuery {
  text?: string;
  types?: WorkflowType[];
  statuses?: TaskStatus[];
  verdicts?: (Verdict | 'none')[];
  author?: 'me' | 'others' | { email: string };
  /** Unfinished tasks whose `activityMtime` is at least this old. */
  quietAtLeastDays?: number;
  createdAfter?: Date;
  createdBefore?: Date;
}

export type MatchField = 'title' | 'description' | 'tags' | 'decision' | 'risk' | 'tldr';

export interface TaskHit {
  task: Task;
  matchedIn: MatchField[];
  score: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** § 3.7 ranking: title/folder name 3, decision/risk 2, TL;DR/description/tag 1. */
const FIELD_WEIGHTS: readonly (readonly [MatchField, number])[] = [
  ['title', 3],
  ['description', 1],
  ['tags', 1],
  ['decision', 2],
  ['risk', 2],
  ['tldr', 1]
];

function decisionsOf(task: Task): Decision[] {
  return [...task.decisions, ...task.artifacts.flatMap((artifact) => artifact.summary?.decisions ?? [])];
}

function risksOf(task: Task): Risk[] {
  return [...task.risks, ...task.artifacts.flatMap((artifact) => artifact.summary?.risks ?? [])];
}

function haystack(task: Task): Record<MatchField, string> {
  return {
    title: `${task.title} ${task.ref.folderName}`.toLowerCase(),
    description: (task.description ?? '').toLowerCase(),
    tags: task.tags.join(' ').toLowerCase(),
    decision: decisionsOf(task)
      .map((decision) => `${decision.text} ${decision.rationale ?? ''}`)
      .join(' ')
      .toLowerCase(),
    risk: risksOf(task)
      .map((risk) => risk.text)
      .join(' ')
      .toLowerCase(),
    tldr: task.artifacts
      .map((artifact) => artifact.summary?.tldr ?? '')
      .join(' ')
      .toLowerCase()
  };
}

function tokensOf(text: string | undefined): string[] {
  return (text ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== '');
}

/** An unset facet — undefined or an empty array — never filters. */
function admits<T>(allowed: readonly T[] | undefined, value: T): boolean {
  return allowed === undefined || allowed.length === 0 || allowed.includes(value);
}

function matchesAuthor(task: Task, facet: TaskQuery['author']): boolean {
  if (facet === undefined) {
    return true;
  }
  if (facet === 'me') {
    return task.author?.isMe === true;
  }
  if (facet === 'others') {
    return task.author !== null && !task.author.isMe;
  }
  return task.author !== null && task.author.email.toLowerCase() === facet.email.toLowerCase();
}

function matchesFacets(task: Task, query: TaskQuery, now: number): boolean {
  if (!admits(query.types, task.type) || !admits(query.statuses, task.status)) {
    return false;
  }
  if (!admits(query.verdicts, task.verdict ?? 'none')) {
    return false;
  }
  if (!matchesAuthor(task, query.author)) {
    return false;
  }
  if (query.quietAtLeastDays !== undefined) {
    // § 3.7 — staleness is a fact about unfinished work only.
    if (task.status === 'completed' || now - task.activityMtime < query.quietAtLeastDays * DAY_MS) {
      return false;
    }
  }
  if (query.createdAfter !== undefined && (task.created === null || task.created < query.createdAfter)) {
    return false;
  }
  if (query.createdBefore !== undefined && (task.created === null || task.created > query.createdBefore)) {
    return false;
  }
  return true;
}

function scoreText(task: Task, tokens: readonly string[]): { matchedIn: MatchField[]; score: number } | null {
  const fields = haystack(task);
  const matchedIn: MatchField[] = [];
  let score = 0;

  for (const [field, weight] of FIELD_WEIGHTS) {
    if (tokens.some((token) => fields[field].includes(token))) {
      matchedIn.push(field);
      score += weight;
    }
  }

  const everyTokenMatches = tokens.every((token) =>
    FIELD_WEIGHTS.some(([field]) => fields[field].includes(token))
  );
  return everyTokenMatches ? { matchedIn, score } : null;
}

/** Ties break on `activityMtime` descending; equal activity keeps the incoming order. */
export function queryTasks(tasks: Iterable<Task>, query: TaskQuery, now: number = Date.now()): TaskHit[] {
  const tokens = tokensOf(query.text);
  const hits: TaskHit[] = [];

  for (const task of tasks) {
    if (!matchesFacets(task, query, now)) {
      continue;
    }
    if (tokens.length === 0) {
      hits.push({ task, matchedIn: [], score: 0 });
      continue;
    }
    const text = scoreText(task, tokens);
    if (text !== null) {
      hits.push({ task, matchedIn: text.matchedIn, score: text.score });
    }
  }

  return hits.sort(
    (left, right) => right.score - left.score || right.task.activityMtime - left.task.activityMtime
  );
}
