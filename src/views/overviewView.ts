import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { TaskQuery } from '../index/query.ts';
import type { TaskIndex } from '../index/taskIndex.ts';
import type { Task, TaskStatus, WorkflowType } from '../model/types.ts';
import { validateOverviewMessage } from '../panel/messages.ts';
import {
  AUTHOR,
  OVERVIEW,
  STATUS_GLYPHS,
  STATUS_LABELS,
  STATUS_WORDS,
  VERDICT_LABELS,
  WORKFLOW_LABELS,
  format
} from '../strings.ts';
import type {
  OverviewFacet,
  OverviewMarker,
  OverviewGroup,
  OverviewPayload,
  OverviewRow,
  OverviewStats
} from '../webview/overview.ts';
import { ageInDays, formatActivity, formatQuietMarker, isQuiet } from './relativeTime.ts';

export const OVERVIEW_VIEW_ID = 'maister.overview';
export const FILTERED_CONTEXT_KEY = 'maister.overview.filtered';

const GROUP_BY_STATE_KEY = 'maister.overview.groupBy';
const ROWS_PER_GROUP = 50;
const RECENT_LIMIT = 20;

export type GroupBy = 'type' | 'status' | 'author' | 'month';

const GROUP_BY_VALUES: readonly GroupBy[] = ['type', 'status', 'author', 'month'];

const STATUS_ORDER: readonly TaskStatus[] = [
  'in_progress',
  'blocked',
  'pending',
  'failed',
  'completed',
  'unknown'
];

const TYPE_ORDER: readonly WorkflowType[] = [
  'development',
  'product-design',
  'research',
  'migration',
  'performance',
  'unknown'
];

/**
 * § 4.2 — the active `TaskQuery` lives in the extension, so Overview and Dashboard mode
 * share one filter instance and the title-bar handoff keeps it.
 */
export class SharedFilter {
  private query: TaskQuery = {};
  private readonly emitter = new vscode.EventEmitter<TaskQuery>();

  readonly onDidChange: vscode.Event<TaskQuery> = this.emitter.event;

  get value(): TaskQuery {
    return this.query;
  }

  get isFiltered(): boolean {
    return Object.keys(this.query).length > 0;
  }

  get facetCount(): number {
    return Object.keys(this.query).length;
  }

