/**
 * The single home for every user-facing string Maister Lens authors (A6, A13).
 * Maister's own phase names and activeForms are constant input and live in
 * `model/workflows.ts`, where they are shown verbatim.
 *
 * Placeholders are `{name}` and are filled by `format`.
 */

export const WORKFLOW_LABELS = {
  development: 'Development',
  'product-design': 'Product design',
  research: 'Research',
  migration: 'Migration',
  performance: 'Performance',
  unknown: 'Unknown workflow'
} as const;

export const STATUS_LABELS = {
  pending: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  blocked: 'Blocked',
  unknown: 'State unreadable'
} as const;

export const PHASE_STATUS_LABELS = {
  completed: 'Completed',
  current: 'Current',
  not_recorded: 'Not recorded',
  upcoming: 'Upcoming'
} as const;

export const VERDICT_LABELS = {
  passed: 'Passed',
  passed_with_issues: 'Passed with issues',
  failed: 'Failed verification'
} as const;

export const NEXT_ACTION_LABELS = {
  resume: 'Resume',
  startDevelopment: 'Start development',
  fromResearch: 'Continue from research',
  none: 'No next action'
} as const;

/** Parse diagnostics; the fallback view surfaces these verbatim (§ 5.4, A17). */
export const PARSE = {
  unreadableState: 'State file unreadable.',
  emptyState: 'State file is empty.',
  oversizedState:
    'State file is {size} KB, over the {limit} KB Maister Lens reads; it was not parsed.',
  yamlError: 'YAML could not be read in full: {detail}',
  unknownSegment: 'Workflow directory "{segment}" is not in the pinned Maister {version} registry.',
  unknownStatus: 'Task status "{value}" is not a recorded status; shown as state unreadable.',
  unknownPriority: 'Priority "{value}" is not a recorded priority and was left out.',
  dateOnly: 'Timestamp "{value}" carries no time; read as midnight UTC.',
  unparsableDate: 'Timestamp "{value}" could not be read and was left out.',
  rawPhaseId:
    'Phase id "{value}" is outside the pinned Maister {version} registry; shown by its raw id.',
  multipleContexts: 'Domain context "{chosen}" was used; "{other}" was left out.',
  noCurrentPhase: 'no current phase',
  artifactOutsideTask: 'Artifact path "{path}" points outside the task folder and was left out.',
  listItemUnclassified: 'list item not recognized as a decision, risk or artifact',
  failedPhases: '{count} phases recorded as failed: {phases}',
  autoFixAttempts: 'auto-fix attempts recorded for {phases}',
  startedPhaseMismatch:
    'Recorded started phase is {recorded}, while the phases on disk point to {derived}; the phases on disk are shown.'
} as const;

/** Attribution outcomes (§ 3.8); the author facet and every task row read these. */
export const AUTHOR = {
  notCommitted: 'Not committed',
  unknown: 'Author unknown'
} as const;

/** Index, persistence and watcher copy (§ 3.3, § 3.5, § 3.9). */
export const INDEX = {
  outputChannel: 'Maister Lens',
  reindexing: 'Reading Maister tasks…',
  persistFailed:
    'Maister Lens could not save its task index. Tasks are still shown; the next start rebuilds the index from disk.',
  watcherExcluded:
    'Maister Lens cannot see edits under .maister because files.watcherExclude hides that folder. Use "Maister: Refresh" to reindex on demand.',
  openSettings: 'Open Settings',
  dismiss: 'Dismiss'
} as const;

/**
 * Relative time copy (§ 4.1). The index publishes `activityMtime` and a 60 s republish
 * tick; the views turn that into these sentences through `views/relativeTime.ts`.
 */
export const TIME = {
  writtenSeconds: 'written {n}s ago',
  writtenMinutes: 'written {n} min ago',
  quietMinutes: 'quiet for {n} min',
  quietHours: 'quiet for {n} h',
  quietDays: 'quiet for {n} d',
  /** The compact marker an Overview row carries, as the mockup draws it. */
  quietShort: 'quiet {n}d',
  agoSeconds: '{n}s ago',
  agoMinutes: '{n} min ago',
  agoHours: '{n} h ago',
  agoDays: '{n}d ago',
  /** Spoken forms; tree accessible labels read these instead of the abbreviations (§ 4.3). */
  spokenWrittenSeconds: 'Written {n} seconds ago',
  spokenWrittenMinutes: 'Written {n} minutes ago',
  spokenQuietMinutes: 'Quiet for {n} minutes',
  spokenQuietHours: 'Quiet for {n} hours',
  spokenQuietDays: 'Quiet for {n} days'
} as const;

