import * as vscode from 'vscode';
import type { TaskIndex } from '../index/taskIndex.ts';
import { openRiskCount } from '../model/risks.ts';
import type { ArtifactRef, IconHint, Task, TaskStatus } from '../model/types.ts';
import { NOW, STATUS_LABELS, WORKFLOW_LABELS, format } from '../strings.ts';
import { formatActivity, formatAge, formatSpokenActivity } from './relativeTime.ts';

export const NOW_VIEW_ID = 'maister.now';

/** § 4.1 — membership is every unfinished task, with no time cutoff. */
const UNFINISHED: readonly TaskStatus[] = ['in_progress', 'pending', 'blocked'];

const RECENT_ARTIFACT_LIMIT = 5;
const DECISION_MAX_CHARS = 80;

const PHASE_ICONS: Readonly<Record<IconHint, string>> = {
  analysis: 'search',
  spec: 'file-text',
  plan: 'list-ordered',
  code: 'code',
  verify: 'shield',
  docs: 'book',
  done: 'flag'
};

export type NowNodeKind = 'task' | 'progress' | 'decision' | 'artifacts' | 'artifact' | 'risks';

/**
 * A tree node doubles as the argument the `view/item/context` commands receive, so its
 * fields are exactly the A1/A2 payload keys those commands validate.
 */
export interface NowNode {
  readonly kind: NowNodeKind;
  readonly folderUri: string;
  readonly artifactRelPath?: string;
  readonly variant?: 'md' | 'html';
  readonly label: string;
  readonly description?: string;
  readonly tooltip?: string;
}

function unfinishedTasks(index: TaskIndex): Task[] {
  return [...index.snapshot.tasks.values()]
    .filter((task) => UNFINISHED.includes(task.status))
    .sort((left, right) => right.activityMtime - left.activityMtime);
}

function phaseSummary(task: Task): { current: number; total: number; name: string } | null {
  if (task.currentPhaseId === null) {
    return null;
  }
  const at = task.phases.findIndex((phase) => phase.id === task.currentPhaseId);
  if (at < 0) {
    return null;
  }
  return { current: at + 1, total: task.phases.length, name: task.phases[at].name };
}

function currentActiveForm(task: Task): string | null {
  const phase = task.phases.find((candidate) => candidate.id === task.currentPhaseId);
  return phase?.activeForm ?? phase?.name ?? null;
}

