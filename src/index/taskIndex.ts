import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { parse as parseYaml } from 'yaml';
import { MAX_STATE_BYTES, oversizedStateTask, parseState } from '../model/parseState.ts';
import { parseSummary } from '../model/parseSummary.ts';
import { MAISTER_VERSION, PRODUCT_BRIEF_REL_PATH, deriveNextAction } from '../model/workflows.ts';
import type { ArtifactRef, Author, Task, TaskRef } from '../model/types.ts';
import { INDEX } from '../strings.ts';
import { readAuthors } from './attribution.ts';
import { queryTasks, type TaskHit, type TaskQuery } from './query.ts';

const SCHEMA_VERSION = 1;
const INDEX_FILE_NAME = 'index-v1.json';
const TASKS_GLOB = '.maister/tasks/*/*/orchestrator-state.yml';
const TASKS_ROOT = '.maister/tasks';
const STATE_FILE_NAME = 'orchestrator-state.yml';
const DASHBOARD_FILE_NAME = 'dashboard.html';
const DASHBOARD_DATA_FILE_NAME = 'dashboard-data.js';
const OVERVIEW_VIEW_ID = 'maister.overview';

const PERSIST_DEBOUNCE_MS = 2_000;
const PERSIST_RETRY_MS = 5_000;
const ATTRIBUTION_DEBOUNCE_MS = 10_000;
const STAT_CONCURRENCY = 16;
const RECONCILE_CONCURRENCY = 8;
/** § 3.1 — only the head of a registered artifact is ever read, never its body. */
const SUMMARY_BYTES = 8 * 1024;
const DETAIL_CACHE_SIZE = 20;

export type IndexLog = (line: string) => void;

export interface IndexSnapshot {
  /** Keyed on `TaskRef.folderUri` — the task identity (A1). */
  readonly tasks: ReadonlyMap<string, Task>;
  readonly freshness: 'cached' | 'fresh';
  readonly builtAt: number;
}

export interface IndexChange {
  readonly snapshot: IndexSnapshot;
  /** The `folderUri`s whose `Task` changed; empty for a relative-time republish. */
  readonly changed: readonly string[];
}

export interface TaskFile {
  relPath: string;
  size: number;
  mtime: number;
  kind: 'md' | 'html' | 'image' | 'other';
}

export interface TaskDetail {
  task: Task;
  /** The parsed YAML tree behind the fallback view's raw-state disclosure; null if unreadable. */
  raw: unknown;
  files: TaskFile[];
}

export interface TaskIndexOptions {
  readonly storageUri: vscode.Uri;
  readonly log: IndexLog;
  readonly notify?: (message: string) => void;
  readonly folders?: () => readonly vscode.WorkspaceFolder[];
  readonly attributionEnabled?: () => boolean;
}

interface Stat {
  mtime: number;
  size: number;
}

interface IndexEntry {
  stateStat: Stat;
  dataStat: Stat | null;
  artifactStats: Record<string, Stat>;
  task: Task;
}

interface Discovered {
  ref: TaskRef;
  dirFsPath: string;
}

