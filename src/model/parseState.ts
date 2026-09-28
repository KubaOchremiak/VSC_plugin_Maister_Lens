import { parseDocument } from 'yaml';
import { NEXT_ACTION_LABELS, PARSE, format } from '../strings.ts';
import { containedRelPath } from './relPath.ts';
import type {
  ArtifactRef,
  Decision,
  IconHint,
  ParseIssue,
  PhaseStatus,
  PhaseView,
  Risk,
  StateInput,
  Task,
  TaskOptions,
  TaskRef,
  TaskStatus,
  Verdict,
  WorkflowType
} from './types.ts';
import { MAISTER_VERSION, isHeroArtifact, workflowForDirSegment, workflowForType } from './workflows.ts';

const TASK_STATUSES: readonly TaskStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'blocked',
  'unknown'
];
const UNFINISHED_STATUSES: readonly TaskStatus[] = ['in_progress', 'pending', 'blocked'];
const PRIORITIES = ['high', 'medium', 'low'] as const;
const VERDICTS = ['passed', 'passed_with_issues', 'failed'] as const;
const CONTEXT_KEYS = [
  'task_context',
  'design_context',
  'research_context',
  'migration_context',
  'performance_context'
] as const;

/** Icon for a phase Maister recorded but the pinned registry does not define. */
const UNMAPPED_PHASE_ICON: IconHint = 'analysis';

type Dict = Record<string, unknown>;

class Issues {
  private readonly items: ParseIssue[] = [];

  error(field: string, message: string): void {
    this.items.push({ severity: 'error', field, message });
  }

  warn(field: string, message: string): void {
    this.items.push({ severity: 'warning', field, message });
  }

  all(): ParseIssue[] {
    return this.items;
  }
}

function asDict(value: unknown): Dict | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Dict) : null;
}

function asList(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** N2: folder name with a leading YYYY-MM-DD- removed, hyphens spaced, first letter capitalized. */
function titleFromFolder(folderName: string): string {
  const words = folderName.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-+/g, ' ').trim();
  if (words === '') {
    return folderName;
  }
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** N6: canonicalize a recorded phase id. Returns null when no phase number is recognizable. */
function canonicalPhaseId(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    return `phase-${raw}`;
  }
  const text = typeof raw === 'string' ? raw.trim() : null;
  if (text === null) {
    return null;
  }
  const match = /^(?:phase[\s_-]*)?(\d+)\b/i.exec(text);
  return match ? `phase-${Number(match[1])}` : null;
}

function phaseNumber(id: string): number | null {
  const match = /^phase-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

/** N5: ISO 8601; date-only is accepted at midnight UTC and reported. */
function parseTimestamp(value: unknown, field: string, issues: Issues): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const text = typeof value === 'string' ? value.trim() : String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const dateOnly = new Date(`${text}T00:00:00Z`);
    if (!Number.isNaN(dateOnly.getTime())) {
      issues.warn(field, format(PARSE.dateOnly, { value: text }));
      return dateOnly;
    }
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    issues.warn(field, format(PARSE.unparsableDate, { value: text }));
    return null;
  }
  return parsed;
}

/** N12 containment: a task-root-relative path that never escapes the task folder. */
function containedArtifactPath(raw: unknown): string | null {
  const text = asText(raw);
  return text === null ? null : containedRelPath(text.replace(/\\/g, '/'));
}

