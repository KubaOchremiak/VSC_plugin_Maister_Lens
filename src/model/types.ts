/** Domain types per feature-spec § 2.1, with the amendments noted inline. */

export type WorkflowType =
  | 'development'
  | 'product-design'
  | 'research'
  | 'migration'
  | 'performance'
  | 'unknown';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked' | 'unknown';

export type PhaseStatus = 'completed' | 'current' | 'not_recorded' | 'upcoming';

export type Verdict = 'passed' | 'passed_with_issues' | 'failed' | null;

export type IconHint = 'analysis' | 'spec' | 'plan' | 'code' | 'verify' | 'docs' | 'done';

export interface TaskRef {
  /** Absolute URI of the task directory — the task's identity (A1). */
  folderUri: string;
  /** Workspace-folder-relative path, for display and command composition only (A1). */
  relPath: string;
  /** Raw directory segment under .maister/tasks/, e.g. "migrations". */
  dirSegment: string;
  folderName: string;
}

export interface Decision {
  text: string;
  rationale: string | null;
  /** phase_summaries key, or the artifact relPath when it came from a § 7 block. */
  source: string;
}

export interface Risk {
  text: string;
  resolved: boolean;
  source: string;
}

export interface ArtifactRef {
  /** Relative to the task root, e.g. "implementation/spec.md". */
  relPath: string;
  label: string;
  htmlRelPath: string | null;
  isHero: boolean;
  /** phase_summaries key the registration came from. Required to attribute A14's per-entry counts. */
  source: string;
  /** § 7 block, populated by the index at tier 2 (§ 3.1). */
  summary: SummaryBlock | null;
}

export interface SummaryBlock {
  tldr: string | null;
  decisions: Decision[];
  risks: Risk[];
}

export interface PhaseView {
  /** Canonical "phase-N", or the raw recorded id when it is outside the registry. */
  id: string;
  name: string;
  activeForm: string | null;
  icon: IconHint;
  status: PhaseStatus;
}

export interface Author {
  name: string;
  email: string;
  addedAt: Date;
  isMe: boolean;
}

export interface ParseIssue {
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

export type NextActionId = 'resume' | 'startDevelopment' | 'fromResearch' | 'none';

export interface NextAction {
  id: NextActionId;
  label: string;
}

/** Orchestrator options after the N7 merge; scalars only, as Maister writes them. */
export type TaskOptions = Record<string, boolean | string | number | null>;

export interface Task {
  ref: TaskRef;
  type: WorkflowType;
  title: string;
  description: string | null;
  status: TaskStatus;
  tags: string[];
  priority: 'high' | 'medium' | 'low' | null;
  created: Date | null;
  updated: Date | null;
  phases: PhaseView[];
  currentPhaseId: string | null;
  verdict: Verdict;
  characteristics: Record<string, boolean | string>;
  /** N7's merged result; without a home the merge would be silently discarded. */
  options: TaskOptions;
  decisions: Decision[];
  risks: Risk[];
  /** `verification_context.e2e_followup`: a string is one item, a list one item per string. */
  e2eFollowUp: string[];
  artifacts: ArtifactRef[];
  hasDashboard: boolean;
  hasDashboardData: boolean;
  stateMtime: number;
  activityMtime: number;
  /** Populated by the index (§ 3.8). */
  author: Author | null;
  /** Computed at index time per § 7.2; the parser leaves it at 'none'. */
  nextAction: NextAction;
  parseIssues: ParseIssue[];
}

/** Everything the parser needs; it performs no file system access of its own. */
export interface StateInput {
  text: string;
  ref: TaskRef;
  stateMtime: number;
  activityMtime: number;
  hasDashboard: boolean;
  hasDashboardData: boolean;
}