/** The navigation tree that opens the Dashboard. */
export const NAV = {
  dashboard: 'Dashboard',
  dashboardLabel: 'Open the Maister dashboard',
  project: 'Project',
  projectLabel: 'Open the project documentation'
} as const;

/** The Now tree (§ 4.1, § 4.3, A9). */
export const NOW = {
  badgeTooltip: '{count} unfinished tasks',
  badgeTooltipOne: '1 unfinished task',
  progress: 'Phase {current} of {total}: {name}',
  progressNoPhase: 'Progress',
  progressCompleted: '{completed} completed',
  progressCompletedAndNotRecorded: '{completed} completed, {notRecorded} not recorded',
  lastDecision: 'Last recorded decision: {text}',
  recentArtifacts: 'Recent artifacts',
  /** § 4.1's task description — `{Type label} · {phase activeForm, or status} · {activity}`. */
  taskDescription: '{type} · {phase} · {activity}',
  tooltipPhase: 'Phase {current} of {total} — {name}',
  tooltipLastWrite: 'Last write: {when}',
  tooltipNextAction: 'Next action: {action}',
  /** § 4.3's spoken sentence. */
  accessibleTask: '{title}. {type} task. {progress}. {activity}. Next action: {action}.',
  accessibleProgressPhase: 'Phase {current} of {total}, {activeForm}',
  accessibleProgressNoPhase: 'No current phase',
  accessibleNextAction: '{action} {title}'
} as const;

/** The Overview view (§ 4.2, § 4.3). */
export const OVERVIEW = {
  title: 'Tasks',
  searchLabel: 'Search',
  searchPlaceholder: 'Search tasks, decisions, risks…',
  searchAccessibleLabel: 'Search tasks, decisions and risks',
  scopeLabel: 'Scope',
  scopeMine: 'Mine',
  scopeEveryone: 'Everyone',
  statusLabel: 'Status',
  typeLabel: 'Type',
  attentionLabel: 'Attention',
  attentionFailed: 'Failed verification',
  attentionQuiet: 'Quiet ≥ {days} days',
  tasksLabel: 'Tasks',
  tasksCount: '{matched} of {total}',
  filterCount: '{count} filters',
  filterCountOne: '1 filter',
  recentlyActive: 'Recently active',
  groupHeader: '{group} ({count})',
  showAllInDashboard: 'Show all in Dashboard',
  emptyFiltered: 'No tasks match the current filters.',
  clearFilters: 'Clear filters',
  emptyIndex: 'No Maister tasks in this working copy.',
  startWorkflow: 'Start a workflow',
  updating: 'Updating…',
  statusUnreadable: 'Unreadable',
  markerFailedVerification: 'failed verification',
  markerQuiet: 'quiet {n} days',
  matchedIn: 'matched in {field}',
  matchField: {
    decision: 'decision',
    risk: 'risk',
    tldr: 'TL;DR',
    title: 'title',
    description: 'description',
    tags: 'tags'
  },
  heroesExpander: 'Artifacts of {title}',
  groupByPrompt: 'Group the Overview list by',
  groupBy: {
    type: 'Type',
    status: 'Status',
    author: 'Author',
    month: 'Month'
  },
  authorMe: 'Me',
  monthUndated: 'Undated',
  /** Logged, never shown, when a webview message fails the A2 allowlist. */
  messageRefused: 'overview: refused a webview message ({reason})'
} as const;

