import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { TaskFile, TaskIndex } from '../index/taskIndex.ts';
import type { TaskQuery } from '../index/query.ts';
import { collectRisks, openRiskCount } from '../model/risks.ts';
import type { ArtifactRef, Task, TaskStatus, Verdict, WorkflowType } from '../model/types.ts';
import {
  AUTHOR,
  DASHBOARD,
  FALLBACK,
  PANEL,
  PHASE_GLYPHS,
  PHASE_STATUS_LABELS,
  READER,
  RISKS,
  STATUS_GLYPHS,
  STATUS_LABELS,
  VERDICT_LABELS,
  WORKFLOW_LABELS,
  format
} from '../strings.ts';
import { formatAge, formatQuietMarker, isQuiet } from '../views/relativeTime.ts';
import { quietDaysSetting, sharedFilter } from '../views/overviewView.ts';
import type {
  DashboardBar,
  DashboardChart,
  DashboardFilterChip,
  DashboardKpi,
  DashboardPayload,
  DashboardRow,
  DashboardWeek
} from '../webview/dashboardMode.ts';
import type { RiskGroup, RisksKpi, RisksPayload, RiskTypeFacet } from '../webview/risksMode.ts';
import type { FallbackFile, FallbackPayload } from '../webview/fallbackTask.ts';
import { DashboardRecognizer, hostDashboardHtml, type DashboardResources } from './hostDashboard.ts';
import {
  RenderCache,
  companionHtml,
  type CompanionResult,
  oversizeNotice,
  renderArtifact,
  type ReaderLocation,
  type RenderPayload,
  type RenderedArtifact
} from './render.ts';
import { validate, type Message, type Variant } from './messages.ts';

/** § 5.1 — one panel, reused for every location, keyed on `folderUri` (A1). */
export type PanelLocation =
  | { mode: 'dashboard' }
  | { mode: 'risks'; folderUri?: string }
  | { mode: 'task'; folderUri: string }
  | {
      mode: 'artifact';
      folderUri: string;
      artifactRelPath: string;
      variant: Variant;
      anchor?: string;
    };

export const PANEL_VIEW_TYPE = 'maister.panel';

const HISTORY_LIMIT = 50;
const DASHBOARD_FILE = 'dashboard.html';
const TASKS_ROOT = ['.maister', 'tasks'];
const STATE_FILE = 'orchestrator-state.yml';
const READABLE = /\.(md|html?)$/i;
const HTML_FILE = /\.html?$/i;

/** § 5.5 — the table never carries more than this many rows; the charts are unaffected. */
const DASHBOARD_ROW_LIMIT = 1_000;
const WEEKS_SHOWN = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** § 5.5's status palette: the colour repeats the glyph and the word, never replaces them. */
const STATUS_BARS: readonly { status: TaskStatus; tone: DashboardBar['tone']; hatched: boolean }[] = [
  { status: 'completed', tone: 'green', hatched: false },
  { status: 'in_progress', tone: 'blue', hatched: false },
  { status: 'blocked', tone: 'orange', hatched: false },
  { status: 'failed', tone: 'red', hatched: false },
  { status: 'pending', tone: 'neutral', hatched: true },
  { status: 'unknown', tone: 'neutral', hatched: true }
];

const VERDICT_BARS: readonly {
  verdict: Verdict | 'none';
  tone: DashboardBar['tone'];
  glyph: string;
  hatched: boolean;
}[] = [
  { verdict: 'passed', tone: 'green', glyph: '✓', hatched: false },
  { verdict: 'passed_with_issues', tone: 'orange', glyph: '⚠', hatched: false },
  { verdict: 'none', tone: 'neutral', glyph: '–', hatched: true },
  { verdict: 'failed', tone: 'red', glyph: '✕', hatched: false }
];

const TYPE_BARS: readonly { type: WorkflowType; glyph: string }[] = [
  { type: 'development', glyph: '‹›' },
  { type: 'product-design', glyph: '◇' },
  { type: 'research', glyph: '⌕' },
  { type: 'migration', glyph: '⇄' },
  { type: 'performance', glyph: '⚡' },
  { type: 'unknown', glyph: '?' }
];

/** § 5.4 step 7's "All artifacts" ordering; anything else sorts after these, by name. */
const FOLDER_ORDER = [
  'outputs',
  'analysis',
  'planning',
  'implementation',
  'verification',
  'documentation',
  'context'
];

function basename(relPath: string): string {
  return relPath.slice(relPath.lastIndexOf('/') + 1);
}

function folderOf(relPath: string): string {
  const at = relPath.lastIndexOf('/');
  return at < 0 ? '' : relPath.slice(0, at);
}

function folderRank(relPath: string): number {
  const top = relPath.includes('/') ? relPath.slice(0, relPath.indexOf('/')) : '';
  const at = FOLDER_ORDER.indexOf(top);
  return at < 0 ? FOLDER_ORDER.length : at;
}

function withoutExtension(relPath: string): string {
  return relPath.replace(READABLE, '');
}

function formatDate(value: Date | null): string {
  return value === null ? FALLBACK.dateUnknown : value.toISOString().slice(0, 10);
}

/** The Monday 00:00 of the week `at` falls in; the week columns and the Tasks tile share it. */
function weekStart(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  const weekday = (date.getDay() + 6) % 7;
  return date.getTime() - weekday * DAY_MS;
}

