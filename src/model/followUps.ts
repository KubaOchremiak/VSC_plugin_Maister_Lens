import { parse as parseYaml } from 'yaml';
import type { Task } from './types.ts';

const SEVERITIES = ['critical', 'warning', 'info'] as const;

export type IssueSeverity = (typeof SEVERITIES)[number];

export interface DashboardIssue {
  description: string;
  severity: IssueSeverity;
  fixed: boolean;
}

export interface DashboardData {
  issues: DashboardIssue[];
}

export type FollowUpSource = 'issue' | 'risk' | 'deferred' | 'e2e';

export interface FollowUp {
  text: string;
  source: FollowUpSource;
  /** Issues only. */
  severity?: IssueSeverity;
}

export interface FollowUpGroup {
  task: Task;
  items: FollowUp[];
}

export interface VerdictCounts {
  passed: number;
  passedWithIssues: number;
  failed: number;
}

export interface FollowUpsResult {
  groups: FollowUpGroup[];
  verdicts: VerdictCounts;
}

const DEFERRED_FOLLOW_UP = /\bdefer\w*\b.*\bfollow[- ]?up\b/i;
const DATA_PREFIX = /^\s*window\.MAISTER_DATA\s*=/;

const BARE_KEY = /[A-Za-z_$][\w$]*/y;

/**
 * Quotes the bare identifier keys of a JS object literal (`{fixed:false}` → `{"fixed":false}`)
 * so JSON can read it. Text inside double-quoted strings is kept, bar the JS-only `\'` escape.
 */
function quoteBareKeys(body: string): string {
  let out = '';
  let index = 0;
  let expectKey = false;
  while (index < body.length) {
    const char = body[index];
    if (char === '"') {
      out += char;
      index++;
      while (index < body.length && body[index] !== '"') {
        if (body[index] === '\\') {
          // JS allows `\'` inside a double-quoted string; JSON does not.
          out += body[index + 1] === "'" ? "'" : body.slice(index, index + 2);
          index += 2;
        } else {
          out += body[index];
          index++;
        }
      }
      out += body[index] ?? '';
      index++;
      expectKey = false;
      continue;
    }
    if (expectKey) {
      BARE_KEY.lastIndex = index;
      const match = BARE_KEY.exec(body);
      if (match !== null && /^\s*:/.test(body.slice(index + match[0].length))) {
        out += `"${match[0]}"`;
        index += match[0].length;
        expectKey = false;
        continue;
      }
    }
    if (char === '{' || char === ',') {
      expectKey = true;
    } else if (!/\s/.test(char)) {
      expectKey = false;
    }
    out += char;
    index++;
  }
  return out;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(quoteBareKeys(body));
    } catch {
      return undefined;
    }
  }
}

function parseData(body: string): unknown {
  const json = parseJson(body);
  if (json !== undefined) {
    return json;
  }
  try {
    return parseYaml(body, { maxAliasCount: 10, prettyErrors: false });
  } catch {
    return null;
  }
}

function isIssue(value: unknown): value is DashboardIssue {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const issue = value as Record<string, unknown>;
  return (
    typeof issue.description === 'string' &&
    (SEVERITIES as readonly unknown[]).includes(issue.severity) &&
    typeof issue.fixed === 'boolean'
  );
}

/**
 * Reads a task's `dashboard-data.js` as data, never as code: the `window.MAISTER_DATA =`
 * prefix and trailing `;` are stripped, then JSON, JSON with bare keys quoted, and YAML are
 * tried in turn. Any file that
 * does not parse, or whose `verification.issues` has any malformed entry, yields null.
 */
export function readDashboardData(text: string): DashboardData | null {
  if (!DATA_PREFIX.test(text)) {
    return null;
  }
  const body = text.replace(DATA_PREFIX, '').trim().replace(/;$/, '');
  const root = parseData(body);
  if (typeof root !== 'object' || root === null) {
    return null;
  }
  const verification = (root as Record<string, unknown>).verification;
  if (typeof verification !== 'object' || verification === null || Array.isArray(verification)) {
    return null;
  }
  const issues = (verification as Record<string, unknown>).issues;
  if (!Array.isArray(issues) || !issues.every(isIssue)) {
    return null;
  }
  return {
    issues: issues.map(({ description, severity, fixed }) => ({ description, severity, fixed }))
  };
}

function followUpsOf(task: Task, data: DashboardData | null | undefined): FollowUp[] {
  const items: FollowUp[] = [];
  for (const issue of data?.issues ?? []) {
    if (!issue.fixed) {
      items.push({ text: issue.description, source: 'issue', severity: issue.severity });
    }
  }
  for (const risk of task.risks) {
    if (!risk.resolved) {
      items.push({ text: risk.text, source: 'risk' });
    }
  }
  for (const decision of task.decisions) {
    if (DEFERRED_FOLLOW_UP.test(decision.text)) {
      items.push({ text: decision.text, source: 'deferred' });
    }
  }
  for (const text of task.e2eFollowUp ?? []) {
    items.push({ text, source: 'e2e' });
  }
  return items;
}

/**
 * Follow-ups of completed tasks, grouped per task (tasks with none are left out), plus the
 * verdict breakdown over every completed task in scope. `dataByFolder` maps a task's
 * folderUri to its read `dashboard-data.js`; a missing or null entry contributes no issues.
 */
export function collectFollowUps(
  tasks: readonly Task[],
  dataByFolder: ReadonlyMap<string, DashboardData | null>,
  scope?: string
): FollowUpsResult {
  const verdicts: VerdictCounts = { passed: 0, passedWithIssues: 0, failed: 0 };
  const groups: FollowUpGroup[] = [];
  for (const task of tasks) {
    if (task.status !== 'completed' || (scope !== undefined && task.ref.folderUri !== scope)) {
      continue;
    }
    if (task.verdict === 'passed') {
      verdicts.passed++;
    } else if (task.verdict === 'passed_with_issues') {
      verdicts.passedWithIssues++;
    } else if (task.verdict === 'failed') {
      verdicts.failed++;
    }
    const items = followUpsOf(task, dataByFolder.get(task.ref.folderUri));
    if (items.length > 0) {
      groups.push({ task, items });
    }
  }
  return { groups, verdicts };
}

/** The Dashboard KPI: every follow-up across completed tasks, and how many tasks carry one. */
export function followUpCount(
  tasks: readonly Task[],
  dataByFolder: ReadonlyMap<string, DashboardData | null>
): { count: number; tasks: number } {
  const { groups } = collectFollowUps(tasks, dataByFolder);
  return {
    count: groups.reduce((sum, group) => sum + group.items.length, 0),
    tasks: groups.length
  };
}

/** How many read `dashboard-data.js` files could not be read, so their issues are missing. */
export function unreadableCount(dataByFolder: ReadonlyMap<string, DashboardData | null>): number {
  return [...dataByFolder.values()].filter((entry) => entry === null).length;
}
