import { NEXT_ACTION_LABELS, WORKFLOW_LABELS } from '../strings.ts';
import type { IconHint, NextAction, TaskStatus, WorkflowType } from './types.ts';

/** The registry is pinned to one Maister release; newer phases render by raw id. */
export const MAISTER_VERSION = '2.2.3' as const;

export interface PhaseDef {
  n: number;
  name: string;
  activeForm: string;
  icon: IconHint;
}

export interface HeroDef {
  match: string;
  label: string;
  verdictFallback?: boolean;
}

export interface WorkflowDef {
  type: WorkflowType;
  /** Directory under .maister/tasks/ — "migrations" for the migration workflow. */
  dirSegment: string;
  label: string;
  maisterVersion: typeof MAISTER_VERSION;
  phases: readonly PhaseDef[];
  heroes: readonly HeroDef[];
}

const IMPLEMENTATION_HEROES: readonly HeroDef[] = [
  { match: 'implementation/spec.md', label: 'Specification' },
  { match: 'implementation/implementation-plan.md', label: 'Implementation Plan' },
  { match: 'verification/implementation-verification.md', label: 'Verification', verdictFallback: true }
];

/** Transcribed from Maister 2.2.3 `assets/dashboard.html` (HERO_MAP, lines 249–276). */
export const HERO_MAP: Readonly<Record<Exclude<WorkflowType, 'unknown'>, readonly HeroDef[]>> = {
  development: IMPLEMENTATION_HEROES,
  performance: IMPLEMENTATION_HEROES,
  migration: IMPLEMENTATION_HEROES,
  research: [
    { match: 'outputs/research-report.md', label: 'Research Report' },
    { match: 'outputs/solution-exploration.md', label: 'Solution Exploration' },
    { match: 'outputs/high-level-design.md', label: 'High-Level Design' },
    { match: 'outputs/decision-log.md', label: 'Decision Log' }
  ],
  'product-design': [
    { match: 'outputs/product-brief.md', label: 'Product Brief' },
    { match: 'analysis/feature-spec.md', label: 'Feature Spec' },
    { match: 'analysis/design-decisions.md', label: 'Design Decisions' }
  ]
};

const DEVELOPMENT_PHASES: readonly PhaseDef[] = [
  { n: 1, name: 'Analyze codebase & clarify requirements', activeForm: 'Analyzing codebase & clarifying', icon: 'analysis' },
  { n: 2, name: 'Analyze gaps & clarify scope', activeForm: 'Analyzing gaps & clarifying scope', icon: 'analysis' },
  { n: 3, name: 'Write failing test (TDD Red)', activeForm: 'Writing failing test', icon: 'code' },
  { n: 4, name: 'Generate UI mockups', activeForm: 'Generating UI mockups', icon: 'spec' },
  { n: 5, name: 'Gather requirements & create specification', activeForm: 'Gathering requirements & creating specification', icon: 'spec' },
  { n: 6, name: 'Audit specification', activeForm: 'Auditing specification', icon: 'verify' },
  { n: 7, name: 'Plan implementation', activeForm: 'Planning implementation', icon: 'plan' },
  { n: 8, name: 'Execute implementation', activeForm: 'Executing implementation', icon: 'code' },
  { n: 9, name: 'Verify test passes (TDD Green)', activeForm: 'Verifying test passes', icon: 'verify' },
  { n: 10, name: 'Prompt verification options', activeForm: 'Prompting verification options', icon: 'verify' },
  { n: 11, name: 'Verify implementation & resolve issues', activeForm: 'Verifying implementation', icon: 'verify' },
  { n: 12, name: 'Run E2E tests', activeForm: 'Running E2E tests', icon: 'verify' },
  { n: 13, name: 'Generate user documentation', activeForm: 'Generating user documentation', icon: 'docs' },
  { n: 14, name: 'Finalize workflow', activeForm: 'Finalizing workflow', icon: 'done' }
];

const PRODUCT_DESIGN_PHASES: readonly PhaseDef[] = [
  { n: 0, name: 'Initialize, gather context & detect characteristics', activeForm: 'Gathering context & detecting characteristics', icon: 'analysis' },
  { n: 1, name: 'Synthesize all context sources', activeForm: 'Synthesizing context', icon: 'analysis' },
  { n: 2, name: 'Explore problem space', activeForm: 'Exploring problem space', icon: 'analysis' },
  { n: 3, name: 'Explore users & personas', activeForm: 'Exploring users & personas', icon: 'analysis' },
  { n: 4, name: 'Generate design alternatives', activeForm: 'Generating design alternatives', icon: 'plan' },
  { n: 5, name: 'Converge on design direction', activeForm: 'Converging on direction', icon: 'plan' },
  { n: 6, name: 'Specify features section-by-section', activeForm: 'Specifying features', icon: 'spec' },
  { n: 7, name: 'Create visual prototypes', activeForm: 'Creating visual prototypes', icon: 'code' },
  { n: 8, name: 'Review & hand off product brief', activeForm: 'Reviewing & assembling brief', icon: 'done' }
];

const RESEARCH_PHASES: readonly PhaseDef[] = [
  { n: 1, name: 'Research foundation (init, plan, gather, synthesize)', activeForm: 'Executing research foundation', icon: 'analysis' },
  { n: 2, name: 'Evaluate brainstorming value', activeForm: 'Evaluating brainstorming value', icon: 'plan' },
  { n: 3, name: 'Generate solution alternatives', activeForm: 'Generating solution alternatives', icon: 'spec' },
  { n: 4, name: 'Evaluate brainstorming alternatives', activeForm: 'Evaluating brainstorming alternatives', icon: 'plan' },
  { n: 5, name: 'Design high-level architecture', activeForm: 'Designing high-level architecture', icon: 'spec' },
  { n: 6, name: 'Summarize research and suggest next steps', activeForm: 'Completing research', icon: 'done' }
];