/** The panel: titles, the fallback banners and the lines the output channel receives (§ 5.1–5.4). */
export const PANEL = {
  titleTask: 'Maister · {title}',
  titleArtifact: 'Maister · {label}',
  titleDashboard: 'Maister · Dashboard',
  titleFollowUps: 'Maister · Follow-ups',
  titleProject: 'Maister · Project',
  /** § 5.4's banner, one line per reason the hosted dashboard is not shown. */
  bannerNoDashboard:
    "Native summary — this task was run without Maister's HTML dashboard (html_output: false).",
  bannerUnrecognized:
    "Native summary — this task's dashboard version isn't supported for embedding.",
  /** § 8.1 — an untrusted workspace never executes task-authored HTML (AC15). */
  bannerUntrusted:
    "Native summary — this workspace is not trusted, so Maister's HTML dashboard stays closed here.",
  openInBrowser: 'Open dashboard in browser',
  unrecognizedNoLoader: 'the file never mentions dashboard-data.js',
  unrecognizedNoGlobal: 'the file never mentions MAISTER_DATA',
  unrecognizedNoInlineScript: 'the file carries no inline script element',
  unrecognizedNoHead:
    'the file does not open with <html><head>, so the content security policy has nowhere to go',
  unrecognizedUnreadableTag: 'a <script> or <meta> tag could not be read attribute by attribute',
  unrecognizedIframe: 'the file embeds an iframe, which the shim cannot reach',
  unreadableDashboard: 'the dashboard file could not be read ({detail})',
  /** Logged, never shown. */
  messageRefused: 'panel: refused a webview message ({reason})',
  taskGone: 'panel: task {folderUri} is no longer indexed; showing the dashboard instead',
  fallbackReason: 'panel: {folderUri} is shown as a native summary ({reason})',
  commandFailed: 'panel: {command} did not run ({detail})',
  docUnreadable: 'panel: project doc {docRelPath} could not be read ({detail})',
  /** FR3 — shown to the user when a link in a hosted page is refused. */
  navigateRefused: 'Maister Lens did not follow that link: {reason}.'
} as const;

/** The back button the shim injects into hosted pages; its own copy, so it reads as Lens UI. */
export const SHIM = {
  lensBack: '\u2190 Lens Dashboard'
} as const;

/** The Project page: the INDEX.md TL;DR and the grouped `.maister/docs` files. */
export const PROJECT = {
  heading: 'Project',
  goalLabel: 'Goal',
  techStackLabel: 'Tech stack',
  missing: '{field} not found in .maister/docs/INDEX.md under "## Project Documentation".',
  empty: 'This workspace has no .maister/docs documentation yet.',
  initHint: 'Run /maister:init to generate it.',
  back: '\u2190 Project',
  breadcrumb: 'Project',
  groupIndex: 'Index',
  groupProject: 'Project',
  groupStandards: 'Standards · {domain}',
  groupOther: 'Other'
} as const;

/** Phase glyphs; the § 5.4 phase list always prints the status word beside them (A14). */
export const PHASE_GLYPHS = {
  completed: '✓',
  current: '●',
  not_recorded: '◌',
  upcoming: '○'
} as const;

/** The § 5.4 native summary, in the order the sections are rendered. */
export const FALLBACK = {
  breadcrumb: '← Dashboard',
  breadcrumbLabel: 'Breadcrumb',
  typeBadge: '{type}',
  status: 'Status: {status}',
  author: 'Author: {author}',
  verdict: 'Verification: {verdict}',
  verdictNone: 'none yet',
  dates: 'Created {created} · updated {updated}',
  dateUnknown: 'unknown',
  parseIssues: '{count} parse issues',
  parseIssuesOne: '1 parse issue',
  phasesLabel: 'Phases',
  phaseLine: '{position} · {name}',
  phaseCurrent: 'Current — {activeForm}',
  heroesLabel: 'Key artifacts',
  heroOpen: 'Open',
  heroOpenLabel: 'Open {label}',
  noHeroes: 'This task registered no key artifacts.',
  decisionsLabel: 'Decisions',
  noDecisions: 'No decisions were recorded.',
  risksLabel: 'Risks',
  openFollowUpsLabel: 'Show the follow-ups of {title} in the Follow-ups view',
  noRisks: 'No risks were recorded.',
  riskOpen: 'Open',
  riskResolved: 'Resolved',
  artifactsLabel: 'All artifacts',
  noArtifacts: 'This task folder holds no readable documents.',
  rawStateLabel: 'Raw state',
  rawStateSummary: 'orchestrator-state.yml and {count} parse issues',
  rawStateSummaryOne: 'orchestrator-state.yml and 1 parse issue',
  rawStateSummaryNone: 'orchestrator-state.yml',
  openStateFile: 'Open state file',
  stateUnreadable:
    'The state file could not be read; the values above come from the last good read.'
} as const;