function weekLabel(at: number): string {
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The § 5.5 Last activity cell: the quiet marker when it applies, the bare age otherwise. */
function activityText(task: Task, now: number, quietDays: number): string {
  return isQuiet(task, now, quietDays)
    ? formatQuietMarker(task.activityMtime, now)
    : formatAge(task.activityMtime, now);
}

function verdictText(task: Task): string {
  return task.verdict === null ? DASHBOARD.verdictNone : VERDICT_LABELS[task.verdict];
}

function currentPhaseName(task: Task): string | null {
  const phase = task.phases.find((candidate) => candidate.id === task.currentPhaseId);
  return phase?.activeForm ?? phase?.name ?? null;
}

function nextActionOf(task: Task): { id: string; label: string } | null {
  // A2.2 — an untrusted workspace never offers a control that launches a command.
  return vscode.workspace.isTrusted && task.nextAction.id !== 'none'
    ? { id: task.nextAction.id, label: task.nextAction.label }
    : null;
}

function withoutMember(members: readonly string[] | undefined, member: string): string[] {
  return (members ?? []).filter((candidate) => candidate !== member);
}

/** The § 5.5 chip bar: one removable chip per active facet, each carrying its own undo patch. */
function filterChips(query: TaskQuery): DashboardFilterChip[] {
  const chips: DashboardFilterChip[] = [];
  if (query.text !== undefined && query.text !== '') {
    chips.push({
      key: 'text',
      label: format(DASHBOARD.filterText, { text: query.text }),
      patch: { text: null }
    });
  }
  for (const type of query.types ?? []) {
    chips.push({
      key: `types:${type}`,
      label: WORKFLOW_LABELS[type],
      patch: { types: withoutMember(query.types, type) }
    });
  }
  for (const status of query.statuses ?? []) {
    chips.push({
      key: `statuses:${status}`,
      label: STATUS_LABELS[status],
      patch: { statuses: withoutMember(query.statuses, status) }
    });
  }
  const verdicts = (query.verdicts ?? []).map((verdict) => verdict ?? 'none');
  for (const verdict of verdicts) {
    chips.push({
      key: `verdicts:${verdict}`,
      label: verdict === 'none' ? DASHBOARD.verdictNone : VERDICT_LABELS[verdict],
      patch: { verdicts: withoutMember(verdicts, verdict) }
    });
  }
  if (query.author !== undefined) {
    chips.push({
      key: 'author',
      label:
        query.author === 'me'
          ? DASHBOARD.filterAuthorMe
          : query.author === 'others'
            ? DASHBOARD.filterAuthorOthers
            : format(DASHBOARD.filterAuthorEmail, { email: query.author.email }),
      patch: { author: null }
    });
  }
  if (query.quietAtLeastDays !== undefined) {
    chips.push({
      key: 'quiet',
      label: format(DASHBOARD.filterQuiet, { days: query.quietAtLeastDays }),
      patch: { quietAtLeastDays: null }
    });
  }
  if (query.createdAfter !== undefined) {
    chips.push({
      key: 'createdAfter',
      label: format(DASHBOARD.filterCreatedAfter, { date: formatDate(query.createdAfter) }),
      patch: { createdAfter: null }
    });
  }
  if (query.createdBefore !== undefined) {
    chips.push({
      key: 'createdBefore',
      label: format(DASHBOARD.filterCreatedBefore, { date: formatDate(query.createdBefore) }),
      patch: { createdBefore: null }
    });
  }
  return chips;
}

interface View {
  readonly title: string;
  readonly html: string;
  readonly hosting: boolean;
  /** Present for the two bundle-backed modes; the hosted document carries none. */
  readonly payload?: unknown;
}

/** § 5.4 step 5 — decisions grouped by the phase or artifact that recorded them. */
function groupDecisions(task: Task): FallbackPayload['decisions'] {
  const groups = new Map<string, { text: string; rationale: string | null }[]>();
  for (const decision of task.decisions) {
    const items = groups.get(decision.source) ?? [];
    items.push({ text: decision.text, rationale: decision.rationale });
    groups.set(decision.source, items);
  }
  return [...groups].map(([source, items]) => ({ source, items }));
}

/**
 * § 5.4 step 7 — `.md` and `.html` only, ordered by top folder then name, with an `.md`
 * that has an `.html` twin shown once. Registered artifacts keep their label.
 */
function listedFiles(files: readonly TaskFile[], artifacts: readonly ArtifactRef[]): FallbackFile[] {
  const readable = files.filter((file) => file.kind === 'md' || file.kind === 'html');
  const markdownStems = new Set(
    readable.filter((file) => file.kind === 'md').map((file) => withoutExtension(file.relPath))
  );
  const labels = new Map(artifacts.map((artifact) => [artifact.relPath, artifact.label]));

  return readable
    .filter((file) => file.kind === 'md' || !markdownStems.has(withoutExtension(file.relPath)))
    .sort(
      (left, right) =>
        folderRank(left.relPath) - folderRank(right.relPath) ||
        left.relPath.localeCompare(right.relPath)
    )
    .map((file) => ({
      artifactRelPath: file.relPath,
      label: labels.get(file.relPath) ?? basename(file.relPath),
      folder: labels.has(file.relPath) ? folderOf(file.relPath) : '',
      variant: file.kind === 'html' ? ('html' as const) : ('md' as const)
    }));
}

export interface PanelOptions {
  readonly context: vscode.ExtensionContext;
  readonly index: TaskIndex;
  readonly log: (line: string) => void;
  /** Test seam, mirroring `TaskIndex`: the workspace folders resource roots come from. */
  readonly folders?: () => readonly vscode.WorkspaceFolder[];
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sameLocation(left: PanelLocation, right: PanelLocation): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class TaskPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private history: PanelLocation[] = [];
  private cursor = -1;
  private hosting = false;
  private rendered = '';
  /** The payload the current document is showing; re-sent when its bundle reports ready. */
  private pending: unknown = null;
  private readonly recognizer = new DashboardRecognizer();
  private readonly renders = new RenderCache<RenderedArtifact>();
  private readonly postEmitter = new vscode.EventEmitter<unknown>();
  private readonly receiveEmitter = new vscode.EventEmitter<unknown>();
  private readonly subscriptions: vscode.Disposable[] = [];

  /** Test seams: the extension host cannot read a webview's DOM, so it observes messages (A16). */
  readonly onDidPost: vscode.Event<unknown> = this.postEmitter.event;
  readonly onDidReceive: vscode.Event<unknown> = this.receiveEmitter.event;

  constructor(private readonly options: PanelOptions) {
    this.subscriptions.push(
      this.options.index.onDidChange((change) => this.onIndexChange(change.changed)),
      // § 5.5 — Dashboard and Overview share one TaskQuery, so a change on either side
      // re-publishes the mode that is showing it.
      sharedFilter().onDidChange(() => this.onFilterChange())
    );
  }

  get location(): PanelLocation | undefined {
    return this.history[this.cursor];
  }

  /** True while the current Task location runs Maister's own dashboard (§ 5.2). */
  get isHosting(): boolean {
    return this.hosting;
  }

  get html(): string {
    return this.rendered;
  }

  get canGoBack(): boolean {
    return this.cursor > 0;
  }

  get canGoForward(): boolean {
    return this.cursor >= 0 && this.cursor < this.history.length - 1;
  }

  async show(location: PanelLocation): Promise<void> {
    // § 6.1 — images and everything that is not markdown or HTML belong in a normal editor.
    if (location.mode === 'artifact' && !READABLE.test(location.artifactRelPath)) {
      return this.openInEditor(
        vscode.Uri.joinPath(vscode.Uri.parse(location.folderUri), location.artifactRelPath)
      );
    }
    const target: PanelLocation =
      location.mode === 'artifact' && HTML_FILE.test(location.artifactRelPath)
        ? { ...location, variant: 'html' }
        : location;
    const current = this.location;
    if (current === undefined || !sameLocation(current, target)) {
      this.history = [...this.history.slice(0, this.cursor + 1), target].slice(-HISTORY_LIMIT);
      this.cursor = this.history.length - 1;
    }
    await this.render();
  }

  async back(): Promise<void> {
    if (this.canGoBack) {
      this.cursor -= 1;
      await this.render();
    }
  }

  async forward(): Promise<void> {
    if (this.canGoForward) {
      this.cursor += 1;
      await this.render();
    }
  }

  /**
   * § 6.1 — the editor-title variant switch between a markdown artifact and the styled HTML
   * companion Maister wrote beside it. Visible only while `maister.panel.variantAvailable`.
   */
  async toggleVariant(): Promise<void> {
    const location = this.location;
    if (location?.mode !== 'artifact') {
      return;
    }
    await this.show({ ...location, variant: location.variant === 'md' ? 'html' : 'md' });
  }

  /** AC5 — the one sanctioned way to see an artifact as source. */
  async openSource(argument?: { folderUri?: string; artifactRelPath?: string }): Promise<void> {
    const uri = this.sourceUri(argument);
    if (uri !== undefined) {
      await this.openInEditor(uri);
    }
  }

  /** § 4.3/4.4 — the same file Open Source File opens, shown where it lives. */
  async revealInExplorer(argument?: {
    folderUri?: string;
    artifactRelPath?: string;
  }): Promise<void> {
    const uri = this.sourceUri(argument);
    if (uri === undefined) {
      return;
    }
    try {
      await vscode.commands.executeCommand('revealInExplorer', uri);
    } catch (error) {
      this.options.log(
        format(PANEL.commandFailed, {
          command: 'revealInExplorer',
          detail: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }

  /**
   * The file a source-side command acts on: the named artifact, else the one on screen, else
   * the task's state file. A named folder answers on its own, without the panel's location.
   */
  private sourceUri(
    argument?: { folderUri?: string; artifactRelPath?: string }
  ): vscode.Uri | undefined {
    const location = this.location;
    const named = typeof argument?.folderUri === 'string' ? argument.folderUri : undefined;
    const folderUri =
      named ?? (location !== undefined && location.mode !== 'dashboard' ? location.folderUri : undefined);
    if (folderUri === undefined) {
      return undefined;
    }
    const relPath =
      typeof argument?.artifactRelPath === 'string'
        ? argument.artifactRelPath
        : named === undefined && location?.mode === 'artifact'
          ? location.artifactRelPath
          : STATE_FILE;
    return vscode.Uri.joinPath(vscode.Uri.parse(folderUri), relPath);
  }

  /** Restores a panel VS Code has already re-created (§ 5.1). */
  async restore(panel: vscode.WebviewPanel, location: PanelLocation): Promise<void> {
    this.adopt(panel);
    await this.show(location);
  }

  /** The A2 boundary: everything a hosted page or bundle sends arrives here first. */
  async handleMessage(raw: unknown): Promise<void> {
    this.receiveEmitter.fire(raw);
    const result = validate(raw, {
      isIndexed: (folderUri) => this.options.index.snapshot.tasks.has(folderUri),
      isTrusted: vscode.workspace.isTrusted,
      hostFolderUri: this.hostFolderUri,
      workspaceRootUri: this.workspaceRootUri
    });
    if (!result.ok) {
      this.options.log(format(PANEL.messageRefused, { reason: result.reason }));
      return;
    }
    await this.dispatch(result.message);
  }

  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.subscriptions.length = 0;
    this.postEmitter.dispose();
    this.receiveEmitter.dispose();
    this.panel?.dispose();
    this.panel = undefined;
  }

  // --- message routing -------------------------------------------------------

  private async dispatch(message: Message): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.deliverPending();
        return;
      case 'navigate':
        return this.route(message.targetRelPath);
      case 'openTask':
        return this.show({ mode: 'task', folderUri: message.folderUri });
      case 'openArtifact':
        return this.show({
          mode: 'artifact',
          folderUri: message.folderUri,
          artifactRelPath: message.artifactRelPath,
          variant: message.variant,
          ...(message.anchor === undefined ? {} : { anchor: message.anchor })
        });
      case 'openDashboard':
        return this.show({ mode: 'dashboard' });
      case 'openRisks':
        return this.show({
          mode: 'risks',
          ...(message.folderUri === undefined ? {} : { folderUri: message.folderUri })
        });
      case 'openSource':
        return this.openInEditor(
          vscode.Uri.joinPath(vscode.Uri.parse(message.folderUri), message.artifactRelPath)
        );
      case 'openFile':
        return this.openInEditor(
          vscode.Uri.joinPath(vscode.Uri.parse(message.folderUri), message.workspaceRelPath)
        );
      case 'openExternal':
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        return;
      case 'openInBrowser':
        await vscode.env.openExternal(
          vscode.Uri.joinPath(vscode.Uri.parse(message.folderUri), message.artifactRelPath)
        );
        return;
      case 'setFilter':
        sharedFilter().patch(message.patch);
        return;
      case 'clearFilter':
        sharedFilter().clear();
        return;
      case 'startWorkflow':
        return this.run('maister.startWorkflow');
      case 'runNextAction':
        return this.run('maister.runNextAction', { folderUri: message.folderUri });
    }
  }

  /** § 5.3's target table, narrowed by A2.1: the target is already inside this task folder. */
  private async route(targetRelPath: string): Promise<void> {
    const folderUri = this.hostFolderUri;
    if (folderUri === undefined) {
      return;
    }
    if (targetRelPath === DASHBOARD_FILE) {
      return this.show({ mode: 'task', folderUri });
    }
    if (/\.md$/i.test(targetRelPath)) {
      return this.show({ mode: 'artifact', folderUri, artifactRelPath: targetRelPath, variant: 'md' });
    }
    if (/\.html?$/i.test(targetRelPath)) {
      return this.show({
        mode: 'artifact',
        folderUri,
        artifactRelPath: targetRelPath,
        variant: 'html'
      });
    }
    return this.openInEditor(vscode.Uri.joinPath(vscode.Uri.parse(folderUri), targetRelPath));
  }

  private async openInEditor(uri: vscode.Uri): Promise<void> {
    await this.run('vscode.open', uri);
  }

  /** A command another surface owns may not be registered yet; that is logged, never thrown. */
  private async run(command: string, argument?: unknown): Promise<void> {
    try {
      await (argument === undefined
        ? vscode.commands.executeCommand(command)
        : vscode.commands.executeCommand(command, argument));
    } catch (error) {
      this.options.log(
        format(PANEL.commandFailed, {
          command,
          detail: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }

  // --- rendering -------------------------------------------------------------

  private get folders(): readonly vscode.WorkspaceFolder[] {
    return this.options.folders?.() ?? vscode.workspace.workspaceFolders ?? [];
  }

  /**
   * The workspace folder holding the task on screen: what this surface's workspace-relative
   * paths are relative to. The most specific folder wins, so a nested folder roots its own.
   */
  private get workspaceRootUri(): string | undefined {
    const location = this.location;
    const folderUri = location?.mode === 'dashboard' ? undefined : location?.folderUri;
    if (folderUri === undefined) {
      return undefined;
    }
    return this.folders
      .map((folder) => folder.uri.toString())
      .filter((root) => folderUri === root || folderUri.startsWith(root.endsWith('/') ? root : `${root}/`))
      .sort((left, right) => right.length - left.length)[0];
  }

  private get hostFolderUri(): string | undefined {
    const location = this.location;
    return location !== undefined && location.mode === 'task' && this.hosting
      ? location.folderUri
      : undefined;
  }

  private taskAt(folderUri: string): Task | undefined {
    return this.options.index.snapshot.tasks.get(folderUri);
  }

  private async render(): Promise<void> {
    const location = this.location;
    if (location === undefined) {
      return;
    }
    if (
      (location.mode === 'task' || location.mode === 'artifact') &&
      this.taskAt(location.folderUri) === undefined
    ) {
      this.options.log(format(PANEL.taskGone, { folderUri: location.folderUri }));
      this.history[this.cursor] = { mode: 'dashboard' };
      return this.render();
    }

    const view = await this.buildView(this.history[this.cursor]);
    this.hosting = view.hosting;
    this.rendered = view.html;
    this.pending = view.payload ?? null;

    const panel = this.ensurePanel();
    panel.title = view.title;
    panel.webview.options = {
      enableScripts: true,
      enableCommandUris: false,
      localResourceRoots: this.resourceRoots()
    };
    panel.webview.html = view.html;
    panel.reveal(panel.viewColumn, true);
    await this.applyContextKeys();
    if (view.payload !== undefined) {
      this.publish(view.payload);
    }
  }

  private async buildView(location: PanelLocation): Promise<View> {
    if (location.mode === 'dashboard') {
      return {
        title: PANEL.titleDashboard,
        html: this.bundleHtml(PANEL.titleDashboard, 'dashboardMode'),
        hosting: false,
        payload: this.dashboardPayload()
      };
    }
    if (location.mode === 'risks') {
      return {
        title: PANEL.titleRisks,
        html: this.bundleHtml(PANEL.titleRisks, 'risksMode'),
        hosting: false,
        payload: this.risksPayload(location.folderUri)
      };
    }
    if (location.mode === 'artifact') {
      return this.buildArtifact(location);
    }

    const task = this.taskAt(location.folderUri) as Task;
    const title = format(PANEL.titleTask, { title: task.title });
    const hostable = await this.hostableHtml(task);
    return hostable === null
      ? this.buildFallback(task)
      : { title, html: hostable, hosting: true };
  }

  // --- dashboard mode (§ 5.5) -------------------------------------------------

  private get tasks(): Task[] {
    return [...this.options.index.snapshot.tasks.values()];
  }

  /**
   * § 5.5 — the charts are aggregated over the **whole** index and the KPI tiles with them;
   * only `rows` follows the one shared `TaskQuery`, capped at `DASHBOARD_ROW_LIMIT`.
   */
  private dashboardPayload(now: number = Date.now()): DashboardPayload {
    const tasks = this.tasks;
    const quietDays = quietDaysSetting();
    const query = sharedFilter().value;
    const hits = this.options.index.query(query);

    return {
      type: 'dashboard',
      heading: DASHBOARD.heading,
      scope: format(DASHBOARD.scope, { total: tasks.length }),
      kpis: this.dashboardKpis(tasks, now, quietDays),
      charts: this.dashboardCharts(tasks, query, now),
      rows: hits
        .slice(0, DASHBOARD_ROW_LIMIT)
        .map((hit) => this.dashboardRow(hit.task, now, quietDays)),
      rowLimit: DASHBOARD_ROW_LIMIT,
      matched: hits.length,
      total: tasks.length,
      filter: { chips: filterChips(query), count: sharedFilter().facetCount }
    };
  }

  private dashboardKpis(
    tasks: readonly Task[],
    now: number,
    quietDays: number
  ): DashboardKpi[] {
    const thisWeek = weekStart(now);
    const completed = tasks.filter((task) => task.status === 'completed').length;
    // A5 — every surface reads the same count, so a click always reveals exactly these rows.
    const openRisks = tasks.reduce((sum, task) => sum + openRiskCount(task), 0);
    const tasksWithRisks = tasks.filter((task) => openRiskCount(task) > 0).length;

    return [
      {
        key: 'tasks',
        glyph: '◈',
        tone: 'blue',
        value: tasks.length,
        label: DASHBOARD.kpiTasks,
        context: format(DASHBOARD.kpiTasksContext, {
          n: tasks.filter((task) => task.created !== null && task.created.getTime() >= thisWeek)
            .length
        })
      },
      {
        key: 'failedVerification',
        glyph: '✕',
        tone: 'red',
        value: tasks.filter((task) => task.verdict === 'failed').length,
        label: DASHBOARD.kpiFailed,
        context: format(DASHBOARD.kpiFailedContext, { completed })
      },
      {
        key: 'quiet',
        glyph: '⏸',
        tone: 'orange',
        value: tasks.filter((task) => isQuiet(task, now, quietDays)).length,
        label: format(DASHBOARD.kpiQuiet, { days: quietDays }),
        context: DASHBOARD.kpiQuietContext
      },
      {
        key: 'openRisks',
        glyph: '⚠',
        tone: 'purple',
        value: openRisks,
        label: DASHBOARD.kpiOpenRisks,
        context: format(DASHBOARD.openRisksContext, { k: tasksWithRisks })
      }
    ];
  }

  private dashboardCharts(
    tasks: readonly Task[],
    query: TaskQuery,
    now: number
  ): DashboardChart[] {
    const completed = tasks.filter((task) => task.status === 'completed');
    const countBy = <T>(values: readonly Task[], pick: (task: Task) => T, value: T): number =>
      values.filter((task) => pick(task) === value).length;

    const statusBars: DashboardBar[] = STATUS_BARS.map((entry) => ({
      key: entry.status,
      label: STATUS_LABELS[entry.status],
      glyph: STATUS_GLYPHS[entry.status],
      count: countBy(tasks, (task) => task.status, entry.status),
      tone: entry.tone,
      hatched: entry.hatched,
      pressed: query.statuses?.includes(entry.status) === true
    })).filter((bar) => bar.count > 0 || bar.pressed);

    const verdictBars: DashboardBar[] = VERDICT_BARS.map((entry) => ({
      key: entry.verdict === null ? 'none' : entry.verdict,
      label: entry.verdict === 'none' ? DASHBOARD.verdictNone : VERDICT_LABELS[entry.verdict as Exclude<Verdict, null>],
      glyph: entry.glyph,
      count: countBy(completed, (task) => task.verdict ?? 'none', entry.verdict),
      tone: entry.tone,
      hatched: entry.hatched,
      pressed: query.verdicts?.includes(entry.verdict) === true
    })).filter((bar) => bar.count > 0 || bar.pressed);

    const typeBars: DashboardBar[] = TYPE_BARS.map((entry) => ({
      key: entry.type,
      label: WORKFLOW_LABELS[entry.type],
      glyph: entry.glyph,
      count: countBy(tasks, (task) => task.type, entry.type),
      // § 5.5 — one hue: a workflow type is identified by its label and glyph, not by colour.
      tone: 'blue' as const,
      hatched: false,
      pressed: query.types?.includes(entry.type) === true
    })).filter((bar) => bar.count > 0 || bar.pressed);

    const undated = tasks.filter((task) => task.created === null).length;
    return [
      {
        key: 'status',
        title: DASHBOARD.chartStatus,
        scope: format(DASHBOARD.scopeAll, { total: tasks.length }),
        facet: 'statuses',
        bars: statusBars,
        weeks: [],
        footnote: null
      },
      {
        key: 'verification',
        title: DASHBOARD.chartVerification,
        scope: format(DASHBOARD.scopeCompleted, { completed: completed.length }),
        facet: 'verdicts',
        bars: verdictBars,
        weeks: [],
        footnote: null
      },
      {
        key: 'type',
        title: DASHBOARD.chartType,
        scope: format(DASHBOARD.scopeAll, { total: tasks.length }),
        facet: 'types',
        bars: typeBars,
        weeks: [],
        footnote: null
      },
      {
        key: 'created',
        title: DASHBOARD.chartCreated,
        scope: DASHBOARD.scopeWeeks,
        // § 5.5 — week columns are not filters.
        facet: null,
        bars: [],
        weeks: this.createdPerWeek(tasks, now),
        footnote:
          undated === 0
            ? DASHBOARD.createdFootnoteNone
            : format(DASHBOARD.createdFootnote, { n: undated })
      }
    ];
  }

  private createdPerWeek(tasks: readonly Task[], now: number): DashboardWeek[] {
    const thisWeek = weekStart(now);
    const weeks: DashboardWeek[] = [];
    for (let back = WEEKS_SHOWN - 1; back >= 0; back -= 1) {
      const start = weekStart(thisWeek - back * 7 * DAY_MS);
      const end = start + 7 * DAY_MS;
      weeks.push({
        label: weekLabel(start),
        count: tasks.filter((task) => {
          const created = task.created?.getTime();
          return created !== undefined && created >= start && created < end;
        }).length,
        current: back === 0
      });
    }
    return weeks;
  }

  private dashboardRow(task: Task, now: number, quietDays: number): DashboardRow {
    const phase = currentPhaseName(task);
    return {
      folderUri: task.ref.folderUri,
      title: task.title,
      typeLabel: WORKFLOW_LABELS[task.type],
      statusGlyph: STATUS_GLYPHS[task.status],
      statusText:
        phase === null ? STATUS_LABELS[task.status] : `${STATUS_LABELS[task.status]} · ${phase}`,
      verdict: verdictText(task),
      author: task.author?.name ?? AUTHOR.unknown,
      created: formatDate(task.created),
      activity: activityText(task, now, quietDays),
      nextAction: nextActionOf(task)
    };
  }

  // --- risks mode (§ 5.7) -----------------------------------------------------

  /**
   * § 5.7 — the **full** risk set for the scope, resolved rows included, so the webview's
   * text search, status toggles, Show resolved and Group by need no round-trip (A2). The
   * scope is one task when the mode was opened from one, otherwise the whole index narrowed
   * by the shared type facet — the only facet Risks mode shares.
   */
  private risksPayload(folderUri?: string, now: number = Date.now()): RisksPayload {
    const quietDays = quietDaysSetting();
    const query = sharedFilter().value;
    const scoped = folderUri === undefined ? undefined : this.taskAt(folderUri);
    const inScope = (
      scoped !== undefined
        ? [scoped]
        : this.tasks.filter(
            (task) =>
              query.types === undefined ||
              query.types.length === 0 ||
              query.types.includes(task.type)
          )
    ).sort((left, right) => right.activityMtime - left.activityMtime);

    const groups = inScope
      .map((task) => this.riskGroup(task, now, quietDays))
      .filter((group) => group.risks.length > 0);

    return {
      type: 'risks',
      kpis: this.risksKpis(groups, inScope),
      groups,
      typeFacets: this.riskTypeFacets(query),
      scopedTitle: scoped?.title ?? null
    };
  }

  private riskGroup(task: Task, now: number, quietDays: number): RiskGroup {
    return {
      folderUri: task.ref.folderUri,
      title: task.title,
      typeKey: task.type,
      typeLabel: WORKFLOW_LABELS[task.type],
      statusGlyph: STATUS_GLYPHS[task.status],
      statusText:
        currentPhaseName(task) === null
          ? STATUS_LABELS[task.status]
          : `${STATUS_LABELS[task.status]} · ${currentPhaseName(task) ?? ''}`,
      verdict: task.verdict === null ? null : VERDICT_LABELS[task.verdict],
      activity: activityText(task, now, quietDays),
      author: task.author?.name ?? AUTHOR.unknown,
      openCount: openRiskCount(task),
      unfinished: task.status !== 'completed',
      nextAction: nextActionOf(task),
      // A5 — never a second count and never a second definition; and Maister records
      // neither a severity nor a date, so no such field exists to carry.
      risks: collectRisks(task).map((risk) => ({
        text: risk.text,
        resolved: risk.resolved,
        source: risk.source,
        sourceKind: risk.sourceKind,
        artifactRelPath: risk.sourceKind === 'artifact' ? risk.source : null
      }))
    };
  }

  private risksKpis(groups: readonly RiskGroup[], inScope: readonly Task[]): RisksKpi[] {
    const open = (task: Task): number => openRiskCount(task);
    const sum = (predicate: (task: Task) => boolean): number =>
      inScope.filter(predicate).reduce((total, task) => total + open(task), 0);
    const failedTasks = inScope.filter((task) => task.verdict === 'failed' && open(task) > 0);

    return [
      {
        key: 'openRisks',
        glyph: '⚠',
        tone: 'purple',
        value: sum(() => true),
        label: RISKS.kpiOpen,
        context: format(RISKS.kpiOpenContext, {
          k: groups.filter((group) => group.openCount > 0).length
        })
      },
      {
        key: 'unfinished',
        glyph: '◯',
        tone: 'blue',
        value: sum((task) => task.status !== 'completed'),
        label: RISKS.kpiUnfinished,
        context: RISKS.kpiUnfinishedContext
      },
      {
        key: 'completed',
        glyph: '✓',
        tone: 'green',
        value: sum((task) => task.status === 'completed'),
        label: RISKS.kpiCompleted,
        context: RISKS.kpiCompletedContext
      },
      {
        key: 'failedVerification',
        glyph: '✕',
        tone: 'red',
        value: sum((task) => task.verdict === 'failed'),
        label: RISKS.kpiFailed,
        context: format(RISKS.kpiFailedContext, { k: failedTasks.length })
      }
    ];
  }

  private riskTypeFacets(query: TaskQuery): RiskTypeFacet[] {
    const tasks = this.tasks;
    return TYPE_BARS.filter((entry) =>
      tasks.some((task) => task.type === entry.type)
    ).map((entry) => ({
      key: entry.type,
      label: WORKFLOW_LABELS[entry.type],
      pressed: query.types?.includes(entry.type) === true
    }));
  }

  /**
   * § 5.2 — hosted only when the workspace is trusted, the task ships a dashboard and that
   * dashboard carries the structural signature. Any other outcome degrades to § 5.4's
   * native summary with the reason stated, rather than failing the panel.
   */
  private async hostableHtml(task: Task): Promise<string | null> {
    const folderUri = vscode.Uri.parse(task.ref.folderUri);
    const reject = (reason: string): null => {
      this.options.log(format(PANEL.fallbackReason, { folderUri: task.ref.folderUri, reason }));
      return null;
    };
    if (!vscode.workspace.isTrusted) {
      return reject(PANEL.bannerUntrusted);
    }
    if (!task.hasDashboard) {
      return reject(PANEL.bannerNoDashboard);
    }

    const dashboardUri = vscode.Uri.joinPath(folderUri, DASHBOARD_FILE);
    try {
      const stat = await vscode.workspace.fs.stat(dashboardUri);
      const recognition = await this.recognizer.recognize(
        task.ref.folderUri,
        { mtime: stat.mtime, size: stat.size },
        async () => decode(await vscode.workspace.fs.readFile(dashboardUri))
      );
      if (!recognition.recognized) {
        return reject(recognition.reason);
      }
      return hostDashboardHtml(
        decode(await vscode.workspace.fs.readFile(dashboardUri)),
        this.insertions(folderUri)
      );
    } catch (error) {
      return reject(
        format(PANEL.unreadableDashboard, {
          detail: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }

  /** The § 5.3 insertions, with `<base href>` at whichever directory is being hosted. */
  private insertions(baseUri: vscode.Uri): DashboardResources {
    const webview = this.ensurePanel().webview;
    return {
      cspSource: webview.cspSource,
      baseHref: `${webview.asWebviewUri(baseUri).toString()}/`,
      shimSrc: webview
        .asWebviewUri(
          vscode.Uri.joinPath(this.options.context.extensionUri, 'dist', 'webview', 'shim.js')
        )
        .toString()
    };
  }

  // --- artifact mode (§ 6.1–6.4) ---------------------------------------------

  private async buildArtifact(location: ReaderLocation): Promise<View> {
    const task = this.taskAt(location.folderUri) as Task;
    const folder = vscode.Uri.parse(location.folderUri);
    const ref = task.artifacts.find((artifact) => artifact.relPath === location.artifactRelPath);
    const label = ref?.label ?? basename(location.artifactRelPath);
    const title = format(PANEL.titleArtifact, { label });

    let notice: string | null = null;
    if (location.variant === 'html') {
      const companionRelPath = HTML_FILE.test(location.artifactRelPath)
        ? location.artifactRelPath
        : ref?.htmlRelPath ?? null;
      const hosted =
        companionRelPath === null ? null : await this.hostCompanion(folder, companionRelPath);
      if (hosted !== null && hosted.ok) {
        return { title, html: hosted.html, hosting: false };
      }
      notice = hosted === null ? null : hosted.notice;
    }

    const payload = HTML_FILE.test(location.artifactRelPath)
      ? this.refusal(location, task, label, notice ?? READER.unreadable)
      : await this.readerPayload(location, task, label, notice);
    return { title, html: this.bundleHtml(title, 'reader'), hosting: false, payload };
  }

  /** § 6.4 — the companion is re-hosted, or refused with a line the reader shows. */
  private async hostCompanion(
    folder: vscode.Uri,
    companionRelPath: string
  ): Promise<CompanionResult> {
    // § 8.1 — an untrusted workspace never executes task-authored HTML.
    if (!vscode.workspace.isTrusted) {
      return { ok: false, notice: PANEL.bannerUntrusted };
    }
    const uri = vscode.Uri.joinPath(folder, companionRelPath);
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const source = decode(await vscode.workspace.fs.readFile(uri));
      return companionHtml(
        source,
        stat.size,
        this.insertions(vscode.Uri.joinPath(uri, '..'))
      );
    } catch (error) {
      this.options.log(
        format(PANEL.commandFailed, {
          command: companionRelPath,
          detail: error instanceof Error ? error.message : String(error)
        })
      );
      return { ok: false, notice: READER.unreadable };
    }
  }

  private heroesFor(task: Task, current: string): RenderPayload['heroes'] {
    return task.artifacts
      .filter((artifact) => artifact.isHero)
      .map((artifact) => ({
        label: artifact.label,
        artifactRelPath: artifact.relPath,
        current: artifact.relPath === current
      }));
  }

  private refusal(
    location: ReaderLocation,
    task: Task,
    label: string,
    notice: string
  ): RenderPayload {
    return {
      type: 'render',
      location,
      folderUri: location.folderUri,
      taskTitle: task.title,
      artifactLabel: label,
      summary: null,
      checklist: null,
      bodyHtml: '',
      heroes: this.heroesFor(task, location.artifactRelPath),
      notice,
      refused: true
    };
  }

  /** § 6.2 — read, render and cache on `(path, mtime, size)`; nothing is rendered twice. */
  private async readerPayload(
    location: ReaderLocation,
    task: Task,
    label: string,
    notice: string | null
  ): Promise<RenderPayload> {
    const folder = vscode.Uri.parse(location.folderUri);
    const uri = vscode.Uri.joinPath(folder, location.artifactRelPath);
    const webview = this.ensurePanel().webview;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const tooLarge = oversizeNotice(stat.size);
      if (tooLarge !== null) {
        return this.refusal(location, task, label, tooLarge);
      }
      const text = decode(await vscode.workspace.fs.readFile(uri));
      const rendered = this.renders.get(
        { path: uri.toString(), mtime: stat.mtime, size: stat.size },
        () =>
          renderArtifact(text, {
            artifactRelPath: location.artifactRelPath,
            taskRelPath: task.ref.relPath,
            imageUri: (relPath) =>
              webview.asWebviewUri(vscode.Uri.joinPath(folder, relPath)).toString()
          })
      );
      return {
        type: 'render',
        location,
        folderUri: location.folderUri,
        taskTitle: task.title,
        artifactLabel: label,
        summary: rendered.summary,
        checklist: rendered.checklist,
        bodyHtml: rendered.bodyHtml,
        heroes: this.heroesFor(task, location.artifactRelPath),
        notice,
        refused: false
      };
    } catch (error) {
      this.options.log(
        format(PANEL.commandFailed, {
          command: location.artifactRelPath,
          detail: error instanceof Error ? error.message : String(error)
        })
      );
      return this.refusal(location, task, label, READER.unreadable);
    }
  }

  // --- fallback view (§ 5.4) --------------------------------------------------

  /**
   * § 5.4's native summary. The banner and the A2.2 button rule are settled here, where the
   * hosting decision is made; `webview/fallbackTask.ts` owns the markup.
   */
  private async buildFallback(task: Task): Promise<View> {
    const title = format(PANEL.titleTask, { title: task.title });
    const trusted = vscode.workspace.isTrusted;
    const banner = !trusted
      ? PANEL.bannerUntrusted
      : task.hasDashboard
        ? PANEL.bannerUnrecognized
        : PANEL.bannerNoDashboard;

    const folder = vscode.Uri.parse(task.ref.folderUri);
    let files: TaskFile[] = [];
    try {
      files = [...(await this.options.index.getDetail(task.ref.folderUri)).files];
    } catch {
      files = [];
    }
    let rawState = '';
    try {
      rawState = decode(
        await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, STATE_FILE))
      );
    } catch {
      rawState = FALLBACK.stateUnreadable;
    }

    const risks = collectRisks(task);
    const payload: FallbackPayload = {
      type: 'task',
      folderUri: task.ref.folderUri,
      banner,
      // A2.2 — in an untrusted workspace the button is not rendered at all.
      openInBrowser: trusted && task.hasDashboard,
      dashboardRelPath: DASHBOARD_FILE,
      title: task.title,
      typeLabel: WORKFLOW_LABELS[task.type],
      statusGlyph: STATUS_GLYPHS[task.status],
      statusText: STATUS_LABELS[task.status],
      verdict: task.verdict === null ? FALLBACK.verdictNone : VERDICT_LABELS[task.verdict],
      author: task.author?.name ?? AUTHOR.unknown,
      created: formatDate(task.created),
      updated: formatAge(task.activityMtime),
      parseIssues: task.parseIssues.map((issue) => issue.message),
      nextAction:
        trusted && task.nextAction.id !== 'none'
          ? { id: task.nextAction.id, label: task.nextAction.label }
          : null,
      phases: task.phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
        glyph: PHASE_GLYPHS[phase.status],
        statusText:
          phase.status === 'current' && phase.activeForm !== null
            ? format(FALLBACK.phaseCurrent, { activeForm: phase.activeForm })
            : PHASE_STATUS_LABELS[phase.status]
      })),
      heroes: task.artifacts
        .filter((artifact) => artifact.isHero)
        .map((artifact) => ({
          artifactRelPath: artifact.relPath,
          label: artifact.label,
          tldr: artifact.summary?.tldr ?? null,
          variant: HTML_FILE.test(artifact.relPath) ? ('html' as const) : ('md' as const)
        })),
      decisions: groupDecisions(task),
      risks: [...risks]
        .sort((left, right) => Number(left.resolved) - Number(right.resolved))
        .map((risk) => ({ text: risk.text, resolved: risk.resolved, source: risk.source })),
      files: listedFiles(files, task.artifacts),
      rawState
    };
    return { title, html: this.bundleHtml(title, 'fallbackTask'), hosting: false, payload };
  }

  /** The document that hosts one of the extension's own webview bundles. */
  private bundleHtml(title: string, bundle: string): string {
    const webview = this.ensurePanel().webview;
    const nonce = crypto.randomBytes(16).toString('base64');
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.options.context.extensionUri, 'media', 'webview.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.options.context.extensionUri,
        'dist',
        'webview',
        `${bundle}.js`
      )
    );
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">`,
      `<link rel="stylesheet" href="${styleUri.toString()}">`,
      `<title>${escapeHtml(title)}</title>`,
      '</head>',
      '<body class="panel">',
      '<div id="root"></div>',
      `<script nonce="${nonce}" src="${scriptUri.toString()}"></script>`,
      '</body>',
      '</html>'
    ].join('\n');
  }

  /**
   * § 5.1's roots, plus the hosting task folder itself: a dashboard is read from where the
   * task lives, and a workspace folder may carry tasks outside `.maister/tasks` (fixtures,
   * archives). Nothing wider than a task folder is ever added.
   */
  private resourceRoots(): vscode.Uri[] {
    const roots = [
      vscode.Uri.joinPath(this.options.context.extensionUri, 'media'),
      vscode.Uri.joinPath(this.options.context.extensionUri, 'dist', 'webview'),
      ...this.folders.map((folder) => vscode.Uri.joinPath(folder.uri, ...TASKS_ROOT))
    ];
    const location = this.location;
    if (location !== undefined && location.mode !== 'dashboard' && location.folderUri !== undefined) {
      roots.push(vscode.Uri.parse(location.folderUri));
    }
    return roots;
  }

  private ensurePanel(): vscode.WebviewPanel {
    if (this.panel !== undefined) {
      return this.panel;
    }
    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      PANEL.titleDashboard,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        enableCommandUris: false,
        retainContextWhenHidden: false,
        localResourceRoots: this.resourceRoots()
      }
    );
    this.adopt(panel);
    return panel;
  }

  private adopt(panel: vscode.WebviewPanel): void {
    this.panel = panel;
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.hosting = false;
      void this.applyContextKeys();
    });
    panel.webview.onDidReceiveMessage((raw: unknown) => void this.handleMessage(raw));
  }

  private post(message: unknown): void {
    this.postEmitter.fire(message);
    void this.panel?.webview.postMessage(message);
  }

  /** One fire per built payload; the wire may carry it twice, the host-side seam never does. */
  private publish(payload: unknown): void {
    this.pending = payload;
    this.post(payload);
  }

  /** A bundle that has just finished loading asks for the payload again. */
  private deliverPending(): void {
    if (this.pending !== null) {
      void this.panel?.webview.postMessage(this.pending);
    }
  }

  /**
   * § 3.5 — a dashboard-data.js write reaches the shim as a refresh, never as data. A change
   * under a bundle-backed location is re-rendered and re-posted **without** rebuilding the
   * document, so the reader keeps the scroll position it stored (§ 6.3).
   */
  private onIndexChange(changed: readonly string[]): void {
    const location = this.location;
    if (location === undefined) {
      return;
    }
    if (location.mode === 'dashboard' || location.mode === 'risks') {
      void this.republish(location);
      return;
    }
    if (!changed.includes(location.folderUri)) {
      return;
    }
    if (this.hosting) {
      this.post({ type: 'refresh' });
      return;
    }
    void this.republish(location);
  }

  private onFilterChange(): void {
    const location = this.location;
    if (location?.mode === 'dashboard' || location?.mode === 'risks') {
      void this.republish(location);
    }
  }

  private async republish(location: PanelLocation): Promise<void> {
    if (
      (location.mode === 'task' || location.mode === 'artifact') &&
      this.taskAt(location.folderUri) === undefined
    ) {
      return this.render();
    }
    const view = await this.buildView(location);
    if (view.payload !== undefined) {
      this.publish(view.payload);
    }
  }

  private async applyContextKeys(): Promise<void> {
    const location = this.location;
    const artifact = location?.mode === 'artifact' ? location : undefined;
    const task =
      location !== undefined && location.mode !== 'dashboard' && location.folderUri !== undefined
        ? this.taskAt(location.folderUri)
        : undefined;
    const keys: Record<string, unknown> = {
      'maister.panel.mode': location?.mode ?? '',
      'maister.panel.canGoBack': this.canGoBack,
      'maister.panel.canGoForward': this.canGoForward,
      'maister.panel.variantAvailable':
        artifact !== undefined &&
        task?.artifacts.some(
          (candidate) =>
            candidate.relPath === artifact.artifactRelPath && candidate.htmlRelPath !== null
        ) === true,
      'maister.panel.hasNextAction': task !== undefined && task.nextAction.id !== 'none'
    };
    for (const [key, value] of Object.entries(keys)) {
      await vscode.commands.executeCommand('setContext', key, value);
    }
  }
}