const MIGRATION_PHASES: readonly PhaseDef[] = [
  { n: 1, name: 'Analyze current state', activeForm: 'Analyzing current state', icon: 'analysis' },
  { n: 2, name: 'Plan target state and gaps', activeForm: 'Planning target state and gaps', icon: 'analysis' },
  { n: 3, name: 'Gather requirements & create migration strategy', activeForm: 'Gathering requirements & creating migration strategy', icon: 'spec' },
  { n: 4, name: 'Plan implementation', activeForm: 'Planning implementation', icon: 'plan' },
  { n: 5, name: 'Execute migration', activeForm: 'Executing migration', icon: 'code' },
  { n: 6, name: 'Verify and test compatibility', activeForm: 'Verifying and testing compatibility', icon: 'verify' },
  { n: 7, name: 'Resolve verification issues', activeForm: 'Resolving verification issues', icon: 'verify' },
  { n: 8, name: 'Generate documentation', activeForm: 'Generating documentation', icon: 'docs' }
];

const PERFORMANCE_PHASES: readonly PhaseDef[] = [
  { n: 1, name: 'Analyze codebase', activeForm: 'Analyzing codebase', icon: 'analysis' },
  { n: 2, name: 'Analyze performance bottlenecks', activeForm: 'Analyzing performance bottlenecks', icon: 'analysis' },
  { n: 3, name: 'Gather requirements & create specification', activeForm: 'Gathering requirements & creating specification', icon: 'spec' },
  { n: 4, name: 'Audit specification', activeForm: 'Auditing specification', icon: 'verify' },
  { n: 5, name: 'Plan implementation', activeForm: 'Planning implementation', icon: 'plan' },
  { n: 6, name: 'Execute implementation', activeForm: 'Executing implementation', icon: 'code' },
  { n: 7, name: 'Prompt verification options', activeForm: 'Prompting verification options', icon: 'verify' },
  { n: 8, name: 'Verify implementation & resolve issues', activeForm: 'Verifying implementation', icon: 'verify' },
  { n: 9, name: 'Finalize workflow', activeForm: 'Finalizing workflow', icon: 'done' }
];

export const WORKFLOWS: readonly WorkflowDef[] = [
  {
    type: 'development',
    dirSegment: 'development',
    label: WORKFLOW_LABELS.development,
    maisterVersion: MAISTER_VERSION,
    phases: DEVELOPMENT_PHASES,
    heroes: HERO_MAP.development
  },
  {
    type: 'product-design',
    dirSegment: 'product-design',
    label: WORKFLOW_LABELS['product-design'],
    maisterVersion: MAISTER_VERSION,
    phases: PRODUCT_DESIGN_PHASES,
    heroes: HERO_MAP['product-design']
  },
  {
    type: 'research',
    dirSegment: 'research',
    label: WORKFLOW_LABELS.research,
    maisterVersion: MAISTER_VERSION,
    phases: RESEARCH_PHASES,
    heroes: HERO_MAP.research
  },
  {
    type: 'migration',
    dirSegment: 'migrations',
    label: WORKFLOW_LABELS.migration,
    maisterVersion: MAISTER_VERSION,
    phases: MIGRATION_PHASES,
    heroes: HERO_MAP.migration
  },
  {
    type: 'performance',
    dirSegment: 'performance',
    label: WORKFLOW_LABELS.performance,
    maisterVersion: MAISTER_VERSION,
    phases: PERFORMANCE_PHASES,
    heroes: HERO_MAP.performance
  }
];

export function workflowForDirSegment(dirSegment: string): WorkflowDef | null {
  return WORKFLOWS.find((w) => w.dirSegment === dirSegment) ?? null;
}

export function workflowForType(type: WorkflowType): WorkflowDef | null {
  return WORKFLOWS.find((w) => w.type === type) ?? null;
}

export function isHeroArtifact(type: WorkflowType, relPath: string): boolean {
  return workflowForType(type)?.heroes.some((hero) => hero.match === relPath) ?? false;
}

/** The product brief § 7.2 requires before a completed design can hand over to development. */
export const PRODUCT_BRIEF_REL_PATH = 'outputs/product-brief.md';

const UNFINISHED: readonly TaskStatus[] = ['in_progress', 'pending', 'blocked', 'failed'];

/**
 * § 7.2 — the one step Maister itself would take next, computed at index time for every task
 * of every workflow type. `hasProductBrief` is the index's stat of `PRODUCT_BRIEF_REL_PATH`.
 */
export function deriveNextAction(
  type: WorkflowType,
  status: TaskStatus,
  hasProductBrief: boolean
): NextAction {
  if (UNFINISHED.includes(status)) {
    return { id: 'resume', label: NEXT_ACTION_LABELS.resume };
  }
  if (status === 'completed' && type === 'product-design' && hasProductBrief) {
    return { id: 'startDevelopment', label: NEXT_ACTION_LABELS.startDevelopment };
  }
  if (status === 'completed' && type === 'research') {
    return { id: 'fromResearch', label: NEXT_ACTION_LABELS.fromResearch };
  }
  // Completed development, migration and performance tasks, a completed design with no brief,
  // and anything whose status could not be read, have no next step to offer.
  return { id: 'none', label: NEXT_ACTION_LABELS.none };
}