/** N11: `resolved:` prefix or a `(resolved` marker anywhere in the text. */
export function readRisk(raw: unknown, source: string): Risk | null {
  const text = asText(raw);
  if (text === null) {
    return null;
  }
  const prefixed = /^resolved\s*:\s*/i.exec(text);
  if (prefixed) {
    const stripped = text.slice(prefixed[0].length).trim();
    return stripped === '' ? null : { text: stripped, resolved: true, source };
  }
  return { text, resolved: /\(resolved/i.test(text), source };
}

function readDecision(raw: unknown, source: string): Decision | null {
  const text = asText(raw);
  if (text !== null) {
    return { text, rationale: null, source };
  }
  const item = asDict(raw);
  const decisionText = item ? asText(item.decision) : null;
  if (item === null || decisionText === null) {
    return null;
  }
  return { text: decisionText, rationale: asText(item.rationale), source };
}

function readArtifact(raw: unknown, source: string, type: WorkflowType): ArtifactRef | null {
  const item = asDict(raw);
  if (item === null) {
    return null;
  }
  const relPath = containedArtifactPath(item.path);
  if (relPath === null) {
    return null;
  }
  return {
    relPath,
    label: asText(item.label) ?? (relPath.split('/').pop() as string),
    htmlRelPath: containedArtifactPath(item.html),
    isHero: isHeroArtifact(type, relPath),
    source,
    summary: null
  };
}

interface Collected {
  decisions: Decision[];
  risks: Risk[];
  artifacts: ArtifactRef[];
}

/** A14's per-item classification for a list-shaped `phase_summaries` entry, first match wins. */
function collectFromList(
  items: readonly unknown[],
  key: string,
  type: WorkflowType,
  into: Collected,
  issues: Issues
): void {
  items.forEach((item, index) => {
    const field = `phase_summaries.${key}[${index}]`;
    const record = asDict(item);
    if (record !== null && 'decision' in record) {
      const decision = readDecision(record, key);
      if (decision !== null) {
        into.decisions.push(decision);
        return;
      }
    } else if (record !== null && ('risk' in record || 'text' in record)) {
      const risk = readRisk(record.risk ?? record.text, key);
      if (risk !== null) {
        into.risks.push(risk);
        return;
      }
    } else if (record !== null && 'path' in record) {
      const artifact = readArtifact(record, key, type);
      if (artifact !== null) {
        into.artifacts.push(artifact);
        return;
      }
      issues.warn(field, format(PARSE.artifactOutsideTask, { path: String(record.path) }));
      return;
    } else if (asText(item) !== null) {
      into.decisions.push({ text: asText(item) as string, rationale: null, source: key });
      return;
    }
    issues.warn(field, PARSE.listItemUnclassified);
  });
}

function collectFromMap(
  entry: Dict,
  key: string,
  type: WorkflowType,
  into: Collected,
  issues: Issues
): void {
  for (const raw of asList(entry.decisions) ?? []) {
    const decision = readDecision(raw, key);
    if (decision !== null) {
      into.decisions.push(decision);
    }
  }
  for (const raw of asList(entry.risks) ?? []) {
    const risk = readRisk(raw, key);
    if (risk !== null) {
      into.risks.push(risk);
    }
  }
  for (const raw of asList(entry.artifacts) ?? []) {
    const artifact = readArtifact(raw, key, type);
    if (artifact !== null) {
      into.artifacts.push(artifact);
      continue;
    }
    const record = asDict(raw);
    if (record !== null && record.path !== undefined) {
      issues.warn(
        `phase_summaries.${key}.artifacts`,
        format(PARSE.artifactOutsideTask, { path: String(record.path) })
      );
    }
  }
}

/** § 2.4 — derived from the registry and the recorded completions, never guessed. */
export function derivePhases(
  type: WorkflowType,
  completedIds: readonly string[],
  status: TaskStatus
): PhaseView[] {
  const registry = workflowForType(type)?.phases ?? [];
  const completed = new Set(completedIds);

  const numbered = registry.map((phase) => ({
    id: `phase-${phase.n}`,
    n: phase.n,
    name: phase.name,
    activeForm: phase.activeForm as string | null,
    icon: phase.icon
  }));
  for (const id of completedIds) {
    const n = phaseNumber(id);
    if (n !== null && !numbered.some((phase) => phase.id === id)) {
      numbered.push({ id, n, name: id, activeForm: null, icon: UNMAPPED_PHASE_ICON });
    }
  }
  numbered.sort((a, b) => a.n - b.n);

  const completedNumbers = completedIds
    .map(phaseNumber)
    .filter((n): n is number => n !== null);
  const max = completedNumbers.length > 0 ? Math.max(...completedNumbers) : null;
  const allowsCurrent = UNFINISHED_STATUSES.includes(status);

  let currentTaken = false;
  const phases: PhaseView[] = numbered.map((phase) => {
    let phaseStatus: PhaseStatus;
    if (completed.has(phase.id)) {
      phaseStatus = 'completed';
    } else if (max !== null && phase.n < max) {
      phaseStatus = 'not_recorded';
    } else if (!currentTaken && allowsCurrent) {
      phaseStatus = 'current';
      currentTaken = true;
    } else {
      phaseStatus = 'upcoming';
    }
    return {
      id: phase.id,
      name: phase.name,
      activeForm: phase.activeForm,
      icon: phase.icon,
      status: phaseStatus
    };
  });

  for (const id of completedIds) {
    if (phaseNumber(id) === null) {
      phases.push({
        id,
        name: id,
        activeForm: null,
        icon: UNMAPPED_PHASE_ICON,
        status: 'completed'
      });
    }
  }
  return phases;
}

function unreadableTask(input: StateInput, message: string): Task {
  const issues = new Issues();
  issues.error('state', message);
  return emptyTask(input, input.ref, issues, typeFor(input.ref, issues));
}

function typeFor(ref: TaskRef, issues: Issues): WorkflowType {
  const def = workflowForDirSegment(ref.dirSegment);
  if (def !== null) {
    return def.type;
  }
  issues.warn(
    'type',
    format(PARSE.unknownSegment, { segment: ref.dirSegment, version: MAISTER_VERSION })
  );
  return 'unknown';
}

function emptyTask(input: StateInput, ref: TaskRef, issues: Issues, type: WorkflowType): Task {
  return {
    ref,
    type,
    title: titleFromFolder(ref.folderName),
    description: null,
    status: 'unknown',
    tags: [],
    priority: null,
    created: null,
    updated: null,
    phases: [],
    currentPhaseId: null,
    verdict: null,
    characteristics: {},
    options: {},
    decisions: [],
    risks: [],
    e2eFollowUp: [],
    artifacts: [],
    hasDashboard: input.hasDashboard,
    hasDashboardData: input.hasDashboardData,
    stateMtime: input.stateMtime,
    activityMtime: input.activityMtime,
    author: null,
    nextAction: { id: 'none', label: NEXT_ACTION_LABELS.none },
    parseIssues: issues.all()
  };
}

/**
 * The largest `orchestrator-state.yml` the index reads. A state file is a small record; a
 * larger one is reported rather than parsed, so no workspace file decides how much memory
 * activation spends.
 */
export const MAX_STATE_BYTES = 2 * 1024 * 1024;

/** The task shown for a state file the index refused to read because of its size. */
export function oversizedStateTask(input: Omit<StateInput, 'text'>, bytes: number): Task {
  return unreadableTask(
    { ...input, text: '' },
    format(PARSE.oversizedState, {
      size: String(Math.round(bytes / 1024)),
      limit: String(MAX_STATE_BYTES / 1024)
    })
  );
}

/**
 * Reads one `orchestrator-state.yml` into a `Task`. It never throws: every input yields a
 * task, and anything guessed or left out is recorded in `parseIssues` (feature-spec § 2).
 */
export function parseState(input: StateInput): Task {
  if (input.text.trim() === '') {
    return unreadableTask(input, PARSE.emptyState);
  }

  const issues = new Issues();
  let root: Dict | null = null;
  let yamlErrors: string[] = [];
  try {
    const doc = parseDocument(input.text, { strict: false, uniqueKeys: false, prettyErrors: true });
    yamlErrors = doc.errors.map((error) => error.message);
    root = asDict(doc.toJS());
  } catch (error) {
    yamlErrors = [error instanceof Error ? error.message : String(error)];
  }

  const sections = root === null ? [] : [root.task, root.orchestrator, ...CONTEXT_KEYS.map((k) => root?.[k])];
  if (root === null || !sections.some((section) => asDict(section) !== null)) {
    return unreadableTask(
      input,
      yamlErrors.length === 0
        ? PARSE.unreadableState
        : `${PARSE.unreadableState} ${format(PARSE.yamlError, { detail: yamlErrors[0] })}`
    );
  }
  for (const message of yamlErrors) {
    issues.error('state', format(PARSE.yamlError, { detail: message }));
  }

  const type = typeFor(input.ref, issues);
  const task = asDict(root.task) ?? {};
  const orchestrator = asDict(root.orchestrator) ?? {};

  // N7 — both option levels are read, `orchestrator.options` winning on conflict.
  const options: TaskOptions = {};
  for (const source of [asDict(root.options), asDict(orchestrator.options)]) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (value === null || ['boolean', 'string', 'number'].includes(typeof value)) {
        options[key] = value as TaskOptions[string];
      }
    }
  }

  // N3 — status.
  let status: TaskStatus = 'unknown';
  const rawStatus = asText(task.status);
  if (rawStatus !== null && (TASK_STATUSES as readonly string[]).includes(rawStatus)) {
    status = rawStatus as TaskStatus;
  } else if (rawStatus !== null) {
    issues.warn('status', format(PARSE.unknownStatus, { value: rawStatus }));
  }

  // N4 — tags and priority.
  const rawTags = asList(task.tags) ?? (asText(task.tags) !== null ? [task.tags] : []);
  const tags = rawTags.map(asText).filter((tag): tag is string => tag !== null);
  let priority: Task['priority'] = null;
  const rawPriority = asText(task.priority);
  if (rawPriority !== null && (PRIORITIES as readonly string[]).includes(rawPriority)) {
    priority = rawPriority as Task['priority'];
  } else if (rawPriority !== null) {
    issues.warn('priority', format(PARSE.unknownPriority, { value: rawPriority }));
  }

  // N6 — completed phase ids.
  const completedIds: string[] = [];
  for (const raw of asList(orchestrator.completed_phases) ?? []) {
    const canonical = canonicalPhaseId(raw);
    if (canonical === null) {
      const kept = asText(raw);
      if (kept === null) {
        continue;
      }
      issues.warn(
        'completed_phases',
        format(PARSE.rawPhaseId, { value: kept, version: MAISTER_VERSION })
      );
      completedIds.push(kept);
      continue;
    }
    const known = workflowForType(type)?.phases.some((phase) => `phase-${phase.n}` === canonical);
    if (known === false) {
      issues.warn(
        'completed_phases',
        format(PARSE.rawPhaseId, { value: canonical, version: MAISTER_VERSION })
      );
    }
    if (!completedIds.includes(canonical)) {
      completedIds.push(canonical);
    }
  }

  const phases = derivePhases(type, completedIds, status);
  const currentPhaseId = phases.find((phase) => phase.status === 'current')?.id ?? null;

  // A17 — observable orchestrator facts are surfaced rather than dropped.
  const failedPhases = (asList(orchestrator.failed_phases) ?? [])
    .map((raw) => canonicalPhaseId(raw) ?? asText(raw))
    .filter((id): id is string => id !== null);
  if (failedPhases.length > 0) {
    issues.warn(
      'orchestrator.failed_phases',
      format(PARSE.failedPhases, { count: failedPhases.length, phases: failedPhases.join(', ') })
    );
  }
  const attempted = Object.entries(asDict(orchestrator.auto_fix_attempts) ?? {})
    .filter(([, value]) => typeof value === 'number' && value > 0)
    .map(([key]) => canonicalPhaseId(key) ?? key);
  if (attempted.length > 0) {
    issues.warn(
      'orchestrator.auto_fix_attempts',
      format(PARSE.autoFixAttempts, { phases: attempted.join(', ') })
    );
  }
  const startedPhase = canonicalPhaseId(orchestrator.started_phase);
  if (startedPhase !== null && startedPhase !== currentPhaseId) {
    issues.warn(
      'orchestrator.started_phase',
      format(PARSE.startedPhaseMismatch, {
        recorded: startedPhase,
        derived: currentPhaseId ?? PARSE.noCurrentPhase
      })
    );
  }

  // N8 — the first present domain context wins; the rest are reported, not merged.
  const presentContexts = CONTEXT_KEYS.filter((key) => asDict(root[key]) !== null);
  const chosenContextKey = presentContexts[0] ?? null;
  const chosenContext = chosenContextKey === null ? null : asDict(root[chosenContextKey]);
  for (const other of presentContexts.slice(1)) {
    issues.warn(
      other,
      format(PARSE.multipleContexts, { chosen: chosenContextKey as string, other })
    );
  }

  // N9/N10/N11/N12 + A14 — one pass over `phase_summaries`, map, list or scalar.
  const summaries = asDict(chosenContext?.phase_summaries) ?? asDict(root.phase_summaries) ?? {};
  const collected: Collected = { decisions: [], risks: [], artifacts: [] };
  for (const [key, entry] of Object.entries(summaries)) {
    const list = asList(entry);
    if (list !== null) {
      collectFromList(list, key, type, collected, issues);
      continue;
    }
    const map = asDict(entry);
    if (map !== null) {
      collectFromMap(map, key, type, collected, issues);
    }
    // A scalar entry is that entry's summary and contributes nothing else.
  }

  const decisions: Decision[] = [];
  const seenDecisions = new Set<string>();
  for (const decision of collected.decisions) {
    const key = normalizeText(decision.text);
    if (!seenDecisions.has(key)) {
      seenDecisions.add(key);
      decisions.push(decision);
    }
  }
  const artifacts: ArtifactRef[] = [];
  const seenArtifacts = new Set<string>();
  for (const artifact of collected.artifacts) {
    if (!seenArtifacts.has(artifact.relPath)) {
      seenArtifacts.add(artifact.relPath);
      artifacts.push(artifact);
    }
  }

  // N13/N14.
  const verification = asDict(root.verification_context);
  const verdictRaw = asText(verification?.last_status);
  const verdict: Verdict =
    verdictRaw !== null && (VERDICTS as readonly string[]).includes(verdictRaw)
      ? (verdictRaw as Verdict)
      : null;
  const e2eRaw = verification?.e2e_followup;
  const e2eFollowUp = (asList(e2eRaw) ?? [e2eRaw])
    .map(asText)
    .filter((text): text is string => text !== null);

  const characteristics: Record<string, boolean | string> = {};
  const rawCharacteristics =
    asDict(asDict(root.task_context)?.task_characteristics) ??
    asDict(asDict(root.design_context)?.design_characteristics) ??
    {};
  for (const [key, value] of Object.entries(rawCharacteristics)) {
    if (typeof value === 'boolean' || typeof value === 'string') {
      characteristics[key] = value;
    }
  }

  return {
    ref: input.ref,
    type,
    title: asText(task.title) ?? titleFromFolder(input.ref.folderName),
    description: asText(task.description),
    status,
    tags,
    priority,
    created: parseTimestamp(orchestrator.created, 'created', issues),
    updated: parseTimestamp(orchestrator.updated, 'updated', issues),
    phases,
    currentPhaseId,
    verdict,
    characteristics,
    options,
    decisions,
    risks: collected.risks,
    e2eFollowUp,
    artifacts,
    hasDashboard: input.hasDashboard,
    hasDashboardData: input.hasDashboardData,
    stateMtime: input.stateMtime,
    activityMtime: input.activityMtime,
    author: null,
    nextAction: { id: 'none', label: NEXT_ACTION_LABELS.none },
    parseIssues: issues.all()
  };
}