function truncate(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

function variantOf(relPath: string): 'md' | 'html' {
  return relPath.toLowerCase().endsWith('.html') ? 'html' : 'md';
}

function extensionOf(relPath: string): string {
  const dot = relPath.lastIndexOf('.');
  return dot < 0 ? 'other' : relPath.slice(dot + 1).toLowerCase();
}

export function taskDescription(task: Task, now: number = Date.now()): string {
  return format(NOW.taskDescription, {
    type: WORKFLOW_LABELS[task.type],
    phase: currentActiveForm(task) ?? STATUS_LABELS[task.status],
    activity: formatActivity(task.activityMtime, now)
  });
}

/** § 4.3 — a complete spoken sentence naming type, phase, activity and next action. */
export function taskAccessibleLabel(task: Task, now: number = Date.now()): string {
  const phase = phaseSummary(task);
  const activeForm = currentActiveForm(task);
  return format(NOW.accessibleTask, {
    title: task.title,
    type: WORKFLOW_LABELS[task.type],
    progress:
      phase === null || activeForm === null
        ? NOW.accessibleProgressNoPhase
        : format(NOW.accessibleProgressPhase, {
            current: phase.current,
            total: phase.total,
            activeForm
          }),
    activity: formatSpokenActivity(task.activityMtime, now),
    action: task.nextAction.label
  });
}

export function taskContextValue(task: Task): string {
  // Pinned by the manifest's view/item/context regexes: task.<type>.<status>.next-<id>.
  return `task.${task.type}.${task.status}.next-${task.nextAction.id}`;
}

export class NowTreeProvider implements vscode.TreeDataProvider<NowNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<NowNode | undefined>();
  private readonly subscription: vscode.Disposable;
  /** mtimes learned from the index's tier-2 detail while a task was expanded. */
  private readonly artifactMtimes = new Map<string, Map<string, number>>();

  readonly onDidChangeTreeData: vscode.Event<NowNode | undefined> = this.emitter.event;

  constructor(private readonly index: TaskIndex) {
    this.subscription = this.index.onDidChange(() => this.emitter.fire(undefined));
  }

  getTreeItem(node: NowNode): vscode.TreeItem {
    switch (node.kind) {
      case 'task':
        return this.taskItem(node);
      case 'artifacts':
        return this.groupItem(node);
      case 'artifact':
        return this.artifactItem(node);
      case 'risks':
        return this.risksItem(node);
      default:
        return this.plainItem(node);
    }
  }

  async getChildren(node?: NowNode): Promise<NowNode[]> {
    const now = Date.now();
    if (node === undefined) {
      return unfinishedTasks(this.index).map((task) => ({
        kind: 'task' as const,
        folderUri: task.ref.folderUri,
        label: task.title,
        description: taskDescription(task, now)
      }));
    }

    const task = this.index.snapshot.tasks.get(node.folderUri);
    if (task === undefined) {
      return [];
    }
    if (node.kind === 'artifacts') {
      return this.artifactNodes(task, now);
    }
    if (node.kind !== 'task') {
      return [];
    }
    return this.taskChildren(task);
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }

  /** § 4.1's child order: Progress, Last recorded decision, Recent artifacts (A9), Open risks. */
  private async taskChildren(task: Task): Promise<NowNode[]> {
    const children: NowNode[] = [this.progressNode(task)];

    const decision = task.decisions.at(-1);
    if (decision !== undefined) {
      children.push({
        kind: 'decision',
        folderUri: task.ref.folderUri,
        label: format(NOW.lastDecision, { text: truncate(decision.text, DECISION_MAX_CHARS) }),
        tooltip:
          decision.rationale === null ? decision.text : `${decision.text}\n\n${decision.rationale}`
      });
    }

    if ((await this.recentArtifacts(task)).length > 0) {
      children.push({
        kind: 'artifacts',
        folderUri: task.ref.folderUri,
        label: NOW.recentArtifacts
      });
    }

    const risks = openRiskCount(task);
    if (risks > 0) {
      children.push({
        kind: 'risks',
        folderUri: task.ref.folderUri,
        label: risks === 1 ? NOW.openRisksOne : format(NOW.openRisks, { count: risks })
      });
    }
    return children;
  }

  private progressNode(task: Task): NowNode {
    const phase = phaseSummary(task);
    const completed = task.phases.filter((candidate) => candidate.status === 'completed').length;
    const notRecorded = task.phases.filter((candidate) => candidate.status === 'not_recorded').length;
    return {
      kind: 'progress',
      folderUri: task.ref.folderUri,
      label:
        phase === null
          ? NOW.progressNoPhase
          : format(NOW.progress, { current: phase.current, total: phase.total, name: phase.name }),
      description:
        notRecorded > 0
          ? format(NOW.progressCompletedAndNotRecorded, { completed, notRecorded })
          : format(NOW.progressCompleted, { completed })
    };
  }

  private async artifactNodes(task: Task, now: number): Promise<NowNode[]> {
    const recent = await this.recentArtifacts(task);
    return recent.map(({ artifact, mtime }) => ({
      kind: 'artifact' as const,
      folderUri: task.ref.folderUri,
      artifactRelPath: artifact.relPath,
      variant: variantOf(artifact.relPath),
      label: artifact.label,
      description: formatAge(mtime, now),
      tooltip: artifact.relPath
    }));
  }

  /**
   * A9 — up to five registered artifacts by mtime descending. The mtimes come from the
   * index's tier-2 detail (§ 3.6); the view itself never touches the file system.
   */
  private async recentArtifacts(task: Task): Promise<{ artifact: ArtifactRef; mtime: number }[]> {
    const mtimes = await this.mtimesFor(task.ref.folderUri);
    return task.artifacts
      .map((artifact) => ({ artifact, mtime: mtimes.get(artifact.relPath) ?? -1 }))
      .filter((entry) => entry.mtime >= 0)
      .sort((left, right) => right.mtime - left.mtime)
      .slice(0, RECENT_ARTIFACT_LIMIT);
  }

  private async mtimesFor(folderUri: string): Promise<Map<string, number>> {
    try {
      const detail = await this.index.getDetail(folderUri);
      const mtimes = new Map(detail.files.map((file) => [file.relPath, file.mtime]));
      this.artifactMtimes.set(folderUri, mtimes);
      return mtimes;
    } catch {
      // Graceful degradation: a task that vanished between publish and expansion simply
      // contributes no artifact children.
      return this.artifactMtimes.get(folderUri) ?? new Map();
    }
  }

  private taskItem(node: NowNode): vscode.TreeItem {
    const task = this.index.snapshot.tasks.get(node.folderUri);
    const item = new vscode.TreeItem(node.label, this.collapsibleStateFor(node.folderUri));
    item.id = `now:${node.folderUri}`;
    item.description = node.description;
    if (task === undefined) {
      return item;
    }
    const phase = task.phases.find((candidate) => candidate.id === task.currentPhaseId);
    item.iconPath = new vscode.ThemeIcon(
      phase === undefined ? 'circle-outline' : PHASE_ICONS[phase.icon]
    );
    item.contextValue = taskContextValue(task);
    item.tooltip = this.taskTooltip(task);
    item.accessibilityInformation = { label: taskAccessibleLabel(task) };
    item.command = {
      command: 'maister.openTask',
      title: WORKFLOW_LABELS[task.type],
      arguments: [{ folderUri: task.ref.folderUri }]
    };
    return item;
  }

  private collapsibleStateFor(folderUri: string): vscode.TreeItemCollapsibleState {
    const first = unfinishedTasks(this.index)[0];
    return first?.ref.folderUri === folderUri
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed;
  }

  private taskTooltip(task: Task): vscode.MarkdownString {
    const phase = phaseSummary(task);
    const lines = [`**${task.title}**`, '', WORKFLOW_LABELS[task.type]];
    if (phase !== null) {
      lines.push(
        format(NOW.tooltipPhase, { current: phase.current, total: phase.total, name: phase.name })
      );
    }
    lines.push(
      format(NOW.tooltipLastWrite, { when: new Date(task.activityMtime).toLocaleString() })
    );
    const tldr = this.freshestTldr(task);
    if (tldr !== null) {
      lines.push('', tldr);
    }
    if (task.nextAction.id !== 'none') {
      lines.push('', format(NOW.tooltipNextAction, { action: task.nextAction.label }));
    }
    const tooltip = new vscode.MarkdownString(lines.join('\n\n'));
    tooltip.supportThemeIcons = true;
    return tooltip;
  }

  private freshestTldr(task: Task): string | null {
    const mtimes = this.artifactMtimes.get(task.ref.folderUri);
    const withTldr = task.artifacts.filter((artifact) => artifact.summary?.tldr !== null && artifact.summary?.tldr !== undefined);
    if (withTldr.length === 0) {
      return null;
    }
    const freshest = [...withTldr].sort(
      (left, right) => (mtimes?.get(right.relPath) ?? 0) - (mtimes?.get(left.relPath) ?? 0)
    )[0];
    return freshest.summary?.tldr ?? null;
  }

  private groupItem(node: NowNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
    item.id = `now:${node.folderUri}#artifacts`;
    item.iconPath = new vscode.ThemeIcon('files');
    item.accessibilityInformation = { label: node.label };
    return item;
  }

  private artifactItem(node: NowNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.id = `now:${node.folderUri}#artifact:${node.artifactRelPath ?? ''}`;
    item.description = node.description;
    item.tooltip = node.tooltip;
    item.iconPath = new vscode.ThemeIcon('file');
    item.contextValue = `artifact.${extensionOf(node.artifactRelPath ?? '')}`;
    item.accessibilityInformation = { label: `${node.label}. ${node.description ?? ''}`.trim() };
    item.command = {
      command: 'maister.openArtifact',
      title: node.label,
      arguments: [
        {
          folderUri: node.folderUri,
          artifactRelPath: node.artifactRelPath,
          variant: node.variant ?? 'md'
        }
      ]
    };
    return item;
  }

  private risksItem(node: NowNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.id = `now:${node.folderUri}#risks`;
    item.iconPath = new vscode.ThemeIcon('warning');
    item.accessibilityInformation = { label: node.label };
    item.command = {
      command: 'maister.openRisks',
      title: node.label,
      arguments: [{ folderUri: node.folderUri }]
    };
    return item;
  }

  private plainItem(node: NowNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.id = `now:${node.folderUri}#${node.kind}`;
    item.description = node.description;
    item.tooltip = node.tooltip;
    item.iconPath = new vscode.ThemeIcon(node.kind === 'decision' ? 'lightbulb' : 'list-tree');
    item.accessibilityInformation = {
      label: [node.label, node.description].filter((part) => part !== undefined).join('. ')
    };
    item.command = {
      command: 'maister.openTask',
      title: node.label,
      arguments: [{ folderUri: node.folderUri }]
    };
    return item;
  }
}

/** § 4.1's factual badge: the unfinished count, or nothing at zero. */
export function nowBadge(index: TaskIndex): vscode.ViewBadge | undefined {
  const count = unfinishedTasks(index).length;
  if (count === 0) {
    return undefined;
  }
  return {
    value: count,
    tooltip: count === 1 ? NOW.badgeTooltipOne : format(NOW.badgeTooltip, { count })
  };
}

/** The unfinished tasks the view lists, in view order (§ 4.1). */
export function nowMembership(index: TaskIndex): Task[] {
  return unfinishedTasks(index);
}

/** Creates the view, keeps its badge in step with the index, and returns both for disposal. */
export function registerNowTree(
  index: TaskIndex
): { provider: NowTreeProvider; view: vscode.TreeView<NowNode>; dispose(): void } {
  const provider = new NowTreeProvider(index);
  const view = vscode.window.createTreeView<NowNode>(NOW_VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: true
  });

  const applyBadge = (): void => {
    view.badge = nowBadge(index);
  };
  applyBadge();
  const subscription = index.onDidChange(applyBadge);

  return {
    provider,
    view,
    dispose: () => {
      subscription.dispose();
      view.dispose();
      provider.dispose();
    }
  };
}