let panel: TaskPanel | undefined;

/** The § 5.1 singleton; every entry point reveals the same panel. */
export function taskPanel(options: PanelOptions): TaskPanel {
  panel ??= new TaskPanel(options);
  return panel;
}

export function registerPanel(
  context: vscode.ExtensionContext,
  index: TaskIndex,
  log: (line: string) => void
): vscode.Disposable[] {
  const options: PanelOptions = { context, index, log };
  const instance = taskPanel(options);

  return [
    new vscode.Disposable(() => {
      instance.dispose();
      panel = undefined;
    }),
    vscode.commands.registerCommand('maister.openTask', (argument: { folderUri?: string }) =>
      typeof argument?.folderUri === 'string'
        ? instance.show({ mode: 'task', folderUri: argument.folderUri })
        : undefined
    ),
    vscode.commands.registerCommand(
      'maister.openArtifact',
      (argument: { folderUri?: string; artifactRelPath?: string; variant?: Variant }) =>
        typeof argument?.folderUri === 'string' && typeof argument.artifactRelPath === 'string'
          ? instance.show({
              mode: 'artifact',
              folderUri: argument.folderUri,
              artifactRelPath: argument.artifactRelPath,
              variant: argument.variant === 'html' ? 'html' : 'md'
            })
          : undefined
    ),
    vscode.commands.registerCommand('maister.openDashboard', () =>
      instance.show({ mode: 'dashboard' })
    ),
    vscode.commands.registerCommand('maister.openRisks', (argument?: { folderUri?: string }) =>
      instance.show({
        mode: 'risks',
        ...(typeof argument?.folderUri === 'string' ? { folderUri: argument.folderUri } : {})
      })
    ),
    vscode.commands.registerCommand('maister.panel.toggleVariant', () => instance.toggleVariant()),
    vscode.commands.registerCommand(
      'maister.openArtifactSource',
      (argument?: { folderUri?: string; artifactRelPath?: string }) =>
        instance.openSource(argument)
    ),
    vscode.commands.registerCommand(
      'maister.revealInExplorer',
      (argument?: { folderUri?: string; artifactRelPath?: string }) =>
        instance.revealInExplorer(argument)
    ),
    vscode.commands.registerCommand('maister.panel.back', () => instance.back()),
    vscode.commands.registerCommand('maister.panel.forward', () => instance.forward()),
    vscode.window.registerWebviewPanelSerializer(PANEL_VIEW_TYPE, {
      deserializeWebviewPanel: async (restored: vscode.WebviewPanel, state: unknown) => {
        const location = readLocation(state, (folderUri) => index.snapshot.tasks.has(folderUri));
        await instance.restore(restored, location);
      }
    })
  ];
}

