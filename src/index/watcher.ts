import * as path from 'node:path';
import * as vscode from 'vscode';
import { INDEX } from '../strings.ts';
import type { IndexLog, TaskIndex } from './taskIndex.ts';

const TASKS_GLOB = '.maister/tasks/**';
const TASKS_ROOT = '.maister/tasks';
const STATE_FILE_NAME = 'orchestrator-state.yml';
const DASHBOARD_DATA_FILE_NAME = 'dashboard-data.js';

/** § 3.5 — absorb Maister's full-file rewrites before re-parsing. */
const TASK_DEBOUNCE_MS = 250;
/** A burst of writes yields one UI update. */
const PUBLISH_THROTTLE_MS = 500;
/** Relative labels age without any file I/O. */
const RELATIVE_TIME_REFRESH_MS = 60_000;

const WATCHER_EXCLUDE_NOTICE_KEY = 'maisterLens.watcherExcludeNoticeShown';

type Kind = 'create' | 'change' | 'delete';

interface Routed {
  folderUri: string;
  /** Empty for the task directory itself. */
  taskRelPath: string;
}

function route(folder: vscode.WorkspaceFolder, uri: vscode.Uri): Routed | null {
  const relative = path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
  if (relative.startsWith('..')) {
    return null;
  }
  const segments = relative.split('/');
  if (segments.slice(0, 2).join('/') !== TASKS_ROOT || segments.length < 4) {
    return null;
  }
  const dirFsPath = path.join(folder.uri.fsPath, ...segments.slice(0, 4));
  return {
    folderUri: vscode.Uri.file(dirFsPath).toString(),
    taskRelPath: segments.slice(4).join('/')
  };
}

class TaskWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly taskTimers = new Map<string, NodeJS.Timeout>();
  private publishTimer: NodeJS.Timeout | undefined;
  private lastPublishedAt = 0;

  constructor(
    private readonly index: TaskIndex,
    private readonly log: IndexLog,
    folders: readonly vscode.WorkspaceFolder[]
  ) {
    for (const folder of folders) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, TASKS_GLOB)
      );
      this.disposables.push(
        watcher,
        watcher.onDidCreate((uri) => this.handle(folder, uri, 'create')),
        watcher.onDidChange((uri) => this.handle(folder, uri, 'change')),
        watcher.onDidDelete((uri) => this.handle(folder, uri, 'delete'))
      );
    }

    const ticker = setInterval(() => this.index.republish(), RELATIVE_TIME_REFRESH_MS);
    this.disposables.push(new vscode.Disposable(() => clearInterval(ticker)));
  }

  private handle(folder: vscode.WorkspaceFolder, uri: vscode.Uri, kind: Kind): void {
    const routed = route(folder, uri);
    if (routed === null) {
      return;
    }
    const { folderUri, taskRelPath } = routed;

    if (taskRelPath === '') {
      if (kind === 'delete') {
        this.index.evictTask(folderUri);
        this.schedulePublish();
      }
      return;
    }

    if (taskRelPath === STATE_FILE_NAME) {
      if (kind === 'delete') {
        this.index.evictTask(folderUri);
        this.schedulePublish();
        return;
      }
      this.debounceTask(folderUri);
      return;
    }

    if (taskRelPath === DASHBOARD_DATA_FILE_NAME) {
      void this.run(() => this.index.touchActivity(folderUri));
      return;
    }

    if (/\.(md|html?)$/i.test(taskRelPath)) {
      void this.run(() => this.index.reindexArtifact(folderUri, taskRelPath));
    }
  }

  private debounceTask(folderUri: string): void {
    clearTimeout(this.taskTimers.get(folderUri));
    this.taskTimers.set(
      folderUri,
      setTimeout(() => {
        this.taskTimers.delete(folderUri);
        void this.run(() => this.index.reindexTask(folderUri));
      }, TASK_DEBOUNCE_MS)
    );
  }

  private async run(work: () => Promise<void>): Promise<void> {
    try {
      await work();
      this.schedulePublish();
    } catch (error) {
      this.log(`watcher: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private schedulePublish(): void {
    if (this.publishTimer !== undefined) {
      return;
    }
    const wait = Math.max(0, PUBLISH_THROTTLE_MS - (Date.now() - this.lastPublishedAt));
    this.publishTimer = setTimeout(() => {
      this.publishTimer = undefined;
      this.lastPublishedAt = Date.now();
      this.index.publishPending();
    }, wait);
  }

  dispose(): void {
    for (const timer of this.taskTimers.values()) {
      clearTimeout(timer);
    }
    this.taskTimers.clear();
    clearTimeout(this.publishTimer);
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}

/**
 * § 3.5 — live updates stop entirely when the user's `files.watcherExclude` covers `.maister`,
 * so the one case the user can act on gets the one notification.
 */
async function warnIfWatcherExcluded(context: vscode.ExtensionContext, log: IndexLog): Promise<void> {
  const exclude = vscode.workspace.getConfiguration('files').get<Record<string, boolean>>('watcherExclude') ?? {};
  const excluded = Object.entries(exclude).some(([pattern, enabled]) => enabled && pattern.includes('.maister'));
  if (!excluded) {
    return;
  }
  log('watcher: files.watcherExclude covers .maister, so edits are not observed live');
  if (context.globalState.get<boolean>(WATCHER_EXCLUDE_NOTICE_KEY) === true) {
    return;
  }
  await context.globalState.update(WATCHER_EXCLUDE_NOTICE_KEY, true);
  const choice = await vscode.window.showWarningMessage(
    INDEX.watcherExcluded,
    INDEX.openSettings,
    INDEX.dismiss
  );
  if (choice === INDEX.openSettings) {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'files.watcherExclude');
  }
}

export function createTaskWatcher(
  context: vscode.ExtensionContext,
  index: TaskIndex,
  log: IndexLog,
  folders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders ?? []
): vscode.Disposable {
  void warnIfWatcherExcluded(context, log);
  return new TaskWatcher(index, log, folders);
}