  /** A key set to `null` or to an empty array unsets that facet; anything else sets it. */
  patch(patch: Readonly<Record<string, unknown>>): void {
    const next: Record<string, unknown> = { ...this.query };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete next[key];
        continue;
      }
      next[key] = value;
    }
    this.query = next as TaskQuery;
    this.emitter.fire(this.query);
  }

  clear(): void {
    this.query = {};
    this.emitter.fire(this.query);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

let shared: SharedFilter | undefined;

/** The one filter instance; Dashboard mode (§ 5.5) reads the same object. */
export function sharedFilter(): SharedFilter {
  shared ??= new SharedFilter();
  return shared;
}

/** Test seam — drops the singleton so a fresh host run starts unfiltered. */
export function resetSharedFilter(): void {
  shared?.dispose();
  shared = undefined;
}

/** Registered artifact paths must stay inside the task folder — the index already enforces it. */
function heroesOf(task: Task): OverviewRow['heroes'] {
  return task.artifacts
    .filter((artifact) => artifact.isHero)
    .map((artifact) => ({
      relPath: artifact.relPath,
      label: artifact.label,
      variant: artifact.htmlRelPath === null ? ('md' as const) : ('html' as const)
    }));
}

/** The staleness threshold every surface reads; Dashboard imports it. */
export function quietDaysSetting(): number {
  return (
    vscode.workspace.getConfiguration('maisterLens').get<number>('staleness.quietDays') ?? 3
  );
}

function attributionEnabled(): boolean {
  return (
    vscode.workspace.getConfiguration('maisterLens').get<boolean>('attribution.enabled') ?? true
  );
}

function matchedInText(matchedIn: readonly string[]): string | null {
  const fields = matchedIn.filter((field) => field !== 'title');
  const first = fields[0];
  if (first === undefined) {
    return null;
  }
  const label = OVERVIEW.matchField[first as keyof typeof OVERVIEW.matchField];
  return label === undefined ? null : format(OVERVIEW.matchedIn, { field: label });
}

function currentActiveForm(task: Task): string | null {
  const phase = task.phases.find((candidate) => candidate.id === task.currentPhaseId);
  return phase?.activeForm ?? phase?.name ?? null;
}

function rowDescription(task: Task, matchedIn: readonly string[], now: number, quietDays: number): string {
  const parts: string[] = [];
  if (task.status === 'completed') {
    parts.push(STATUS_WORDS.completed);
    if (task.verdict !== null) {
      parts.push(VERDICT_LABELS[task.verdict].toLowerCase());
    }
  } else if (task.status === 'in_progress') {
    parts.push(currentActiveForm(task) ?? STATUS_WORDS.in_progress);
    parts.push(formatActivity(task.activityMtime, now));
  } else {
    parts.push(STATUS_WORDS[task.status]);
    parts.push(formatActivity(task.activityMtime, now));
  }
  if (isQuiet(task, now, quietDays)) {
    parts.push(formatQuietMarker(task.activityMtime, now));
  }
  const matched = matchedInText(matchedIn);
  if (matched !== null) {
    parts.push(matched);
  }
  return parts.join(' · ');
}

function toRow(task: Task, matchedIn: readonly string[], now: number, quietDays: number): OverviewRow {
  const markers: OverviewMarker[] = [];
  if (task.verdict === 'failed') {
    markers.push({
      text: '',
      glyph: '!',
      hiddenText: OVERVIEW.markerFailedVerification,
      tone: 'error'
    });
  }
  if (isQuiet(task, now, quietDays)) {
    markers.push({
      text: '',
      glyph: '⏸',
      hiddenText: format(OVERVIEW.markerQuiet, { n: ageInDays(task.activityMtime, now) }),
      tone: 'warn'
    });
  }
  return {
    folderUri: task.ref.folderUri,
    title: task.title,
    statusGlyph: STATUS_GLYPHS[task.status],
    statusText: STATUS_WORDS[task.status],
    description: rowDescription(task, matchedIn, now, quietDays),
    markers,
    nextAction:
      task.nextAction.id === 'none'
        ? null
        : { id: task.nextAction.id, label: task.nextAction.label },
    heroes: heroesOf(task)
  };
}

function monthKey(task: Task): string {
  if (task.created !== null) {
    return `${task.created.getFullYear()}-${String(task.created.getMonth() + 1).padStart(2, '0')}`;
  }
  const prefix = /^(\d{4})-(\d{2})/.exec(task.ref.folderName);
  return prefix === null ? OVERVIEW.monthUndated : `${prefix[1]}-${prefix[2]}`;
}

function authorKey(task: Task): { key: string; label: string } {
  if (task.author === null) {
    return { key: AUTHOR.notCommitted, label: AUTHOR.notCommitted };
  }
  if (task.author.isMe) {
    return { key: 'me', label: OVERVIEW.authorMe };
  }
  return { key: task.author.email, label: task.author.name };
}

export class OverviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  readonly filter = sharedFilter();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly index: TaskIndex,
    private readonly log: (line: string) => void
  ) {
    this.subscriptions.push(
      this.index.onDidChange(() => this.publish()),
      this.filter.onDidChange(() => {
        void this.applyFilteredContext();
        this.publish();
      })
    );
    void this.applyFilteredContext();
  }

  get groupBy(): GroupBy {
    const stored = this.context.workspaceState.get<string>(GROUP_BY_STATE_KEY);
    return GROUP_BY_VALUES.includes(stored as GroupBy) ? (stored as GroupBy) : 'type';
  }

  async setGroupBy(groupBy: GroupBy): Promise<void> {
    await this.context.workspaceState.update(GROUP_BY_STATE_KEY, groupBy);
    this.publish();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    view.webview.html = this.html(view.webview);
    view.onDidDispose(() => {
      this.view = undefined;
    });
    view.webview.onDidReceiveMessage((raw: unknown) => void this.handleMessage(raw));
  }

  /** The § 4.2 payload: row fields only, at most 50 tasks per group, never a `Task`. */
  buildPayload(now: number = Date.now()): OverviewPayload {
    const quietDays = quietDaysSetting();
    const all = [...this.index.snapshot.tasks.values()];
    const filtered = this.filter.isFiltered;
    const hits = this.index.query(this.filter.value);
    const matchedIn = new Map(hits.map((hit) => [hit.task.ref.folderUri, hit.matchedIn]));
    const selected = filtered
      ? hits.map((hit) => hit.task)
      : [...all].sort((left, right) => right.activityMtime - left.activityMtime).slice(0, RECENT_LIMIT);

    return {
      type: 'overview',
      stats: this.stats(all, selected.length, quietDays),
      groups: this.groups(selected, matchedIn, now, quietDays),
      activeFilter: { text: this.filter.value.text ?? '' },
      groupBy: this.groupBy,
      freshness: this.index.snapshot.freshness
    };
  }

  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  private stats(all: readonly Task[], matched: number, quietDays: number): OverviewStats {
    const query = this.filter.value;
    const now = Date.now();
    const countBy = <T>(pick: (task: Task) => T, value: T): number =>
      all.filter((task) => pick(task) === value).length;

    const status: OverviewFacet[] = STATUS_ORDER.map((value) => ({
      key: value,
      label: value === 'unknown' ? OVERVIEW.statusUnreadable : STATUS_LABELS[value],
      glyph: STATUS_GLYPHS[value],
      count: countBy((task) => task.status, value),
      pressed: query.statuses?.includes(value) === true
    })).filter((facet) => facet.count > 0);

    const type: OverviewFacet[] = TYPE_ORDER.map((value) => ({
      key: value,
      label: WORKFLOW_LABELS[value],
      count: countBy((task) => task.type, value),
      pressed: query.types?.includes(value) === true
    })).filter((facet) => facet.count > 0);

    const attention: OverviewFacet[] = [
      {
        key: 'failedVerification',
        label: OVERVIEW.attentionFailed,
        glyph: '!',
        count: all.filter((task) => task.verdict === 'failed').length,
        pressed: query.verdicts?.includes('failed') === true
      },
      {
        key: 'quiet',
        label: format(OVERVIEW.attentionQuiet, { days: quietDays }),
        glyph: '⏸',
        count: all.filter((task) => isQuiet(task, now, quietDays)).length,
        pressed: query.quietAtLeastDays !== undefined
      }
    ];

    return {
      status,
      type,
      attention,
      total: all.length,
      matched,
      filterCount: this.filter.facetCount,
      attributionEnabled: attributionEnabled(),
      mine: query.author === 'me',
      quietDays
    };
  }

  private groups(
    tasks: readonly Task[],
    matchedIn: ReadonlyMap<string, readonly string[]>,
    now: number,
    quietDays: number
  ): OverviewGroup[] {
    const buckets = new Map<string, { label: string; tasks: Task[] }>();
    const ensure = (key: string, label: string): { label: string; tasks: Task[] } => {
      const existing = buckets.get(key);
      if (existing !== undefined) {
        return existing;
      }
      const created = { label, tasks: [] as Task[] };
      buckets.set(key, created);
      return created;
    };

    if (this.groupBy === 'type') {
      for (const value of TYPE_ORDER) {
        if (value !== 'unknown') {
          ensure(value, WORKFLOW_LABELS[value]);
        }
      }
    }
    if (this.groupBy === 'status') {
      for (const value of STATUS_ORDER) {
        ensure(value, value === 'unknown' ? OVERVIEW.statusUnreadable : STATUS_LABELS[value]);
      }
    }

    for (const task of tasks) {
      if (this.groupBy === 'type') {
        ensure(task.type, WORKFLOW_LABELS[task.type]).tasks.push(task);
      } else if (this.groupBy === 'status') {
        ensure(
          task.status,
          task.status === 'unknown' ? OVERVIEW.statusUnreadable : STATUS_LABELS[task.status]
        ).tasks.push(task);
      } else if (this.groupBy === 'author') {
        const author = authorKey(task);
        ensure(author.key, author.label).tasks.push(task);
      } else {
        const key = monthKey(task);
        ensure(key, key).tasks.push(task);
      }
    }

    return this.orderGroups([...buckets]).map(([key, bucket]) => {
      const ordered = [...bucket.tasks].sort(
        (left, right) => right.activityMtime - left.activityMtime
      );
      return {
        key,
        label: bucket.label,
        count: ordered.length,
        rows: ordered
          .slice(0, ROWS_PER_GROUP)
          .map((task) =>
            toRow(task, matchedIn.get(task.ref.folderUri) ?? [], now, quietDays)
          ),
        truncated: ordered.length > ROWS_PER_GROUP
      };
    });
  }

  private orderGroups(
    entries: [string, { label: string; tasks: Task[] }][]
  ): [string, { label: string; tasks: Task[] }][] {
    if (this.groupBy === 'type') {
      return entries.sort(
        (left, right) =>
          TYPE_ORDER.indexOf(left[0] as WorkflowType) - TYPE_ORDER.indexOf(right[0] as WorkflowType)
      );
    }
    if (this.groupBy === 'status') {
      return entries.sort(
        (left, right) =>
          STATUS_ORDER.indexOf(left[0] as TaskStatus) - STATUS_ORDER.indexOf(right[0] as TaskStatus)
      );
    }
    if (this.groupBy === 'month') {
      return entries.sort((left, right) => right[0].localeCompare(left[0]));
    }
    return entries.sort((left, right) => {
      if (left[0] === 'me') {
        return -1;
      }
      if (right[0] === 'me') {
        return 1;
      }
      return right[1].tasks.length - left[1].tasks.length;
    });
  }

  publish(): void {
    void this.view?.webview.postMessage(this.buildPayload());
  }

  /** The A2 boundary: everything the webview sends arrives here and is validated first. */
  async handleMessage(raw: unknown): Promise<void> {
    const message = validateOverviewMessage(raw, (folderUri) =>
      this.index.snapshot.tasks.has(folderUri)
    );
    if (message === null) {
      this.log(format(OVERVIEW.messageRefused, { reason: JSON.stringify(raw).slice(0, 200) }));
      return;
    }
    if (
      (message.type === 'startWorkflow' || message.type === 'runNextAction') &&
      !vscode.workspace.isTrusted
    ) {
      this.log(format(OVERVIEW.messageRefused, { reason: `${message.type} needs a trusted workspace` }));
      return;
    }

    switch (message.type) {
      case 'ready':
        this.publish();
        return;
      case 'setFilter':
        this.filter.patch(message.patch);
        return;
      case 'clearFilter':
        this.filter.clear();
        return;
      case 'openTask':
        await this.run('maister.openTask', { folderUri: message.folderUri });
        return;
      case 'openArtifact':
        await this.run('maister.openArtifact', {
          folderUri: message.folderUri,
          artifactRelPath: message.artifactRelPath,
          variant: message.variant
        });
        return;
      case 'openDashboard':
        await this.run('maister.openDashboard');
        return;
      case 'openFollowUps':
        await this.run(
          'maister.openFollowUps',
          message.folderUri === undefined ? undefined : { folderUri: message.folderUri }
        );
        return;
      case 'startWorkflow':
        await this.run('maister.startWorkflow');
        return;
      case 'runNextAction':
        await this.run('maister.runNextAction', { folderUri: message.folderUri });
    }
  }

  /** A command another surface owns may not be registered yet; that is logged, never thrown. */
  private async run(command: string, argument?: unknown): Promise<void> {
    try {
      await (argument === undefined
        ? vscode.commands.executeCommand(command)
        : vscode.commands.executeCommand(command, argument));
    } catch (error) {
      this.log(`overview: ${command} did not run (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  private async applyFilteredContext(): Promise<void> {
    await vscode.commands.executeCommand('setContext', FILTERED_CONTEXT_KEY, this.filter.isFiltered);
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'overview.js')
    );
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">`,
      `<link rel="stylesheet" href="${styleUri.toString()}">`,
      `<title>${OVERVIEW.title}</title>`,
      '</head>',
      '<body>',
      `<main id="root" aria-label="${OVERVIEW.title}"></main>`,
      `<script nonce="${nonce}" src="${scriptUri.toString()}"></script>`,
      '</body>',
      '</html>'
    ].join('\n');
  }
}

export function registerOverviewView(
  context: vscode.ExtensionContext,
  index: TaskIndex,
  log: (line: string) => void
): { provider: OverviewViewProvider; disposables: vscode.Disposable[] } {
  const provider = new OverviewViewProvider(context, index, log);
  const disposables = [
    provider,
    vscode.window.registerWebviewViewProvider(OVERVIEW_VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: false }
    }),
    vscode.commands.registerCommand('maister.overview.clearFilter', () => provider.filter.clear()),
    vscode.commands.registerCommand('maister.overview.groupBy', () => pickGroupBy(provider))
  ];
  return { provider, disposables };
}

/**
 * Audit I2 — grouping is chosen through this native title-bar command, the only control the
 * mockup draws for it, so no `setGroupBy` message crosses the webview boundary.
 */
async function pickGroupBy(provider: OverviewViewProvider): Promise<void> {
  const current = provider.groupBy;
  const picked = await vscode.window.showQuickPick(
    GROUP_BY_VALUES.map((value) => ({
      label: OVERVIEW.groupBy[value],
      value,
      picked: value === current
    })),
    { title: OVERVIEW.groupByPrompt }
  );
  if (picked !== undefined) {
    await provider.setGroupBy(picked.value);
  }
}