/** A persisted location is untrusted input like any other; an unusable one becomes Dashboard. */
function readLocation(state: unknown, isIndexed: (folderUri: string) => boolean): PanelLocation {
  if (typeof state !== 'object' || state === null) {
    return { mode: 'dashboard' };
  }
  const candidate = state as Partial<PanelLocation> & { folderUri?: unknown };
  const folderUri = typeof candidate.folderUri === 'string' ? candidate.folderUri : undefined;
  if (candidate.mode === 'risks') {
    return folderUri !== undefined && isIndexed(folderUri)
      ? { mode: 'risks', folderUri }
      : { mode: 'risks' };
  }
  if (folderUri === undefined || !isIndexed(folderUri)) {
    return { mode: 'dashboard' };
  }
  if (candidate.mode === 'task') {
    return { mode: 'task', folderUri };
  }
  if (candidate.mode === 'artifact') {
    const artifactRelPath = (candidate as { artifactRelPath?: unknown }).artifactRelPath;
    const variant = (candidate as { variant?: unknown }).variant;
    if (typeof artifactRelPath === 'string') {
      return {
        mode: 'artifact',
        folderUri,
        artifactRelPath,
        variant: variant === 'html' ? 'html' : 'md'
      };
    }
  }
  return { mode: 'dashboard' };
}