interface StattedTask extends Discovered {
  stateStat: Stat | null;
  dataStat: Stat | null;
  dashboardStat: Stat | null;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let index = cursor++; index < items.length; index = cursor++) {
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function statOf(fsPath: string): Promise<Stat | null> {
  try {
    const stat = await fsp.stat(fsPath);
    return stat.isFile() ? { mtime: Math.round(stat.mtimeMs), size: stat.size } : null;
  } catch {
    return null;
  }
}

function sameStat(left: Stat | null, right: Stat | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.mtime === right.mtime && left.size === right.size;
}

/** § 3.1 — the first 8 KB, which is where the § 7 block lives. */
async function readHead(fsPath: string): Promise<string | null> {
  let handle: fsp.FileHandle | undefined;
  try {
    handle = await fsp.open(fsPath, 'r');
    const buffer = Buffer.alloc(SUMMARY_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SUMMARY_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

function fileKind(name: string): TaskFile['kind'] {
  const extension = path.extname(name).toLowerCase();
  if (extension === '.md') {
    return 'md';
  }
  if (extension === '.html' || extension === '.htm') {
    return 'html';
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(extension)) {
    return 'image';
  }
  return 'other';
}

async function listFiles(rootFsPath: string): Promise<TaskFile[]> {
  const files: TaskFile[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
        continue;
      }
      const stat = await statOf(fullPath);
      if (stat !== null) {
        files.push({ relPath, size: stat.size, mtime: stat.mtime, kind: fileKind(entry.name) });
      }
    }
  };
  await walk(rootFsPath, '');
  return files;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toPosix(relPath: string): string {
  return relPath.split(path.sep).join('/');
}

async function realPath(fsPath: string): Promise<string> {
  try {
    return await fsp.realpath(fsPath);
  } catch {
    return fsPath;
  }
}

function isInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}

/**
 * The discovery glob guarantees the directory ends in `.maister/tasks/<segment>/<name>`, so the
 * ref is read off the path itself. Deriving it by relative-to-workspace-folder instead would
 * break wherever the host resolves symlinks (a macOS temp directory, a linked checkout).
 */
function refForTaskDir(dirFsPath: string): TaskRef | null {
  const posix = toPosix(dirFsPath);
  const marker = `/${TASKS_ROOT}/`;
  const at = posix.lastIndexOf(marker);
  if (at < 0) {
    return null;
  }
  const relPath = posix.slice(at + 1);
  const segments = relPath.split('/');
  if (segments.length !== 4) {
    return null;
  }
  return {
    folderUri: vscode.Uri.file(dirFsPath).toString(),
    relPath,
    dirSegment: segments[2],
    folderName: segments[3]
  };
}

function serializeTask(task: Task): unknown {
  return {
    ...task,
    created: task.created?.toISOString() ?? null,
    updated: task.updated?.toISOString() ?? null,
    author: task.author === null ? null : { ...task.author, addedAt: task.author.addedAt.toISOString() }
  };
}

function deserializeTask(raw: unknown): Task | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const candidate = raw as Record<string, unknown> & { ref?: Partial<TaskRef> };
  if (typeof candidate.ref?.folderUri !== 'string' || !Array.isArray(candidate.artifacts)) {
    return null;
  }
  const readDate = (value: unknown): Date | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const rawAuthor = candidate.author as Record<string, unknown> | null | undefined;
  const author: Author | null =
    rawAuthor === null || rawAuthor === undefined || typeof rawAuthor.email !== 'string'
      ? null
      : {
          name: String(rawAuthor.name ?? ''),
          email: rawAuthor.email,
          addedAt: readDate(rawAuthor.addedAt) ?? new Date(0),
          isMe: rawAuthor.isMe === true
        };
  return {
    ...(candidate as unknown as Task),
    created: readDate(candidate.created),
    updated: readDate(candidate.updated),
    author
  };
}

export class TaskIndex implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<IndexChange>();
  private readonly entries = new Map<string, IndexEntry>();
  private readonly details = new Map<string, TaskDetail>();
  private readonly pendingChanges = new Set<string>();
  private readonly attributed = new Set<string>();

  private current: IndexSnapshot = { tasks: new Map(), freshness: 'cached', builtAt: 0 };
  private persistTimer: NodeJS.Timeout | undefined;
  private attributionTimer: NodeJS.Timeout | undefined;
  private attributionRan = false;
  private disposed = false;

  readonly onDidChange: vscode.Event<IndexChange> = this.changeEmitter.event;

  constructor(private readonly options: TaskIndexOptions) {}

  get snapshot(): IndexSnapshot {
    return this.current;
  }

  query(query: TaskQuery): TaskHit[] {
    return queryTasks(this.current.tasks.values(), query);
  }

  /** § 3.4 — instant cached paint, then discover, stat, reconcile and publish fresh. */
  async load(): Promise<void> {
    const cached = await this.readPersisted();
    if (cached !== null && cached.size > 0) {
      for (const [folderUri, entry] of cached) {
        this.entries.set(folderUri, entry);
      }
      this.publish('cached', [...cached.keys()]);
    }
    await this.reconcile();
  }

  async refresh(): Promise<void> {
    await this.reconcile();
  }

  private get folders(): readonly vscode.WorkspaceFolder[] {
    return this.options.folders?.() ?? vscode.workspace.workspaceFolders ?? [];
  }

  private async reconcile(): Promise<void> {
    await vscode.window.withProgress(
      { location: { viewId: OVERVIEW_VIEW_ID }, title: INDEX.reindexing },
      () => this.reconcileNow()
    );
  }

  private async reconcileNow(): Promise<void> {
    const startedAt = Date.now();
    let reused = 0;
    let reparsed = 0;

    try {
      const discovered = await this.discover();
      const statted = await mapWithConcurrency(discovered, STAT_CONCURRENCY, async (task) => ({
        ...task,
        stateStat: await statOf(path.join(task.dirFsPath, STATE_FILE_NAME)),
        dataStat: await statOf(path.join(task.dirFsPath, DASHBOARD_DATA_FILE_NAME)),
        dashboardStat: await statOf(path.join(task.dirFsPath, DASHBOARD_FILE_NAME))
      }));

      const live = new Set<string>();
      const changed = new Set<string>();

      const built = await mapWithConcurrency(statted, RECONCILE_CONCURRENCY, (task) =>
        this.buildEntry(task)
      );

      for (const outcome of built) {
        if (outcome === null) {
          continue;
        }
        live.add(outcome.folderUri);
        if (outcome.reusedTask) {
          reused += 1;
        } else {
          reparsed += 1;
        }
        const previous = this.entries.get(outcome.folderUri);
        this.entries.set(outcome.folderUri, outcome.entry);
        if (previous === undefined || previous.task !== outcome.entry.task) {
          changed.add(outcome.folderUri);
        }
      }

      for (const folderUri of [...this.entries.keys()]) {
        if (!live.has(folderUri)) {
          this.entries.delete(folderUri);
          this.details.delete(folderUri);
          changed.add(folderUri);
        }
      }

      this.publish('fresh', [...changed]);
      this.schedulePersist();
      this.scheduleAttribution();

      const issues = [...this.entries.values()].reduce(
        (total, entry) => total + entry.task.parseIssues.length,
        0
      );
      this.options.log(
        `index: reconciled ${this.entries.size} tasks (${reused} reused, ${reparsed} reparsed), ` +
          `${issues} parse issues, ${Date.now() - startedAt} ms`
      );
    } catch (error) {
      this.options.log(`index: reconcile failed: ${reason(error)}`);
    }
  }

  /** § 3.2 — the exclude argument is null so no user setting can hide a task. */
  private async discover(): Promise<Discovered[]> {
    const discovered: Discovered[] = [];
    for (const folder of this.folders) {
      let matches: vscode.Uri[];
      try {
        matches = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, TASKS_GLOB), null);
      } catch (error) {
        this.options.log(`index: discovery failed in ${folder.uri.toString()}: ${reason(error)}`);
        continue;
      }
      for (const stateUri of matches) {
        const dirFsPath = path.dirname(stateUri.fsPath);
        const ref = refForTaskDir(dirFsPath);
        if (ref !== null) {
          discovered.push({ dirFsPath, ref });
        }
      }
    }
    return discovered;
  }

  private async buildEntry(
    task: StattedTask
  ): Promise<{ folderUri: string; entry: IndexEntry; reusedTask: boolean } | null> {
    if (task.stateStat === null) {
      return null;
    }
    const folderUri = task.ref.folderUri;
    const cached = this.entries.get(folderUri);

    try {
      if (
        cached !== undefined &&
        sameStat(cached.stateStat, task.stateStat) &&
        sameStat(cached.dataStat, task.dataStat)
      ) {
        const entry = await this.refreshArtifacts(task, cached);
        return { folderUri, entry, reusedTask: entry.task === cached.task };
      }

      const input = {
        ref: task.ref,
        stateMtime: task.stateStat.mtime,
        activityMtime: Math.max(task.stateStat.mtime, task.dataStat?.mtime ?? 0),
        hasDashboard: task.dashboardStat !== null,
        hasDashboardData: task.dataStat !== null
      };
      const parsed =
        task.stateStat.size > MAX_STATE_BYTES
          ? oversizedStateTask(input, task.stateStat.size)
          : parseState({
              ...input,
              text: await fsp.readFile(path.join(task.dirFsPath, STATE_FILE_NAME), 'utf8')
            });
      parsed.author = cached?.task.author ?? null;
      parsed.nextAction = await this.nextActionFor(task.dirFsPath, parsed);

      const artifactStats = await this.extractSummaries(task.dirFsPath, parsed.artifacts);
      return {
        folderUri,
        entry: { stateStat: task.stateStat, dataStat: task.dataStat, artifactStats, task: parsed },
        reusedTask: false
      };
    } catch (error) {
      this.options.log(`index: ${task.ref.relPath} could not be indexed: ${reason(error)}`);
      return cached === undefined ? null : { folderUri, entry: cached, reusedTask: true };
    }
  }

  /** Artifact § 7 blocks are invalidated one at a time via `artifactStats` (§ 3.3). */
  private async refreshArtifacts(task: StattedTask, cached: IndexEntry): Promise<IndexEntry> {
    const artifacts = cached.task.artifacts.map((artifact) => ({ ...artifact }));
    const stale: ArtifactRef[] = [];
    const artifactStats: Record<string, Stat> = {};

    for (const artifact of artifacts) {
      const stat = await statOf(path.join(task.dirFsPath, artifact.relPath));
      if (stat !== null) {
        artifactStats[artifact.relPath] = stat;
      }
      if (!sameStat(cached.artifactStats[artifact.relPath] ?? null, stat)) {
        stale.push(artifact);
      }
    }

    if (stale.length === 0) {
      return { ...cached, stateStat: task.stateStat as Stat, dataStat: task.dataStat, artifactStats };
    }

    await this.extractSummaries(task.dirFsPath, stale);
    return {
      stateStat: task.stateStat as Stat,
      dataStat: task.dataStat,
      artifactStats,
      task: { ...cached.task, artifacts }
    };
  }

  /** Populates `ArtifactRef.summary` in place; search and the fallback task view read it. */
  private async extractSummaries(
    dirFsPath: string,
    artifacts: readonly ArtifactRef[]
  ): Promise<Record<string, Stat>> {
    const stats: Record<string, Stat> = {};
    await mapWithConcurrency(artifacts, RECONCILE_CONCURRENCY, async (artifact) => {
      const fsPath = path.join(dirFsPath, artifact.relPath);
      const stat = await statOf(fsPath);
      if (stat === null) {
        artifact.summary = null;
        return;
      }
      stats[artifact.relPath] = stat;
      if (!artifact.relPath.toLowerCase().endsWith('.md')) {
        return;
      }
      const head = await readHead(fsPath);
      artifact.summary = head === null ? null : parseSummary(head, artifact.relPath);
    });
    return stats;
  }

  private async nextActionFor(dirFsPath: string, task: Task): Promise<Task['nextAction']> {
    const needsBrief = task.type === 'product-design' && task.status === 'completed';
    const hasBrief = needsBrief && (await statOf(path.join(dirFsPath, PRODUCT_BRIEF_REL_PATH))) !== null;
    return deriveNextAction(task.type, task.status, hasBrief);
  }

  // --- snapshot publication -------------------------------------------------

  private publish(freshness: IndexSnapshot['freshness'], changed: readonly string[]): void {
    const tasks = new Map<string, Task>();
    for (const [folderUri, entry] of this.entries) {
      tasks.set(folderUri, entry.task);
    }
    this.current = { tasks, freshness, builtAt: Date.now() };
    this.pendingChanges.clear();
    this.changeEmitter.fire({ snapshot: this.current, changed });
  }

  /** The watcher throttles these; a burst of Maister writes yields one UI update (§ 3.5). */
  publishPending(): void {
    if (this.pendingChanges.size === 0) {
      return;
    }
    this.publish('fresh', [...this.pendingChanges]);
    this.schedulePersist();
  }

  /** § 3.5's 60 s relative-time refresh: the same snapshot, no file I/O. */
  republish(): void {
    this.changeEmitter.fire({ snapshot: this.current, changed: [] });
  }

  // --- incremental updates, driven by the watcher ---------------------------

  async reindexTask(folderUri: string): Promise<void> {
    const known = this.entries.get(folderUri);
    const dirFsPath = vscode.Uri.parse(folderUri).fsPath;
    const ref = known?.task.ref ?? refForTaskDir(dirFsPath);
    if (ref === null) {
      return;
    }
    const statted: StattedTask = {
      ref,
      dirFsPath,
      stateStat: await statOf(path.join(dirFsPath, STATE_FILE_NAME)),
      dataStat: await statOf(path.join(dirFsPath, DASHBOARD_DATA_FILE_NAME)),
      dashboardStat: await statOf(path.join(dirFsPath, DASHBOARD_FILE_NAME))
    };
    if (statted.stateStat === null) {
      this.evictTask(folderUri);
      return;
    }
    const outcome = await this.buildEntry(statted);
    if (outcome === null) {
      return;
    }
    this.entries.set(folderUri, outcome.entry);
    this.details.delete(folderUri);
    this.pendingChanges.add(folderUri);
    this.scheduleAttribution();
  }

  evictTask(folderUri: string): void {
    if (!this.entries.delete(folderUri)) {
      return;
    }
    this.details.delete(folderUri);
    this.pendingChanges.add(folderUri);
  }

  /** A `dashboard-data.js` write is activity, not a state change: stat only (§ 3.5). */
  async touchActivity(folderUri: string): Promise<void> {
    const entry = this.entries.get(folderUri);
    if (entry === undefined) {
      return;
    }
    const dataStat = await statOf(path.join(vscode.Uri.parse(folderUri).fsPath, DASHBOARD_DATA_FILE_NAME));
    entry.dataStat = dataStat;
    entry.task = {
      ...entry.task,
      hasDashboardData: dataStat !== null,
      activityMtime: Math.max(entry.task.stateMtime, dataStat?.mtime ?? 0)
    };
    this.pendingChanges.add(folderUri);
  }

  async reindexArtifact(folderUri: string, artifactRelPath: string): Promise<void> {
    const entry = this.entries.get(folderUri);
    const registered = entry?.task.artifacts.find((artifact) => artifact.relPath === artifactRelPath);
    if (entry === undefined || registered === undefined) {
      return;
    }
    const artifacts = entry.task.artifacts.map((artifact) => ({ ...artifact }));
    const target = artifacts.find((artifact) => artifact.relPath === artifactRelPath) as ArtifactRef;
    const dirFsPath = vscode.Uri.parse(folderUri).fsPath;
    const stats = await this.extractSummaries(dirFsPath, [target]);
    entry.artifactStats = { ...entry.artifactStats, ...stats };
    if (stats[artifactRelPath] === undefined) {
      delete entry.artifactStats[artifactRelPath];
    }
    entry.task = { ...entry.task, artifacts };
    this.details.delete(folderUri);
    this.pendingChanges.add(folderUri);
  }

  // --- tier 2 ---------------------------------------------------------------

  /** § 3.1 tier 2, an LRU of 20 built on demand. */
  async getDetail(folderUri: string): Promise<TaskDetail> {
    const task = this.current.tasks.get(folderUri);
    if (task === undefined) {
      throw new Error(`no indexed task at ${folderUri}`);
    }
    const cached = this.details.get(folderUri);
    if (cached !== undefined) {
      this.details.delete(folderUri);
      this.details.set(folderUri, cached);
      return cached;
    }

    const dirFsPath = vscode.Uri.parse(folderUri).fsPath;
    const statePath = path.join(dirFsPath, STATE_FILE_NAME);
    let raw: unknown = null;
    try {
      const size = (await fsp.stat(statePath)).size;
      if (size > MAX_STATE_BYTES) {
        throw new Error(`state file is ${size} bytes, over the ${MAX_STATE_BYTES} byte cap`);
      }
      raw = parseYaml(await fsp.readFile(statePath, 'utf8'), {
        strict: false,
        uniqueKeys: false
      });
    } catch (error) {
      this.options.log(`index: raw state unavailable for ${task.ref.relPath}: ${reason(error)}`);
    }

    const detail: TaskDetail = { task, raw, files: await listFiles(dirFsPath) };
    this.details.set(folderUri, detail);
    if (this.details.size > DETAIL_CACHE_SIZE) {
      const oldest = this.details.keys().next();
      if (!oldest.done) {
        this.details.delete(oldest.value);
      }
    }
    return detail;
  }

  // --- attribution ----------------------------------------------------------

  private scheduleAttribution(): void {
    if (this.options.attributionEnabled?.() === false) {
      return;
    }
    if (![...this.entries.keys()].some((folderUri) => !this.attributed.has(folderUri))) {
      return;
    }
    if (!this.attributionRan) {
      this.attributionRan = true;
      void this.attribute();
      return;
    }
    clearTimeout(this.attributionTimer);
    this.attributionTimer = setTimeout(() => void this.attribute(), ATTRIBUTION_DEBOUNCE_MS);
  }

  private async attribute(): Promise<void> {
    if (this.disposed || this.options.attributionEnabled?.() === false) {
      return;
    }
    const changed: string[] = [];
    for (const folder of this.folders) {
      const authors = await readAuthors(folder.uri.fsPath, this.options.log);
      for (const [folderUri, entry] of this.entries) {
        const stateFsPath = path.join(vscode.Uri.parse(folderUri).fsPath, STATE_FILE_NAME);
        const author = authors.get(stateFsPath) ?? null;
        this.attributed.add(folderUri);
        if (author === null && entry.task.author === null) {
          continue;
        }
        if (author?.email === entry.task.author?.email) {
          continue;
        }
        entry.task = { ...entry.task, author };
        changed.push(folderUri);
      }
    }
    if (changed.length > 0 && !this.disposed) {
      this.publish('fresh', changed);
      this.schedulePersist();
    }
  }

  // --- persistence (§ 3.3) --------------------------------------------------

  private get indexFileUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.options.storageUri, INDEX_FILE_NAME);
  }

  private async readPersisted(): Promise<Map<string, IndexEntry> | null> {
    const fileUri = this.indexFileUri;
    let text: string;
    try {
      text = await fsp.readFile(fileUri.fsPath, 'utf8');
    } catch {
      return null;
    }

    const discard = async (why: string): Promise<null> => {
      this.options.log(`index: discarding the persisted index (${why}); it will be rebuilt from disk`);
      await fsp.rm(fileUri.fsPath, { force: true });
      return null;
    };

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return discard(`corrupt file: ${reason(error)}`);
    }

    const file = parsed as Record<string, unknown>;
    if (typeof file !== 'object' || file === null || typeof file.entries !== 'object' || file.entries === null) {
      return discard('corrupt shape');
    }
    if (file.schemaVersion !== SCHEMA_VERSION || file.registryVersion !== MAISTER_VERSION) {
      return discard(`version mismatch: schema ${String(file.schemaVersion)}, registry ${String(file.registryVersion)}`);
    }

    const roots: string[] = [];
    for (const folder of this.folders) {
      roots.push(folder.uri.fsPath, await realPath(folder.uri.fsPath));
    }

    const entries = new Map<string, IndexEntry>();
    for (const [folderUri, raw] of Object.entries(file.entries as Record<string, unknown>)) {
      const entry = raw as Record<string, unknown>;
      const task = deserializeTask(entry.task);
      const stateStat = entry.stateStat as Stat | undefined;
      if (task === null || stateStat === undefined || typeof stateStat.mtime !== 'number') {
        continue;
      }
      // A1 — an entry outside every open workspace folder is dropped, not carried forward.
      const fsPath = vscode.Uri.parse(folderUri).fsPath;
      const candidates = [fsPath, await realPath(fsPath)];
      if (!roots.some((root) => candidates.some((candidate) => isInside(root, candidate)))) {
        continue;
      }
      entries.set(folderUri, {
        stateStat,
        dataStat: (entry.dataStat as Stat | null) ?? null,
        artifactStats: (entry.artifactStats as Record<string, Stat> | undefined) ?? {},
        task
      });
    }
    return entries;
  }

  private schedulePersist(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persist(false), PERSIST_DEBOUNCE_MS);
  }

  /** Flushed on `deactivate()` so a clean shutdown never loses the index (§ 3.3). */
  async flush(): Promise<void> {
    clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    await this.persist(false);
  }

  private async persist(isRetry: boolean): Promise<void> {
    const fileUri = this.indexFileUri;
    const tempUri = fileUri.with({ path: `${fileUri.path}.tmp` });
    try {
      const entries: Record<string, unknown> = {};
      for (const [folderUri, entry] of this.entries) {
        entries[folderUri] = {
          stateStat: entry.stateStat,
          dataStat: entry.dataStat,
          artifactStats: entry.artifactStats,
          task: serializeTask(entry.task)
        };
      }
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        registryVersion: MAISTER_VERSION,
        entries
      };
      await fsp.mkdir(this.options.storageUri.fsPath, { recursive: true });
      await fsp.writeFile(tempUri.fsPath, JSON.stringify(payload), 'utf8');
      await vscode.workspace.fs.rename(tempUri, fileUri, { overwrite: true });
    } catch (error) {
      this.options.log(`index: persisting failed${isRetry ? ' again' : ''}: ${reason(error)}`);
      await fsp.rm(tempUri.fsPath, { force: true }).catch(() => undefined);
      if (isRetry) {
        this.options.notify?.(INDEX.persistFailed);
        return;
      }
      clearTimeout(this.persistTimer);
      this.persistTimer = setTimeout(() => void this.persist(true), PERSIST_RETRY_MS);
    }
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.persistTimer);
    clearTimeout(this.attributionTimer);
    this.changeEmitter.dispose();
  }
}