/** Dashboard mode (§ 5.5): KPI tiles, the four charts and the task table. */
export const DASHBOARD = {
  heading: 'Dashboard',
  scope: '{total} tasks · counts only, no durations',
  kpiTasks: 'Tasks',
  kpiTasksContext: '{n} created this week so far',
  kpiFailed: 'Failed verification',
  kpiFailedContext: 'of {completed} completed',
  kpiQuiet: 'Quiet ≥ {days} days',
  kpiQuietContext: 'unfinished tasks',
  kpiFollowUps: 'Follow-ups',
  followUpsContext: 'across {k} tasks',
  followUpsLabel: 'Show all {k} follow-ups in the Follow-ups view',
  filtersLabel: 'Filters',
  filtersGroup: 'Active filters',
  clearAll: 'Clear all',
  chartsNote: 'Charts show all tasks · click a bar to filter the table',
  removeFilter: 'Remove the {label} filter',
  filterText: 'Search: {text}',
  filterAuthorMe: 'Author: me',
  filterAuthorOthers: 'Author: everyone else',
  filterAuthorEmail: 'Author: {email}',
  filterQuiet: 'Quiet ≥ {days} days',
  filterCreatedAfter: 'Created after {date}',
  filterCreatedBefore: 'Created before {date}',
  chartStatus: 'Status',
  chartVerification: 'Verification',
  chartType: 'Workflow type',
  chartCreated: 'Tasks created per week',
  scopeAll: 'All {total} tasks',
  scopeCompleted: 'Verdicts of {completed} completed tasks',
  scopeWeeks: 'Last 12 weeks, from each task’s created date',
  tableLink: 'Table',
  chartLink: 'Chart',
  tableLinkLabel: 'Show {chart} as a data table',
  chartLinkLabel: 'Show {chart} as a chart',
  columnLabel: 'Value',
  columnCount: 'Tasks',
  barLabel: '{label}: {count} tasks — activate to filter the table',
  weekSummary: 'Tasks created per week over the last 12 weeks: {detail}',
  weekDetail: '{label} {count}',
  weekCurrent: '{label}: {count} tasks created, week in progress',
  weekColumn: '{label}: {count} tasks created',
  createdFootnote:
    '{n} tasks without a created date are not shown · the current week is in progress (dashed)',
  createdFootnoteNone: 'The current week is in progress (dashed)',
  verdictNone: 'No verdict',
  tasksHeading: 'Tasks',
  tasksCount: '{matched} of {total} match the filters',
  tasksCapped: 'The first {limit} tasks are shown.',
  columns: {
    title: 'Title',
    type: 'Type',
    status: 'Status / current phase',
    verdict: 'Verdict',
    author: 'Author',
    created: 'Created',
    activity: 'Last activity',
    next: 'Next'
  },
  sortLabel: 'Sort by {column}',
  openTaskLabel: 'Open {title}',
  nextActionLabel: '{action} {title}',
  empty: 'No tasks match the current filters.'
} as const;

/** Follow-ups view: what completed tasks left open, grouped by task. */
export const FOLLOW_UPS = {
  heading: 'Follow-ups',
  breadcrumb: '← Dashboard',
  breadcrumbLabel: 'Breadcrumb',
  summary: '{n} across {k} tasks',
  scopedTo: 'Scoped to {title}',
  verdictsLabel: 'Verification verdicts of completed tasks',
  verdictPassed: 'Passed',
  verdictPassedWithIssues: 'Passed with issues',
  verdictFailed: 'Failed',
  verdictContext: 'completed tasks',
  sourceIssue: 'Issue',
  sourceRisk: 'Risk',
  sourceDeferred: 'Deferred',
  sourceE2e: 'E2E',
  severity: {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info'
  },
  groupLabel: 'Follow-ups of {title}',
  openTaskLabel: 'Open {title}',
  count: '{n} follow-ups',
  countOne: '1 follow-up',
  notCompleted: 'Follow-ups appear once this task is completed.',
  empty: 'No completed task has open follow-ups.',
  unreadable: '{n} task data files could not be read',
  unreadableOne: '1 task data file could not be read'
} as const;

/** The Follow-ups note on data files that could not be read; empty when there are none. */
export function unreadableText(n: number): string {
  return n === 0 ? '' : n === 1 ? FOLLOW_UPS.unreadableOne : format(FOLLOW_UPS.unreadable, { n });
}

/** The § 6.3 artifact reader. */
export const READER = {
  skipToDocument: 'Skip to document',
  breadcrumbLabel: 'Breadcrumb',
  breadcrumbTask: '← {title}',
  heroesLabel: 'Key artifacts',
  summaryLabel: 'Summary',
  tldrLabel: 'TL;DR',
  decisionsLabel: 'Key decisions',
  risksLabel: 'Open questions & risks',
  riskResolved: 'Resolved',
  checklist: 'Checklist: {done} of {total} done · {skipped} skipped',
  checklistLabel: 'Checklist:',
  documentLabel: 'Document',
  checkNotDone: 'not done',
  checkDone: 'done',
  checkSkipped: 'skipped',
  imageNotLoaded: '(image not loaded)',
  opensInBrowser: '(opens in browser)',
  opensInEditor: '(opens in editor)',
  tooLarge: 'This artifact is too large to preview ({size})',
  openSource: 'Open source file',
  unreadable: 'This artifact could not be read. Open the source file to see what is on disk.',
  companionIframe:
    'The styled companion embeds a frame that cannot be shown here, so the markdown version is shown instead.',
  companionTooLarge:
    'The styled companion is too large to preview, so the markdown version is shown instead.',
  companionUnhostable:
    'The styled companion could not be given a content security policy, so the markdown version is shown instead.'
} as const;

/** The launch layer: the § 7.3 flow, the § 7.4 chain and every outcome it reports. */
export const LAUNCH = {
  workflowPickPlaceholder: 'Choose a workflow',
  workflowLabels: {
    work: 'Let Maister decide',
    development: 'Development',
    'product-design': 'Product design',
    research: 'Research',
    migration: 'Migration',
    performance: 'Performance'
  },
  workflowDetails: {
    work: 'Classifies your description and picks the workflow',
    development: 'Spec, plan, implement and verify a change',
    'product-design': 'Explore a problem and write a product brief',
    research: 'Answer a question with sourced findings',
    migration: 'Move to a new technology or platform safely',
    performance: 'Find and fix performance bottlenecks'
  },
  descriptionPrompt: 'What should this workflow do?',
  descriptionPlaceholder: 'Describe the task in 1 to 2,000 characters',
  descriptionEmpty: 'Describe the task — at least one non-whitespace character.',
  descriptionTooLong: 'Describe the task in at most {max} characters; this is {n}.',
  continueFromResearchPlaceholder: 'Continue from this research',
  designFromResearch: 'Design from this research',
  developFromResearch: 'Develop from this research',
  noNextAction: 'This task has no next action.',
  terminalPickPlaceholder: 'Choose a terminal for the Maister command',
  terminalActive: '(active)',
  terminalNew: 'New terminal — start Claude Code',
  /** § 7.4's 5 s status-bar outcome; the URI path lands in Claude Code's primary editor (I4). */
  statusClaudeCode: 'Opened in Claude Code — press Enter to run',
  statusClaudeCodeUri: 'Opened in Claude Code’s primary editor — press Enter to run',
  statusCopilotChat: 'Sent to Copilot Chat',
  statusTerminal: 'Sent to terminal “{name}” — press Enter to run',
  statusClipboard: 'Maister command copied to the clipboard',
  copilotCaveat:
    'Maister commands are Claude Code plugin skills. Copilot Chat receives the text, but can only carry out the workflow if your Copilot setup provides Maister’s skills.',
  adjustLaunchOrder: 'Adjust launch order',
  targetOrderInvalid:
    'launch: maisterLens.launch.targetOrder is empty or not a list of known targets; the default order was used.',
  /** Logged, never shown. */
  logTargetFailed:
    'launch: target {target} did not take the command ({detail}); trying the next one',
  logClaudeCommandMissing:
    'launch: Claude Code is installed but {command} is not registered; using the URI entry point',
  logClaudeCommandFailed:
    'launch: the Claude Code command failed ({detail}); using the URI entry point',
  logNoticeFailed: 'launch: the Copilot Chat notice could not be shown ({detail})',
  logUntrusted: 'launch: refused in an untrusted workspace',
  logTaskGone: 'launch: task {folderUri} is no longer indexed'
} as const;

/** The lower-case status word an Overview row shows beside its glyph (§ 4.2). */
export const STATUS_WORDS = {
  pending: 'not started',
  in_progress: 'in progress',
  completed: 'completed',
  failed: 'failed',
  blocked: 'blocked',
  unknown: 'unreadable'
} as const;

/** Status glyphs; never the only carrier of meaning — the status word always accompanies them (§ 4.3). */
export const STATUS_GLYPHS = {
  in_progress: '◯',
  pending: '○',
  blocked: '❚❚',
  failed: '✕',
  completed: '✓',
  unknown: '?'
} as const;

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
