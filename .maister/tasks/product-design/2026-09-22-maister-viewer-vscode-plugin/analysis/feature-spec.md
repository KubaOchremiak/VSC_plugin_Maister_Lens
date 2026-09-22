# Feature Specification — Maister Lens

## TL;DR
Maister Lens is a TypeScript VS Code extension with two runtime dependencies (`yaml`, `markdown-it`). Its sidebar holds two collapsible views, **Now** and **Overview** (counts, filters and the task list in one), and a single reusable panel switches between **Task**, **Artifact** and **Dashboard** modes.
A parser that never throws turns `orchestrator-state.yml` into a normalized `Task`, using a workflow registry pinned to Maister 2.2.3. It feeds a persisted two-tier index kept live by a file watcher, with metadata and § 7 summary search but no full-text search.
Task mode hosts each task's own `dashboard.html` unmodified. An injected shim adds CSP nonces so the dashboard's data file loads inside the webview sandbox, and the extension never evaluates model-written JavaScript. Tasks it can't host get a native fallback view.
Launching is task-contextual: each task carries a next action (Resume, Start development, Continue from research) one click away, composed as a `/maister:*` command and sent in a configurable order — Claude Code panel, then Copilot Chat, then terminal, then clipboard — pre-filled rather than submitted by default.
Eighteen acceptance criteria map back to the four Phase 2 success criteria.

## Key Decisions
- The parser never throws. Every oddity is a `ParseIssue`, and phase gaps are `not_recorded` rather than guessed as skipped — tolerance and honesty made contractual.
- `dashboard-data.js` is loaded natively in the webview sandbox via nonce injection instead of being parsed by the extension host — no unsafe evaluation, no third dependency, higher fidelity (refines the Phase 5 "data fed by message" wording).
- Markdown renders with `html: false` as the sanitization strategy; the § 7 block is extracted and pinned, and the body de-duplicated.
- Launch target order is configurable (`maisterLens.launch.targetOrder`), defaulting to Claude Code → Copilot → terminal → clipboard, per user direction.
- Workspace Trust is `limited`: untrusted workspaces never execute hosted HTML and cannot launch workflows.
- Extension named **Maister Lens** (`maister-lens`, settings prefix `maisterLens.*`).

## Open Questions / Risks
- The Claude Code launch target depends on `claude-vscode.editor.open(sessionId, prompt)`, an undocumented signature observed in Claude Code 2.1.278; AC11 must be re-verified against each installed version.
- Copilot Chat receives `/maister:*` text but can only run it if the user's Copilot setup provides Maister's skills; the extension cannot verify this.
- Dashboard hosting depends on each vintage loading data through a `<script src="dashboard-data.js">` element; a future Maister that loads data differently will fall to the fallback view.
- The hosted dashboard and companions follow the OS light/dark setting rather than the VS Code theme, and their accessibility is unaudited.
- Performance targets (300 ms warm, 5 s cold for 300 tasks) are specified but unmeasured until the generator-based perf suite runs.
- Testing standards are not initialized; § 8.6 proposes them and should be ratified via `/maister:standards-update`.

---

## 1. Extension Structure, Activation & Contributions

### 1.1 Identity & toolchain

| Item | Value |
|---|---|
| Extension id | `maister-lens` (display name "Maister Lens") |
| Language | TypeScript, `strict: true` |
| Engine | `"vscode": "^1.90.0"` — a stable baseline with WebviewView, tree view badges and `FileSystemWatcher` all mature |
| Bundler | `esbuild`, two entry points: `src/extension.ts` → `dist/extension.js` (Node, CJS), `src/webview/*.ts` → `dist/webview/*.js` (browser, IIFE) |
| Runtime dependencies | `yaml` (tolerant parsing of block and flow styles, structured errors) and `markdown-it` (rendering). **No others.** |
| Dev dependencies | `typescript`, `esbuild`, `@types/vscode`, `@types/node`, `@vscode/test-electron`, `mocha`, `eslint`, `prettier`, `@vscode/vsce` |
| Distribution | `vsce package` → Marketplace / Open VSX |

This satisfies the minimal-dependencies convention: two runtime libraries, each replacing something genuinely risky to hand-roll (YAML with flow mappings; CommonMark with GFM tables).

### 1.2 Activation

```jsonc
"activationEvents": [
  "workspaceContains:.maister/tasks/*/*/orchestrator-state.yml",
  "workspaceContains:.maister/config.yml"
]
```

Views and commands contributed in `package.json` activate the extension implicitly; no `onView:`/`onCommand:` entries are needed. Activation must not perform heavy work: it registers providers and commands, then starts the index build **asynchronously** (Section 3). Views render a loading state until the first index snapshot is published.

### 1.3 Contributions

**View container**
```jsonc
"viewsContainers": { "activitybar": [
  { "id": "maister", "title": "Maister Lens", "icon": "media/maister.svg" }
]}
```

**Views** — in this order, each natively collapsible:
```jsonc
"views": { "maister": [
  { "id": "maister.now",      "name": "Now",      "type": "tree" },
  { "id": "maister.overview", "name": "Overview", "type": "webview" }
]}
```

`viewsWelcome` supplies first-run and empty-state content for the Now tree; Overview renders its own empty state ("No Maister tasks found in this workspace." + **Start a workflow**):
- `maister.now`, empty: *"No unfinished Maister tasks in this working copy."* + **Start a workflow** link.

**Commands** (all titled with the `Maister:` category):

| Command id | Title | Surfaces |
|---|---|---|
| `maister.openTask` | Open Task | Now tree item click; Overview row title |
| `maister.openArtifact` | Open Artifact | Tree item click on artifact nodes |
| `maister.openDashboard` | Open Dashboard | Overview title bar (`navigation@1`), Overview "Show all" links |
| `maister.refresh` | Refresh | Now and Overview title bars |
| `maister.openRisks` | Open Risks | Overview title bar, Dashboard **Open risks** tile, Now "N open risks" rows, command palette (§ 5.7) |
| `maister.overview.groupBy` | Group By… | Overview title bar |
| `maister.overview.clearFilter` | Clear Filters | Overview title bar, when `maister.overview.filtered` |
| `maister.startWorkflow` | Start Workflow… | Now/Overview title bars, welcome views |
| `maister.runNextAction` | Run Next Action | Inline row buttons, fallback view header, Dashboard **Next** column, panel editor title (§ 7.2) |
| `maister.resumeTask` | Resume | Palette / context menu when next action is *Resume* |
| `maister.startDevelopmentFromDesign` | Start Development from This Design | Palette / context menu when next action is *Start development* |
| `maister.designFromResearch` / `maister.developFromResearch` | Design / Develop from This Research | Palette / context menu on completed research tasks |
| `maister.revealInExplorer` | Reveal in Explorer | Context menu on tasks and artifacts |
| `maister.openArtifactSource` | Open Source File | Context menu on artifacts; reader panel toolbar |

Context-menu visibility is driven by `contextValue` on tree items — e.g. `task.development.in_progress`, `task.product-design.completed`, `artifact.md`, `artifact.md+html` — matched with regex `when` clauses.

**Configuration**

| Setting | Type | Default | Meaning |
|---|---|---|---|
| `maisterLens.staleness.quietDays` | number | `3` | An unfinished task is flagged "quiet for N days" at or beyond this threshold |
| `maisterLens.attribution.enabled` | boolean | `true` | Derive task authors from git (Section 3) |
| `maisterLens.launch.targetOrder` | array of `claudeCode`/`copilotChat`/`terminal`/`clipboard` | `["claudeCode","copilotChat","terminal","clipboard"]` | Launch destination preference order; first available is used (Section 7) |
| `maisterLens.launch.autoSubmit` | boolean | `false` | Submit launched commands immediately where the target allows it (Copilot Chat, terminal); Claude Code always pre-fills (Section 7) |
| `maisterLens.launch.terminalName` | string | `""` | Preferred terminal name for the terminal target (Section 7) |

### 1.4 Source layout

```
src/
  extension.ts            activate/deactivate; wiring; owns disposables
  model/
    types.ts              normalized domain types (Section 2)
    workflows.ts          static workflow registry: phases, names, icons, hero artifacts (Section 2)
    parseState.ts         tolerant orchestrator-state.yml → Task (Section 2)
    parseSummary.ts       § 7 block extraction (Section 2)
  index/
    taskIndex.ts          tier-1 index, persistence, invalidation (Section 3)
    watcher.ts            FileSystemWatcher + debounce (Section 3)
    attribution.ts        git author lookup (Section 3)
  views/
    nowTree.ts            TreeDataProvider for Now (Section 4)
    overviewView.ts       WebviewViewProvider for Overview: tiles + task list (Section 4)
  panel/
    panel.ts              singleton WebviewPanel, mode switching, message routing (Section 5)
    hostDashboard.ts      dashboard.html hosting + shim injection (Section 5)
    render.ts             markdown pipeline + companion hosting (Section 6)
  launch/
    launch.ts             command composition + terminal targeting (Section 7)
  webview/                browser-side bundles: overview.ts, dashboardMode.ts,
                          fallbackTask.ts, reader.ts, shim.ts
media/                    icon, shared webview CSS (VS Code theme variables only)
test/
  fixtures/tasks/         real-shaped task directories, one per drift hazard (Section 8)
  unit/  integration/
```

Every module that owns a watcher, provider, panel or child process registers it in `context.subscriptions`, so all resources are disposed on deactivation (resource-cleanup error-handling standard).

### 1.5 Lifecycle

1. `activate()` registers the two view providers (Now, Overview), the panel serializer and all commands, and returns immediately.
2. It then calls `taskIndex.load()` without awaiting: read the persisted index, stat the files, re-parse what changed, publish a snapshot event (Section 3).
3. Views subscribe to `taskIndex.onDidChange` and render from snapshots. **Views never read files directly** — the sole exception is the panel, which reads artifact bodies on demand via `render.ts`.
4. `WebviewPanelSerializer` restores the panel after a window reload from its persisted state `{ mode, taskPath?, artifactPath? }`.
5. `deactivate()` flushes the index to storage.

### 1.6 Manifest addenda

*Added at Phase 6 depth verification: contributions introduced in Sections 5–8, consolidated here so § 1 is a complete `package.json` source.*

**Additional commands** (extend the § 1.3 table):

| Command id | Title | Surfaces |
|---|---|---|
| `maister.panel.back` | Back | Panel editor-title bar |
| `maister.panel.forward` | Forward | Panel editor-title bar |
| `maister.panel.toggleVariant` | Toggle Styled / Markdown View | Panel editor-title bar |

**Editor-title menu contributions** — `menus["editor/title"]`, `group: "navigation"`:

| Command | `when` |
|---|---|
| `maister.panel.back` | `activeWebviewPanelId == 'maister.panel' && maister.panel.canGoBack` |
| `maister.panel.forward` | `activeWebviewPanelId == 'maister.panel' && maister.panel.canGoForward` |
| `maister.panel.toggleVariant` | `activeWebviewPanelId == 'maister.panel' && maister.panel.variantAvailable` |
| `maister.openDashboard` | `activeWebviewPanelId == 'maister.panel'` |
| `maister.openArtifactSource` | `activeWebviewPanelId == 'maister.panel' && maister.panel.mode == 'artifact'` |
| `maister.runNextAction` | `activeWebviewPanelId == 'maister.panel' && maister.panel.hasNextAction && isWorkspaceTrusted` |
| `maister.revealInExplorer` | `activeWebviewPanelId == 'maister.panel' && maister.panel.mode != 'dashboard'` |

**Context keys** — the single consolidated list, all set via `setContext`:

| Key | Type | Set by |
|---|---|---|
| `maister.overview.filtered` | boolean | Overview, on any filter change (§ 4.2) |
| `maister.panel.mode` | `'dashboard' \| 'risks' \| 'task' \| 'artifact'` | Panel, on each navigation (§ 5.1) |
| `maister.panel.canGoBack` / `maister.panel.canGoForward` | boolean | Panel history (§ 5.1) |
| `maister.panel.variantAvailable` | boolean | Reader, when both `md` and `html` exist (§ 6.1) |
| `maister.panel.hasNextAction` | boolean | Panel, when the displayed task's next action is not `none` (§ 7.2) |

**Inline tree action:** `menus["view/item/context"]` entry `{ command: "maister.runNextAction", when: "view == maister.now && viewItem =~ /\\.next-(resume|startDevelopment|fromResearch)$/ && isWorkspaceTrusted", group: "inline" }`.

Launch commands (`maister.startWorkflow`, `maister.runNextAction`, `maister.resumeTask`, `maister.startDevelopmentFromDesign`, `maister.designFromResearch`, `maister.developFromResearch`) additionally carry `&& isWorkspaceTrusted` in `menus.commandPalette`, view-title and context-menu `when` clauses (§ 8.1).

**Activation event addition:** `"onWebviewPanel:maister.panel"`, so `WebviewPanelSerializer` can restore the panel after a reload independently of `workspaceContains`.

**Manifest capabilities:**
```jsonc
"capabilities": {
  "untrustedWorkspaces": { "supported": "limited",
    "description": "In untrusted workspaces Maister Lens shows tasks and renders markdown, but does not run Maister's HTML dashboards or companions, and cannot launch workflows." },
  "virtualWorkspaces": false
},
"extensionKind": ["workspace"]
```

---

## 2. Domain Model & Tolerant Parsing

**Governing rule:** the parser **never throws**. Every input — malformed YAML, empty file, unknown workflow type — yields a `Task`. Anything guessed or skipped is recorded in `parseIssues`, never silently discarded. This turns Phase 2's tolerance constraint into a contract.

### 2.1 Domain types (`model/types.ts`)

```ts
type WorkflowType = 'development' | 'product-design' | 'research' | 'migration' | 'performance' | 'unknown';
type TaskStatus   = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked' | 'unknown';
type PhaseStatus  = 'completed' | 'current' | 'not_recorded' | 'upcoming';
type Verdict      = 'passed' | 'passed_with_issues' | 'failed' | null;
type IconHint     = 'analysis' | 'spec' | 'plan' | 'code' | 'verify' | 'docs' | 'done';

interface TaskRef {
  folderUri: string;       // absolute URI of the task directory — the task's identity
  relPath: string;         // e.g. ".maister/tasks/migrations/2026-05-02-auth-migration"
  dirSegment: string;      // raw directory segment, e.g. "migrations"
  folderName: string;      // "2026-05-02-auth-migration"
}

interface Decision { text: string; rationale: string | null; source: string }   // source = phase_summaries key or artifact relPath
interface Risk     { text: string; resolved: boolean; source: string }
interface ArtifactRef {
  relPath: string;         // relative to task root, e.g. "implementation/spec.md"
  label: string;
  htmlRelPath: string | null;
  isHero: boolean;
  summary: SummaryBlock | null;   // § 7 block, populated by the index (Section 3)
}
interface SummaryBlock { tldr: string | null; decisions: Decision[]; risks: Risk[] }

interface PhaseView {
  id: string;              // canonical "phase-N"
  name: string;            // from registry; raw id if unmapped
  activeForm: string | null;
  icon: IconHint;
  status: PhaseStatus;
}

interface Author { name: string; email: string; addedAt: Date; isMe: boolean }

interface Task {
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
  decisions: Decision[];           // aggregated across all phase_summaries entries
  risks: Risk[];
  artifacts: ArtifactRef[];        // registered artifacts; directory scan added at tier 2
  hasDashboard: boolean;           // dashboard.html present in task folder
  hasDashboardData: boolean;       // dashboard-data.js present
  stateMtime: number;              // ms epoch
  activityMtime: number;           // max(mtime(orchestrator-state.yml), mtime(dashboard-data.js))
  author: Author | null;           // Section 3
  nextAction: { id: 'resume' | 'startDevelopment' | 'fromResearch' | 'none'; label: string };  // § 7.2, computed at index time
  parseIssues: ParseIssue[];
}

interface ParseIssue { severity: 'error' | 'warning'; field: string; message: string }
```

`PhaseStatus` deliberately has **no `skipped` or `failed` value**. Maister's state file does not reliably record skips, and a phase-level failure is not observable from state. A gap below a completed phase is `not_recorded` — stating exactly what is known (§ 2.4).

### 2.2 Workflow registry (`model/workflows.ts`)

A static table transcribed from Maister 2.2.3's skill definitions. It is the sole source of phase names when a task has no `dashboard-data.js`, and the source of hero artifacts for the fallback Task view.

```ts
interface WorkflowDef {
  type: WorkflowType;
  dirSegment: string;             // directory under .maister/tasks/
  label: string;                  // UI label
  maisterVersion: '2.2.3';
  phases: { n: number; name: string; activeForm: string; icon: IconHint }[];
  heroes: { match: string; label: string; verdictFallback?: boolean }[];
}
```

| Type | `dirSegment` | Phases | Heroes (from `dashboard.html` `HERO_MAP`) |
|---|---|---|---|
| `development` | `development` | 14 | `implementation/spec.md` Specification · `implementation/implementation-plan.md` Implementation Plan · `verification/implementation-verification.md` Verification *(verdictFallback)* |
| `product-design` | `product-design` | 9 (0–8) | `outputs/product-brief.md` Product Brief · `analysis/feature-spec.md` Feature Spec · `analysis/design-decisions.md` Design Decisions |
| `research` | `research` | 6 | `outputs/research-report.md` Research Report · `outputs/solution-exploration.md` Solution Exploration · `outputs/high-level-design.md` High-Level Design · `outputs/decision-log.md` Decision Log |
| `migration` | **`migrations`** | 8 | same three as development |
| `performance` | `performance` | 9 | same three as development |

**development** (icons extension-defined — Maister publishes none for this workflow)

| n | name | activeForm | icon |
|---|---|---|---|
| 1 | Analyze codebase & clarify requirements | Analyzing codebase & clarifying | analysis |
| 2 | Analyze gaps & clarify scope | Analyzing gaps & clarifying scope | analysis |
| 3 | Write failing test (TDD Red) | Writing failing test | code |
| 4 | Generate UI mockups | Generating UI mockups | spec |
| 5 | Gather requirements & create specification | Gathering requirements & creating specification | spec |
| 6 | Audit specification | Auditing specification | verify |
| 7 | Plan implementation | Planning implementation | plan |
| 8 | Execute implementation | Executing implementation | code |
| 9 | Verify test passes (TDD Green) | Verifying test passes | verify |
| 10 | Prompt verification options | Prompting verification options | verify |
| 11 | Verify implementation & resolve issues | Verifying implementation | verify |
| 12 | Run E2E tests | Running E2E tests | verify |
| 13 | Generate user documentation | Generating user documentation | docs |
| 14 | Finalize workflow | Finalizing workflow | done |

**product-design**

| n | name | activeForm | icon |
|---|---|---|---|
| 0 | Initialize, gather context & detect characteristics | Gathering context & detecting characteristics | analysis |
| 1 | Synthesize all context sources | Synthesizing context | analysis |
| 2 | Explore problem space | Exploring problem space | analysis |
| 3 | Explore users & personas | Exploring users & personas | analysis |
| 4 | Generate design alternatives | Generating design alternatives | plan |
| 5 | Converge on design direction | Converging on direction | plan |
| 6 | Specify features section-by-section | Specifying features | spec |
| 7 | Create visual prototypes | Creating visual prototypes | code |
| 8 | Review & hand off product brief | Reviewing & assembling brief | done |

**research**

| n | name | activeForm | icon |
|---|---|---|---|
| 1 | Research foundation (init, plan, gather, synthesize) | Executing research foundation | analysis |
| 2 | Evaluate brainstorming value | Evaluating brainstorming value | plan |
| 3 | Generate solution alternatives | Generating solution alternatives | spec |
| 4 | Evaluate brainstorming alternatives | Evaluating brainstorming alternatives | plan |
| 5 | Design high-level architecture | Designing high-level architecture | spec |
| 6 | Summarize research and suggest next steps | Completing research | done |

**migration**

| n | name | activeForm | icon |
|---|---|---|---|
| 1 | Analyze current state | Analyzing current state | analysis |
| 2 | Plan target state and gaps | Planning target state and gaps | analysis |
| 3 | Gather requirements & create migration strategy | Gathering requirements & creating migration strategy | spec |
| 4 | Plan implementation | Planning implementation | plan |
| 5 | Execute migration | Executing migration | code |
| 6 | Verify and test compatibility | Verifying and testing compatibility | verify |
| 7 | Resolve verification issues | Resolving verification issues | verify |
| 8 | Generate documentation | Generating documentation | docs |

**performance**

| n | name | activeForm | icon |
|---|---|---|---|
| 1 | Analyze codebase | Analyzing codebase | analysis |
| 2 | Analyze performance bottlenecks | Analyzing performance bottlenecks | analysis |
| 3 | Gather requirements & create specification | Gathering requirements & creating specification | spec |
| 4 | Audit specification | Auditing specification | verify |
| 5 | Plan implementation | Planning implementation | plan |
| 6 | Execute implementation | Executing implementation | code |
| 7 | Prompt verification options | Prompting verification options | verify |
| 8 | Verify implementation & resolve issues | Verifying implementation | verify |
| 9 | Finalize workflow | Finalizing workflow | done |

When a task records phase ids outside its registry (e.g. a newer Maister added a phase), those phases are shown by raw id with a `warning` issue — never hidden.

### 2.3 Parsing `orchestrator-state.yml` (`model/parseState.ts`)

**Step 1 — YAML.** `yaml.parseDocument(text, { strict: false, uniqueKeys: false, prettyErrors: true })`. If the document has errors but yields a partial tree, use the partial tree and record each error as an `error` issue. If nothing is usable, return the task with `status: 'unknown'`, a title derived from the folder name, and one `error` issue ("state file unreadable").

**Step 2 — normalization rules**, each applied independently so one bad field never blocks another:

| # | Field | Rule |
|---|---|---|
| N1 | `type` | From `dirSegment` via the registry (`migrations` → `migration`). Unmapped segment → `unknown`, still listed. |
| N2 | `title` | `task.title` if a non-empty string; else folder name with `YYYY-MM-DD-` removed, hyphens → spaces, first letter capitalized. |
| N3 | `status` | `task.status` if in the enum; else `unknown` + warning. |
| N4 | `tags`, `priority` | `tags` coerced to string array (scalar → single tag); `priority` kept only if in the enum. |
| N5 | `created`, `updated` | ISO 8601 parsed. Date-only accepted at 00:00Z + warning. Unparseable → `null` + warning. |
| N6 | Phase ids | `completed_phases` entries canonicalized to `phase-N`, accepting `phase-3`, `3`, `"3"`, `Phase 3`, `Phase 3: Anything`. Anything else kept raw + warning. |
| N7 | `options` | Read from **both** `orchestrator.options` and top-level `options`; merged with `orchestrator.options` winning. |
| N8 | Domain context | First present of `task_context`, `design_context`, `research_context`, `migration_context`, `performance_context`. More than one → first + warning. |
| N9 | `phase_summaries` | Each entry read whether it is a map **or a list** (development's `clarifications` is a list). Keys may be semantic (`idea_convergence`) or `phase-N`; the key is kept as `Decision.source`/`Risk.source`, never mapped to a phase. |
| N10 | Decisions | From every entry's `decisions`; items may be `{decision, rationale}` or plain strings. Deduplicated on normalized text. |
| N11 | Risks | From every entry's `risks`. A string starting with `resolved:` or containing `(resolved` → `resolved: true`, prefix stripped (matches `dashboard.html`'s own rule). |
| N12 | Artifacts | From every entry's `artifacts` (`{path, label, html}`). Paths are task-root-relative; any path escaping the task folder (`..`, absolute) is dropped + warning. Deduplicated on path; `isHero` set by registry match. |
| N13 | Verdict | `verification_context.last_status` if in the enum; else `null`. |
| N14 | Characteristics | `task_context.task_characteristics` or `design_context.design_characteristics`; only boolean/string values kept. |
| N15 | Unknown fields | Ignored by the model. The raw parsed tree is retained **only at tier 2** (Section 3) for the fallback view's "raw state" disclosure — never in the persisted index. |

### 2.4 Phase status derivation

Maister's own rule (`commands/work.md`) is: *the active phase is the first phase not in `completed_phases`*. That mislabels any task in which a phase was legitimately skipped, so the parser refines it using only observable data:

1. Let `C` = the set of canonical completed phase ids; `max` = the highest completed phase number.
2. For each registry phase `p`, in order:
   - `p ∈ C` → `completed`
   - `p.n < max` and `p ∉ C` → `not_recorded` (skipped, or completion never written — the plugin does not guess which)
   - the first `p.n > max` → `current` **only if** `status ∈ {in_progress, pending, blocked}`; otherwise `upcoming`
   - all later phases → `upcoming`
3. `status: completed` → no phase is `current`.
4. `status: unknown` → no phase is `current`; the task header shows "state unreadable".

`currentPhaseId` = id of the `current` phase, else `null`.

### 2.5 § 7 summary extraction (`model/parseSummary.ts`)

Reads at most the **first 8 KB** of a markdown artifact — the contract places the block at the top, which keeps this cheap at index time.

1. Strip a leading YAML front-matter block and the first H1 if present.
2. Headings are matched **case-insensitively, at level 2 or 3**, and only within the **leading region**: before the first thematic break (`---`) or the fourth heading, whichever comes first. This prevents matching a "Risks" section deep in the document body.
   - TL;DR: `^#{2,3}\s*TL;?\s*DR\b`
   - Key Decisions: `^#{2,3}\s*Key Decisions\b`
   - Risks: `^#{2,3}\s*(Open Questions\s*(/|&|and)\s*Risks|Risks|Open Questions)\b`
3. A section's content runs until the next heading of the same or higher level.
4. TL;DR kept as markdown text, capped at 1,000 characters.
5. Decision bullets split into `text`/`rationale` at the first ` — ` (em dash), then ` – `, then ` - `. No separator → `rationale: null`.
6. Risk bullets follow N11's `resolved:` rule.
7. None of the three found → `summary: null`. Normal for contract-exempt files (`work-log.md`), not an error.

### 2.6 Test obligations

Parser behaviour is pinned by fixtures in `test/fixtures/tasks/`, one task folder per known hazard:
- flow- and block-style YAML mixed in one file
- `phase-N` vs semantic `phase_summaries` keys
- `options` at both nesting levels
- `clarifications` as a list
- extra unpublished fields (this product-design task itself is a fixture)
- date-only timestamp
- a skipped phase below a completed one
- truncated / invalid YAML
- empty file
- `migrations/` directory mapping
- unknown workflow directory
- § 7 blocks using `Open Questions / Risks`, `Open Questions & Risks`, and missing sections

Each fixture asserts the resulting `Task` and its `parseIssues`.

---

## 3. Task Index, File Watching & Attribution

### 3.1 Two tiers

| Tier | Contents | Lifetime | Built |
|---|---|---|---|
| **Tier 1 — index** | One `Task` per task folder (Section 2), including § 7 summaries of every **registered** artifact | Persisted across sessions | Eagerly at activation; incrementally thereafter |
| **Tier 2 — detail** | `TaskDetail`: raw parsed state tree + full listing of the task folder's files | In memory, LRU of 20 tasks | On demand when a task is opened |

Artifact *bodies* belong to neither tier — they are read on open and cached by the renderer (Section 6).

```ts
interface TaskDetail {
  task: Task;
  raw: unknown;                    // parsed YAML tree, for the fallback view's "raw state" disclosure
  files: { relPath: string; size: number; mtime: number; kind: 'md' | 'html' | 'image' | 'other' }[];
}
```

### 3.2 Discovery

For each workspace folder:

```ts
workspace.findFiles(new RelativePattern(folder, '.maister/tasks/*/*/orchestrator-state.yml'), null)
```

The exclude argument is **`null`** so a user's `files.exclude` / `search.exclude` can never hide tasks. A folder is a task if and only if it contains `orchestrator-state.yml` — Maister's own rule. Standalone `mockups/` folders (no state file) are therefore not indexed; recorded as a known limitation in Section 8.

### 3.3 Persistence

- **Location:** `context.storageUri/index-v1.json` — per-workspace storage, never written into the repository.
- **Shape:**
  ```ts
  interface PersistedIndex {
    schemaVersion: 1;
    registryVersion: '2.2.3';       // workflow registry the entries were built against
    extensionVersion: string;
    entries: Record<string /* relPath */, {
      stateStat: { mtime: number; size: number };
      dataStat: { mtime: number; size: number } | null;       // dashboard-data.js
      artifactStats: Record<string, { mtime: number; size: number }>;
      task: SerializedTask;         // Task with Dates as ISO strings
    }>;
  }
  ```
- **Invalidation:** mismatched `schemaVersion` or `registryVersion` → discard the whole file and rebuild. Per entry: invalid if the state file's `mtime` **or** `size` differs. Artifact summaries are invalidated individually via `artifactStats`.
- **Writes:** debounced 2 s after the last change; atomic — write `index-v1.json.tmp`, then `workspace.fs.rename(…, { overwrite: true })`. Also flushed on `deactivate()`.
- **Corruption:** a persisted file failing `JSON.parse` or a shape check is deleted and rebuilt, logged as one output-channel line; never a user-facing error.

### 3.4 Load algorithm

1. **Instant paint.** Read the persisted index; if valid, publish it immediately as a snapshot with `freshness: 'cached'`, so every start after the first renders in well under a second.
2. **Discover** (§ 3.2).
3. **Stat** each state file, its `dashboard-data.js`, and its registered artifacts — concurrency capped at 16.
4. **Reconcile.** Unchanged entries kept as-is. New or changed entries parsed (Section 2, concurrency 8) and their registered artifacts' § 7 blocks extracted (8 KB reads). Entries whose state file no longer exists are evicted.
5. **Publish** a snapshot with `freshness: 'fresh'`; schedule persistence.
6. Steps 2–5 run inside `window.withProgress({ location: { viewId: 'maister.overview' } })` — VS Code's native progress bar on the Overview view.

**Performance targets** (verified by Section 8 acceptance tests, not assumed):
- Cold index of 300 fixture tasks completes in under 5 s.
- Warm start publishes its cached snapshot in under 300 ms.

### 3.5 File watching (`index/watcher.ts`)

One recursive watcher per workspace folder:

```ts
workspace.createFileSystemWatcher(new RelativePattern(folder, '.maister/tasks/**'))
```

Events routed by path relative to `.maister/tasks/`:

| Path pattern | Event | Action |
|---|---|---|
| `*/*/orchestrator-state.yml` | create / change | Re-parse that task. Debounced **per task**, 250 ms trailing, to absorb Maister's full-file rewrites. |
| `*/*/orchestrator-state.yml` | delete | Evict the task. |
| `*/*/dashboard-data.js` | create / change | Stat only; update `activityMtime`. If the task is open in the panel, push fresh data (Section 5). |
| `*/*/**/*.md`, `*/*/**/*.html` | create / change / delete | If the artifact is registered, re-extract its § 7 block. If the task is open, refresh its file listing; if the artifact is open in the reader, re-render it (Section 6). |
| `*/*/` (directory) | delete | Evict the task. |

Snapshot publication is throttled to **at most one per 500 ms**, so a burst of Maister writes yields one UI update.

Relative times in the UI ("quiet for 12 min", "3 days ago") are refreshed by a 60 s timer that re-renders labels from the snapshot, with **no file I/O**.

If the user's `files.watcherExclude` covers `.maister`, live updates stop. The extension detects this at activation by inspecting the effective setting and shows a one-time, dismissible notification. `Maister: Refresh` always performs a full reconcile (§ 3.4 steps 2–5).

### 3.6 Index API

```ts
interface IndexSnapshot {
  readonly tasks: ReadonlyMap<string /* relPath */, Task>;
  readonly freshness: 'cached' | 'fresh';
  readonly builtAt: number;
}
interface TaskIndex {
  readonly snapshot: IndexSnapshot;
  readonly onDidChange: Event<{ snapshot: IndexSnapshot; changed: readonly string[] }>;
  getDetail(relPath: string): Promise<TaskDetail>;   // tier 2, LRU(20)
  refresh(): Promise<void>;                           // full reconcile
  query(q: TaskQuery): TaskHit[];                     // § 3.7
}
```

### 3.7 Query engine (tier 1 only — no full text)

```ts
interface TaskQuery {
  text?: string;
  types?: WorkflowType[];
  statuses?: TaskStatus[];
  verdicts?: (Verdict | 'none')[];
  author?: 'me' | 'others' | { email: string };
  quietAtLeastDays?: number;        // unfinished tasks whose activityMtime is at least this old
  createdAfter?: Date; createdBefore?: Date;
}
interface TaskHit { task: Task; matchedIn: ('title' | 'description' | 'tags' | 'decision' | 'risk' | 'tldr')[]; score: number }
```

- **Text:** case-insensitive, whitespace-split tokens, all must match (AND). Searched across title, folder name, description, tags, decision text and rationale, risk text, and every registered artifact's TL;DR / decisions / risks.
- **Ranking:** title/folder-name match 3, decision/risk match 2, TL;DR/description/tag match 1. Ties broken by `activityMtime` descending.
- **Facets** combine with AND; an unset facet does not filter.
- **Staleness** applies only to tasks with `status ∉ {completed}`, computed as `now − activityMtime`, and is labelled "quiet for N days" — never "abandoned".
- Queries run synchronously in memory; at a few hundred tasks this is sub-millisecond and needs no separate index structure.

### 3.8 Attribution (`index/attribution.ts`)

Git is used **only as a data source**, exactly as scoped in Phase 3.

- **Repository root:** `git rev-parse --show-toplevel` per workspace folder.
- **One process per repository**, not per task:
  ```
  git log --diff-filter=A --format=%x1e%an%x1f%ae%x1f%aI --name-only -- ':(glob).maister/tasks/*/*/orchestrator-state.yml'
  ```
  Executed via `child_process.execFile` (never a shell), 10 s timeout. Output split into records on `\x1e`, fields on `\x1f`. Log order is newest-first, so the **last** record seen for a path is its earliest addition — that one is used.
- **`isMe`:** author email compared case-insensitively with `git config user.email`.
- **When it runs:** once after the first `fresh` snapshot, then when new tasks are discovered (debounced 10 s). Not on ordinary state changes — authorship does not change.
- **Results** are stored on `Task.author` and persisted with the index.
- **Degraded cases:**

| Situation | `author` | UI shows |
|---|---|---|
| State file never committed | `null` | "Not committed" |
| `git` missing, not a repository, or timeout | `null` | "Author unknown"; one output-channel line, no notification |
| `maisterLens.attribution.enabled: false` | `null` | Author facet hidden |

- **Documented limitation:** the author is whoever first **committed** the state file, which may not be the person who ran the workflow.

### 3.9 Diagnostics

An output channel **Maister Lens** logs index timings, reconcile counts, parse-issue totals per task, and attribution failures. It is the single sink for internal errors (centralized-handling error standard). User-facing notifications are reserved for conditions the user can act on, such as the watcher-exclude case in § 3.5.

---

## 4. Sidebar: Now, Overview

*Revised at Phase 7 review: the separate Browse tree was merged into Overview. Overview previously showed only counts; it now also lists the filtered tasks, so tiles and search show their results in place.*

Both views render exclusively from the index snapshot (§ 3.6). Neither reads files.

### 4.1 Now (`views/nowTree.ts`)

**Purpose:** Marek's primary surface — tasks whose files are being written right now.

**Membership:** every **unfinished** task — `status ∈ {in_progress, pending, blocked}` — sorted by `activityMtime` descending, with **no time cutoff**. *Revised at Phase 7 review:* developers work in their own working copies and commit a task only when it's finished, so tasks from colleagues arrive already completed; the unfinished tasks in a working copy are effectively the user's own. A time window (the earlier 30-minute rule) would drop a task that's sitting at a gate or between sessions. The view states status and write activity as facts, never an inferred "running" state.

**View badge:** `treeView.badge = { value: N, tooltip: "N unfinished tasks" }` when N > 0 — a factual count, not a notification.

**Task node**

| Property | Value |
|---|---|
| `label` | `task.title` |
| `description` | `{Type label} · {current phase activeForm, or status} · {activity}` |
| activity | `written {n}s/m ago` when under 10 minutes; `quiet for {n} min` at 10 minutes or more |
| `iconPath` | Codicon for the current phase's `icon` (`analysis`→`search`, `spec`→`file-text`, `plan`→`list-ordered`, `code`→`code`, `verify`→`shield`, `docs`→`book`, `done`→`flag`); no current phase → `circle-outline` |
| inline action | The task's **next action** (§ 7.2) as an inline icon button (`menus["view/item/context"]`, `group: "inline"`), e.g. ▶ *Resume*. Absent when the task has none. |
| `collapsibleState` | `Expanded` for the most recently written task, `Collapsed` otherwise |
| `command` | `maister.openTask` |
| `tooltip` | `MarkdownString`: title, type, `Phase {n} of {total} — {name}`, last write as absolute local time, TL;DR of the most recently modified registered artifact, and the next action if any |
| `contextValue` | `task.{type}.{status}.next-{nextActionId}` (e.g. `task.development.in_progress.next-resume`, `task.research.completed.next-fromResearch`, `task.development.completed.next-none`) |
| `id` | `now:{relPath}` (stable, so VS Code preserves expansion) |

**Task children**, in order:
1. **Progress** — `Phase {n} of {total}: {name}`, description `{k} completed` (plus `, {m} not recorded` when applicable). Click opens the task.
2. **Last recorded decision** — last entry of `task.decisions` (state-file order ≈ phase order), truncated to 80 characters; tooltip holds full text and rationale. Omitted if none.
3. **Recent artifacts** — up to 5 registered artifacts by mtime descending; label = artifact label; description = relative modification time (`4 min ago`). Click → `maister.openArtifact`.
4. **Open risks** — `{n} open risks` (unresolved only). Click opens Risks mode scoped to this task (§ 5.7). Omitted when zero.

**Empty:** the `viewsWelcome` from § 1.3.

### 4.2 Overview (`views/overviewView.ts` + `webview/overview.ts`)

**Purpose:** orientation *and* the portfolio list, in one view. It serves Irena and Ada at a glance, and replaces the former Browse tree for finding any task. It's a `WebviewView` because tiles, a text box and a filtered list with inline actions can't be expressed as tree items.

**View title bar** (native `menus["view/title"]`, `when: view == maister.overview`):

| Command | Icon | Position |
|---|---|---|
| `maister.openDashboard` | `dashboard` | `navigation@1` — **opens Dashboard mode in the panel** with the current filter |
| `maister.openRisks` | `warning` | `navigation@2` — opens Risks mode (§ 5.7) |
| `maister.overview.groupBy` | `group-by-ref-type` | `navigation@3` |
| `maister.overview.clearFilter` | `clear-all` | `navigation@4`, when `maister.overview.filtered` |
| `maister.refresh` | `refresh` | `navigation@5` |

**Layout** — single column, designed for 250–400 px sidebar widths:

```
[ Search tasks, decisions, risks…        ]
[ Mine | Everyone ]                         ← only when attribution is enabled
STATUS    [In progress 4] [Completed 212] [Failed 3] [Blocked 1] [Unreadable 2]
TYPE      [✓ Development 140] [Product design 31] [Research 44] [Migration 9] [Performance 6]
ATTENTION [✓ ! Failed verification 5] [⏸ Quiet ≥ 3 days 7]
──────────────────────────────────────────────
TASKS  5 of 230 · 2 filters
▾ Development (5)
   ✕ Rate limiter rollout        completed · failed verification     
   ❚❚ Admin audit log export      blocked · quiet 5d              [▶]
   ◯ Refund idempotency keys     Verify implementation · quiet 6d [▶]
   …
▸ Product design (0)
```

With no filter active, the list heading reads **Recently active** and shows the 20 tasks with the newest `activityMtime`, grouped the same way. A **Show all {n}** link at the bottom of any list opens Dashboard mode.

**Tiles**
- **Status tiles:** one per `TaskStatus` with count > 0; `unknown` is labelled **Unreadable**.
- **Type tiles:** one per workflow type present in the index.
- **Attention tiles:** `Failed verification` (`verdict = failed`) and `Quiet ≥ {quietDays} days` (§ 3.7). Nothing else — no durations, no throughput, per the observable-facts constraint.
- **Every tile is a toggle button** (`aria-pressed`). Activating one merges its facet into the active `TaskQuery` (§ 3.7); the list below updates in place. Pressed tiles show a ✓ glyph as well as the pressed styling.
- **Search:** debounced 200 ms, sets `text` in the query; `Escape` clears.
- **Mine / Everyone:** sets or unsets `author: 'me'`.

**Task list** (below the tiles)
- **Grouping** — selected via `maister.overview.groupBy` (single-pick prompt), persisted in `workspaceState`:

  | Mode | Groups | Group order |
  |---|---|---|
  | **Type** *(default)* | One per workflow type, plus `Unknown` if any | development, product-design, research, migration, performance, unknown |
  | Status | One per status | in progress, blocked, pending, failed, completed, unreadable |
  | Author | `Me`, each other author, then `Not committed` / `Author unknown` | Me first, then by task count |
  | Month | `YYYY-MM` from `created` (fallback: folder date prefix) | Newest first |

  Group headers are disclosure buttons (`aria-expanded`) labelled `{Group} ({count})`. Collapse state per group key is kept via `setState`, so Ada's product-design group stays open and development stays shut.
- **Within a group:** tasks sorted by `activityMtime` descending, capped at 50 per group with a **Show all in Dashboard** link beyond that.
- **Task row:**

  | Part | Content |
  |---|---|
  | status glyph + text | `◯` in progress, `○` pending, `❚❚` blocked, `✕` failed, `✓` completed, `?` unreadable — always accompanied by the status word in the description |
  | title | `task.title`; activating it (click / `Enter`) runs `openTask` |
  | description | In progress: `{phase activeForm} · {relative activity}`. Completed: `completed · {verdict label}`. Other: `{status} · {relative activity}`. Suffix ` · quiet {n}d` at the staleness threshold; ` · matched in {decision \| risk \| TL;DR}` for non-title text matches. |
  | markers | `!` for `verdict = failed`, `⏸` for quiet ≥ threshold — each with visually hidden text ("failed verification", "quiet 5 days") |
  | **next action** | Trailing icon button (▶ / ⤳) for the task's next action (§ 7.2), `aria-label` = full action name, e.g. "Resume Refund idempotency keys". Absent when there is none. |
  | expander | Disclosure revealing the task's **hero artifacts** (registry order, only those that exist); each opens `openArtifact` |

- **Empty result:** *"No tasks match the current filters."* + **Clear filters** button.

**Data flow:** the extension posts `{ type: 'overview', stats, groups, activeFilter, freshness }` on every snapshot publish and filter change. `groups` carries only row fields (title, type, status, description parts, markers, `nextAction`, hero artifact labels) for at most 50 tasks per group — never full `Task` objects. While `freshness === 'cached'`, a small `role="status"` caption reads *"Updating…"*.

**Webview hygiene:** CSP `default-src 'none'; style-src {cspSource}; script-src 'nonce-{n}'`; `retainContextWhenHidden: false`; search text, Mine toggle, and group collapse state persist across collapse via `vscode.getState()/setState()`. Styling uses VS Code theme variables only (`--vscode-button-*`, `--vscode-input-*`, `--vscode-badge-*`, `--vscode-list-*`, `--vscode-focusBorder`).

**Shared filter state:** the active `TaskQuery` lives in the extension, not the webview. Overview and Dashboard mode (§ 5.5) both read and write it, so opening the dashboard from Overview's title bar keeps the same filter. Context key `maister.overview.filtered` is true while any facet or text is set.

### 4.3 Accessibility

- **Now (tree):** every task item sets `accessibilityInformation.label` to a complete spoken sentence, e.g. *"Auth token rotation. Development task. Phase 8 of 14, executing implementation. Written 40 seconds ago. Next action: none."* The inline action has its own label.
- **Overview (webview):** tiles and group headers are `<button>`s; the task list is a list of `<section>`s with `<h3>` group headings; each row's title and next action are separate buttons reachable by Tab, with **Up/Down arrow** roving focus between rows within a group. Focus is always visible (`--vscode-focusBorder`).
- **Never colour alone:** status, verdict and staleness always also appear as text.

---

## 5. Panel: Task Mode, Fallback View & Dashboard Mode

### 5.1 Panel lifecycle (`panel/panel.ts`)

One `WebviewPanel`, view type `maister.panel`, reused for everything.

| Property | Value |
|---|---|
| First open | `ViewColumn.Beside`; subsequent opens `panel.reveal(panel.viewColumn)` |
| Title | `Maister · {task title}` / `Maister · {artifact label}` / `Maister · Dashboard` |
| Options | `enableScripts: true`, `enableCommandUris: false`, `retainContextWhenHidden: false` |
| `localResourceRoots` | each workspace folder's `.maister/tasks/`, `extensionUri/media`, `extensionUri/dist/webview` |

**Locations** — the panel shows exactly one at a time:

```ts
type PanelLocation =
  | { mode: 'dashboard' }
  | { mode: 'risks'; relPath?: string }
  | { mode: 'task'; relPath: string }
  | { mode: 'artifact'; relPath: string; artifactRelPath: string; variant: 'md' | 'html'; anchor?: string };
```

**History.** Because the panel is reused, VS Code's own back/forward cannot navigate within it. The panel keeps its own history stack (max 50 entries), exposed through **native editor-title actions** rather than injected UI:

| Command | Icon | `when` |
|---|---|---|
| `maister.panel.back` | `arrow-left` | `activeWebviewPanelId == 'maister.panel' && maister.panel.canGoBack` |
| `maister.panel.forward` | `arrow-right` | `… && maister.panel.canGoForward` |
| `maister.openDashboard` | `dashboard` | `activeWebviewPanelId == 'maister.panel'` |
| `maister.openArtifactSource` | `go-to-file` | `… && maister.panel.mode == 'artifact'` |
| `maister.revealInExplorer` | `folder-opened` | `… && maister.panel.mode != 'dashboard'` |

**Restore:** `WebviewPanelSerializer` persists `PanelLocation` via `setState`. On reload, if the location's task no longer exists, fall back to `{ mode: 'dashboard' }`.

### 5.2 Task mode: hosted vs. fallback

```
hostable(task) = task.hasDashboard && recognize(dashboard.html) === 'recognized'
Task mode → hostable ? Hosted dashboard (§ 5.3) : Fallback view (§ 5.4)
```

`recognize()` requires **all** of the following in the file text (result cached per `(mtime, size)`):
- the string `dashboard-data.js`
- the string `MAISTER_DATA`
- at least one inline `<script>` element (no `src`)
- no `<iframe` (no nested document the shim cannot reach)

Anything else → `'unrecognized'` → fallback view, with the reason stated.

### 5.3 Hosted dashboard (`panel/hostDashboard.ts` + `webview/shim.ts`)

**Principle:** Maister's `dashboard.html` runs **with its markup, styles and script logic untouched**. The extension makes exactly three insertions, all security plumbing:

1. **Immediately after `<head>`** (case-insensitive; if absent, before the first `<script`), insert:
   ```html
   <meta http-equiv="Content-Security-Policy"
     content="default-src 'none'; img-src {cspSource} data:; style-src {cspSource} 'unsafe-inline'; font-src {cspSource}; script-src 'nonce-{N}';">
   <base href="{asWebviewUri(taskFolder)}/">
   <script nonce="{N}" src="{asWebviewUri(dist/webview/shim.js)}"></script>
   ```
   `'unsafe-inline'` for styles is required by the dashboard's inline `style=` attributes. `connect-src` is omitted, so it falls back to `'none'` — the page cannot make network requests.
2. **Add `nonce="{N}"`** to every inline `<script>` opening tag (`<script(?![^>]*\bsrc=)([^>]*)>`).
3. **Remove** any pre-existing CSP `<meta>` so only the extension's policy applies.

`{N}` is a fresh 32-byte random nonce per render.

**Shim responsibilities** (runs before the dashboard's own script):

| Concern | Mechanism |
|---|---|
| **Data loading** | The dashboard appends `<script src="dashboard-data.js?t=…">`, which the CSP would block (no nonce). The shim patches `Node.prototype.appendChild` and `insertBefore`: any `HTMLScriptElement` whose `src` contains `dashboard-data.js` is given `nonce = document.currentScript.nonce` (captured at shim start) before insertion. The `<base>` tag makes the relative `src` resolve to the webview resource URI. The dashboard's own `onload`, content-diffing and render logic then run **unchanged**. |
| **Live refresh** | On `{ type: 'refresh' }` from the extension (sent when the watcher sees `dashboard-data.js` change, § 3.5), the shim calls `window.loadData?.(false)` for an immediate render. If a dashboard vintage lacks a global `loadData`, its own 5 s polling still refreshes it, since polling goes through the same patched loader. |
| **Link navigation** | Capturing `click` and `auxclick` listeners on `document`: for the closest `a[href]`, if the raw `getAttribute('href')` starts with `#`, the default in-page scroll is allowed; otherwise `preventDefault()` + `stopPropagation()` and post `{ type: 'navigate', href }`. `window.open` is overridden to post the same message. |
| **API ownership** | The shim calls `acquireVsCodeApi()` first. VS Code permits one call per page, so no later script — including the model-authored data file — can obtain the messaging API. |

**Why this is safe:** `dashboard-data.js` is model-authored JavaScript, but it executes only inside the webview's isolated origin, with no Node access, no network (`default-src 'none'`), and no messaging handle. **The extension host never evaluates or parses it.** This supersedes the Phase 5 wording "data fed by message": data is loaded natively in the sandbox; only refresh signals travel by message.

**Handling `navigate`** (extension side) — `href` is resolved relative to the task folder (the dashboard sits at the task root):

| Resolved target | Action |
|---|---|
| Outside the task folder (after normalization) | Ignored; logged to the output channel |
| `*.md` inside the task | Open artifact, `variant: 'md'` (Section 6) |
| `*.html` companion inside the task | Open artifact, `variant: 'html'` (Section 6) — the user explicitly clicked the styled link; the reader offers a markdown toggle |
| `dashboard.html` of this or another task | Task mode for that task |
| Any other file | `vscode.open` in a normal editor |

**Styling:** left exactly as Maister ships it (Area E decision); the dashboard follows the OS light/dark setting.

### 5.4 Fallback view (`webview/fallbackTask.ts`)

Used when `hostable(task)` is false. Built by the extension from `Task` + `TaskDetail`, styled only with VS Code theme variables.

1. **Banner** (always shown, so the two Task views are distinguishable):
   - no dashboard: *"Native summary — this task was run without Maister's HTML dashboard (`html_output: false`)."*
   - unrecognized: *"Native summary — this task's dashboard version isn't supported for embedding."* + **Open dashboard in browser** button (`vscode.env.openExternal` on the file).
2. **Header:** title, type badge, status, created/updated, author, verdict; if `parseIssues` is non-empty, a `{n} parse issues` link to the Raw state section. When the task has a next action (§ 7.2), a **primary button** labelled with it — e.g. **▶ Resume**, **▶ Start development** — sits at the right of the header (hidden in untrusted workspaces). For hosted dashboards, which cannot be modified, the same action is the `maister.runNextAction` editor-title button.
3. **Phases:** ordered list of registry phases with text-bearing glyphs — `✓ Completed`, `● Current — {activeForm}`, `◌ Not recorded`, `○ Upcoming`.
4. **Hero artifacts:** one card per existing hero — label, TL;DR, **Open** button.
5. **Decisions:** grouped by `source`; text + rationale.
6. **Risks:** open first; resolved shown struck through with a visible "Resolved" label.
7. **All artifacts:** the tier-2 file listing (`taskIndex.getDetail`), `.md` and `.html` only, ordered by top folder (`outputs`, `analysis`, `planning`, `implementation`, `verification`, `documentation`, `context`) then name. Registered artifacts show their **label** with the folder path as dimmed text; unregistered files show the file name; an `.md` with an `.html` twin appears once.
8. **Raw state:** collapsed `<details>` containing the `orchestrator-state.yml` text in an escaped `<pre>`, the list of `parseIssues`, and an **Open state file** button.

### 5.5 Dashboard mode (`webview/dashboardMode.ts`)

The full-width portfolio view: KPI tiles, four charts, then the filtered task table. *Revised at Phase 7 review to add charts; colour choices validated with the data-viz palette checker against the Dark+ surface.*

**1. KPI tiles** (row of four; each an icon on a solid colour disc + value + label + one-line context — never colour alone):

| Tile | Value | Context line | Icon / colour |
|---|---|---|---|
| Tasks | total indexed | `{n} created this week so far` | ◈ `--vscode-charts-blue` |
| Failed verification | `verdict = failed` | `of {completed} completed` | ✕ `--vscode-charts-red` |
| Quiet ≥ {quietDays} days | § 3.7 staleness count | `unfinished tasks` | ⏸ `--vscode-charts-orange` |
| Open risks | unresolved risks across all tasks | `across {k} tasks` | ⚠ `--vscode-charts-purple` |

**2. Filter bar:** active facets as removable chips + **Clear all**, and the note *"Charts show all tasks · click a bar to filter the table"*. Shares the one `TaskQuery` with Overview (§ 4.2).

**3. Charts** (2 × 2 grid; each card has a title, a scope line, and a **Table** link that swaps the chart for an accessible data table):

| Chart | Form | Data | Colour |
|---|---|---|---|
| Status | Labelled horizontal bars, one row per status, count at the end | all tasks by `status` | status palette: completed green, in progress blue, blocked orange, failed red; pending and unreadable as a **hatched neutral** |
| Verification | Labelled horizontal bars | verdicts of completed tasks: passed / passed with issues / no verdict / failed | passed green, with issues orange, failed red, no verdict hatched neutral |
| Workflow type | Labelled horizontal bars | all tasks by type | single hue (`--vscode-charts-blue`) — identity comes from the label and icon, not colour |
| Tasks created per week | Columns, last 12 weeks | tasks by ISO week of `created` | single hue; the current (partial) week drawn dashed and labelled as in progress; footnote counts tasks excluded for missing `created` |

- **Why bars, not stacked bars or donuts:** one value (completed) dwarfs the rest; stacked forms make 1–3-task segments vanish, and adjacent red/green/orange segments fail colour-vision separation. Separate labelled rows keep every count visible and remove adjacency.
- **Bars are filters:** each row is a `<button aria-pressed>`; pressing it toggles that facet (the pressed row is outlined). Charts always show **all** tasks; only the table is filtered. Week columns are not filters.
- **Hover:** each bar/column shows a tooltip with its exact count; the column chart shows a crosshair. Hit targets span the full row / column slot.
- **Theming:** colours come from `--vscode-charts-*` so light, dark and high-contrast themes supply their own values. Measured finding: VS Code's stock Dark+ green and orange sit outside the recommended lightness band and red/orange are close for deuteranopia — hence the mandatory secondary encoding (row labels, status icons, counts, hatching for neutral values).
- **Observable facts only:** counts and dates. No durations, throughput or "abandoned".

**4. Task table** — columns: Title · Type · Status / current phase · Verdict · Author · Created · Last activity · **Next**.
- Column headers are `<button>`s carrying `aria-sort`; sort persisted via `setState`. Rows open Task mode on click / `Enter`.
- Stale rows show `quiet {n}d` as text in Last activity. The Next cell holds a button with the task's next action (§ 7.2), or is empty.

**Data:** the extension posts `{ type: 'dashboard', kpis, charts, rows, filter }`, where `charts` are pre-aggregated counts over the whole index and `rows = taskIndex.query(filter)` capped at 1,000. Rendering is hand-written SVG/HTML — **no charting dependency**, keeping runtime dependencies at two.

### 5.7 Risks mode (`webview/risksMode.ts`)

*Added at Phase 7 review.* A portfolio-wide view of every **open risk**. The risks are recorded faithfully inside each task but are otherwise invisible in aggregate, which was Irena's stated pain.

**Entry points:** the Dashboard's **Open risks** KPI tile; `maister.openRisks` in the Overview title bar and the command palette; a task's **"N open risks"** row in Now and the fallback view's Risks heading, which open the mode pre-filtered to that task.

**Data:** risks come from the tier-1 index only: each task's `risks` (from `phase_summaries`) plus the § 7 *Open Questions / Risks* of every registered artifact. Duplicates within a task (same normalized text from state and artifact) are merged and keep the artifact as their source. Each risk carries `{ text, resolved, source, sourceKind: 'state' | 'artifact', taskRelPath }`.

**Honesty constraint:** Maister records risks as plain text with **no severity and no date**. The view never ranks by severity or shows risk age. Groups are ordered by the owning task's `activityMtime`, and a one-line note under the filters says so.

**Layout**
1. **Breadcrumb** `← Dashboard` (when opened from it) and heading `Open risks` with `{open} open across {k} tasks`.
2. **KPI tiles** (same component as § 5.5): Open risks · In unfinished tasks · In completed tasks (*carried past the end of the workflow*) · In failed-verification tasks.
3. **Filter bar:** risk-text search; the shared type facet chips; Task status toggles (Unfinished / Completed); **Show resolved** checkbox, off by default (resolved risks render struck through with a "Resolved" label); **Group by** Task *(default)* / Workflow type / Source.
4. **Groups** (cards; disclosure per group, state kept via `setState`):
   - Header: task title (opens Task mode) · type badge · status / current phase / verdict · relative activity · author · `{n} open` count · the task's **next action** button (§ 7.2) when it has one.
   - Rows: ⚠ risk text, with a source line: *"from `{artifact path}`"* (a link that opens the artifact in the reader) or *"recorded in `{phase_summaries key}`"*.
   - The first 10 groups start expanded; the rest collapsed. More than 50 groups adds **Show {n} more tasks**.

**Data flow:** `{ type: 'risks', kpis, groups, filter }`, built from the index on each snapshot publish. The filter here is local to Risks mode except the type facet, which is shared with Overview and Dashboard.

**Location type:** `PanelLocation` gains `{ mode: 'risks'; relPath?: string }` (`relPath` = task scope).

### 5.6 Message protocol

Every incoming message is validated: `type` on an allow-list, shape checked, `relPath` must exist in the index, `artifactRelPath` must resolve inside that task's folder. Invalid messages are dropped and logged.

| Direction | `type` | Payload | Sender / handler |
|---|---|---|---|
| webview → ext | `ready` | — | every webview |
| webview → ext | `navigate` | `{ href }` | shim (hosted dashboard, re-hosted companions) |
| webview → ext | `openTask` | `{ relPath }` | fallback, dashboard mode, Overview |
| webview → ext | `openArtifact` | `{ relPath, artifactRelPath, variant, anchor? }` | fallback, reader |
| webview → ext | `setFilter` | `{ patch: Partial<TaskQuery> }` | Overview, dashboard mode |
| webview → ext | `openSource` | `{ relPath, artifactRelPath? }` | fallback, reader |
| webview → ext | `runNextAction` | `{ relPath }` | Overview list, fallback header, dashboard mode — the extension recomputes the action from the index; the webview never supplies command text |
| ext → webview | `refresh` | — | shim |
| ext → webview | `stats` | aggregates | Overview |
| ext → webview | `dashboard` | `{ kpis, charts, rows, filter }` | dashboard mode |
| ext → webview | `risks` | `{ kpis, groups, filter }` | risks mode (§ 5.7) |
| ext → webview | `render` | Section 6 | reader |

---

## 6. Artifact Reading

The panel's `artifact` location (§ 5.1). Its job is the fix for the first pain the user named: **artifacts are always shown rendered, never as source.**

### 6.1 Variants and defaults

| Artifact | Variants | Default |
|---|---|---|
| `.md` with an `.html` companion | `md`, `html` | `md` (Area B: markdown default) — **unless** opened by clicking the `.html` link inside a hosted dashboard, then `html` |
| `.md` only | `md` | `md` |
| `.html` without an `.md` twin (e.g. `analysis/mockups/*.html`) | `html` | `html` |
| Images (`png`, `jpg`, `svg`, `gif`, `webp`) | — | `vscode.open` in VS Code's image preview |
| Anything else | — | `vscode.open` in a normal editor |

Variant switching is a **native editor-title action** `maister.panel.toggleVariant` (icon `preview` / `markdown`), visible when `maister.panel.variantAvailable`. No toggle UI is injected into a hosted companion.

### 6.2 Markdown variant — rendering pipeline (`panel/render.ts`)

All steps run in the extension host; the webview receives finished HTML.

1. **Read.** Files over **2 MB** are not rendered; the reader shows *"This artifact is too large to preview ({size})"* + **Open source file**.
2. **Summary.** Run `parseSummary` (§ 2.5) on the full text, then **remove the detected leading region from the body** so the TL;DR block is not shown twice. If detection finds nothing, the body is left intact.
3. **Parse** with `markdown-it` configured `{ html: false, linkify: true, typographer: false }`:
   - **`html: false`** turns any raw HTML in the markdown into escaped text. This is the sanitization strategy: the output contains only markdown-it-generated tags, so no sanitizer dependency is needed.
   - GFM tables are built in.
4. **Checklists** — a custom inline rule for list items starting `[ ]`, `[x]`/`[X]`, or `[~]` renders a non-interactive glyph with an accessible label:

   | Source | Rendered | `aria-label` |
   |---|---|---|
   | `[ ]` | ☐ | "not done" |
   | `[x]` | ☑ | "done" |
   | `[~]` | ⊘ | "skipped" |

   If a document contains any checklist items, the summary card gains **"Checklist: {done} of {total} done · {skipped} skipped"** — real per-step progress for `implementation-plan.md`.
5. **Heading anchors:** GitHub-style slugs as `id`s, de-duplicated with `-1`, `-2` suffixes; enables deep links.
6. **Link rewriting** (`link_open` renderer rule):

   | `href` | Rewritten to | On click |
   |---|---|---|
   | `#fragment` | unchanged | in-page scroll |
   | Relative, resolves to `.md`/`.html` **inside the task** | `href="#"` + `data-artifact="{taskRelPath}#{frag}"` | `openArtifact` in the panel |
   | Relative, resolves elsewhere **inside a workspace folder** (e.g. `src/auth/token.ts`) | `data-file="{workspaceRelPath}"` | `openFile` → `vscode.open` in an editor |
   | `http:` / `https:` | `data-external="{url}"` | `openExternal` → `vscode.env.openExternal` (VS Code's trusted-domain prompt applies) |
   | Anything else (`file:`, `command:`, `javascript:`, path escaping the workspace) | link removed, text kept | — |

7. **Images:** relative `src` inside `.maister/tasks` rewritten with `asWebviewUri`. Any other `src`, including remote URLs, is dropped and replaced by its alt text + *"(image not loaded)"*.
8. **Code blocks:** monospace (`--vscode-editor-font-family`), horizontally scrollable, **no syntax highlighting** (keeps the dependency count at two). Mermaid fences render as plain code blocks — known limitation (Section 8).
9. **Cache:** LRU of 30 rendered results keyed by `(path, mtime, size)`.

The extension posts:

```ts
{ type: 'render',
  location: PanelLocation,
  taskTitle: string,
  artifactLabel: string,
  summary: SummaryBlock | null,        // rendered as the pinned card
  checklist: { done: number; total: number; skipped: number } | null,
  bodyHtml: string,
  heroes: { label: string; artifactRelPath: string; current: boolean }[] }
```

### 6.3 Reader layout (`webview/reader.ts`)

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Auth token rotation  ›  Implementation Plan                    │  breadcrumb (task link)
│ [Specification] [Implementation Plan] [Verification]             │  hero chips (current pressed)
├──────────────────────────────────────────────────────────────────┤
│ ┌ Summary ─────────────────────────────────────────────────────┐ │  <aside aria-label="Summary">
│ │ TL;DR  …rendered markdown…                                   │ │
│ │ Key decisions  • … — rationale                               │ │
│ │ Open questions & risks  • …                                  │ │
│ │ Checklist: 14 of 22 done · 1 skipped                         │ │
│ └──────────────────────────────────────────────────────────────┘ │
│  …rendered body…                                                 │  <main>
└──────────────────────────────────────────────────────────────────┘
```

- **Breadcrumb** task link → Task mode for the parent task.
- **Hero chips** jump between the task's hero artifacts without returning to the task — Marek goes plan → verification in one click. This is what makes reading self-sufficient.
- **Summary card** omitted when `summary` is null. Resolved risks shown struck through with a visible "Resolved" label.
- Body inserted via `innerHTML` — safe because `bodyHtml` contains only markdown-it-generated markup (`html: false`) and the CSP forbids any script without the nonce.
- One delegated click handler routes `data-artifact`, `data-file`, `data-external` to their messages.
- Styling: VS Code theme variables only — body `--vscode-editor-foreground` / `--vscode-editor-background`, links `--vscode-textLink-*`, tables `--vscode-editorWidget-border`, and `.vscode-high-contrast` overrides for borders.

**Live update:** when the watcher reports a change to the open artifact (§ 3.5), it is re-rendered and re-posted. The reader stores `scrollY` in `setState` and restores it when the incoming location equals the current one — a plan being ticked off by the executor updates in place without jumping to the top.

### 6.4 HTML variant — companion re-hosting

Uses the **same three insertions as the hosted dashboard** (§ 5.3): CSP meta, `<base href>` set to the **artifact's own directory**, and the shim; inline scripts receive nonces. Companion markup and styling are untouched and follow the OS light/dark setting, as the dashboard does (Area E).

- The shim's **navigation interception** handles the companion's breadcrumb (`../dashboard.html` → Task mode), links to its markdown twin (→ `md` variant), and links to sibling companions (→ that artifact's `html` variant).
- The shim's data-loading patch is inert here — companions do not load `dashboard-data.js`.
- **Refused** (the `md` variant is shown instead, with a one-line notice) if the file contains `<iframe` or exceeds 2 MB.
- Remote fonts, images or scripts referenced by a companion or mockup are blocked by the CSP. The style guide requires companions to be self-contained, so this mainly affects hand-made mockups; recorded in Section 8.

### 6.5 Message protocol additions

| Direction | `type` | Payload | Handler |
|---|---|---|---|
| webview → ext | `openFile` | `{ workspaceRelPath }` | `vscode.open`; only if the path is inside a workspace folder |
| webview → ext | `openExternal` | `{ url }` | `vscode.env.openExternal`; only `http:` / `https:` |

### 6.6 Accessibility

- Semantic output: markdown-it headings, lists and tables (`<th>` in header rows).
- The summary card is an `<aside>` labelled "Summary".
- A "Skip to document" link is first in tab order.
- After each navigation, focus moves to the artifact heading.
- Checklist glyphs carry `aria-label`s.
- Link purpose is announced: external links get a visually hidden "(opens in browser)" suffix, workspace-file links "(opens in editor)".
- The hosted HTML variant inherits Maister's accessibility as-is — the unaudited-accessibility trade-off accepted in Phase 5.

---

## 7. Workflow Launching (`launch/launch.ts`)

**Boundary:** the extension composes `/maister:*` commands and hands them to an assistant or terminal. **It never writes task files and never runs a workflow itself.**

### 7.1 Commands and composed text

| Command | Available on | Composed text |
|---|---|---|
| `maister.startWorkflow` | Now/Overview title bars, welcome views | `/maister:{skill} {description}` |
| `maister.runNextAction` | Inline row buttons (Now, Overview list), fallback view header, Dashboard **Next** column, panel editor title | the task's next action (§ 7.2) |
| `maister.resumeTask` | Palette / context menu, when the task's next action is *Resume* | `/maister:work {task relPath}` |
| `maister.startDevelopmentFromDesign` | Palette / context menu, when the next action is *Start development* | `/maister:development {task relPath}` |
| `maister.designFromResearch` / `maister.developFromResearch` | Palette / context menu, on completed research tasks | see § 7.2 |

**Resume** uses `/maister:work` with the task path relative to its workspace folder. Maister's `work` command (`commands/work.md`, Step 1) detects an existing task folder and routes it to the correct orchestrator — including `migrations/` → migration — so one form covers all five types.

### 7.2 Next actions

*Added at Phase 7 review.* Launching is primarily **task-contextual**: every task carries at most one computed **next action** — the step Maister itself would take next — shown one click away wherever the task appears. Clicking a task still only *opens* it; the next action is always its own explicit button.

| Task state (from the index) | Next action | Label | Composed command | Extra input |
|---|---|---|---|---|
| `status ∈ {in_progress, pending, blocked, failed}` (any type) | `resume` | **Resume** | `/maister:work {relPath}` | — |
| `product-design`, `status = completed`, `outputs/product-brief.md` exists | `startDevelopment` | **Start development** | `/maister:development {relPath}` | — |
| `research`, `status = completed` | `fromResearch` | **Continue from research…** | chosen in a two-item prompt: **Design from this research** → `/maister:product-design {description} --research={relPath}` · **Develop from this research** → `/maister:development {description} --research={relPath}` | Description input box (§ 7.3 step 2), pre-filled with the research task's title |
| `status = unknown`, or completed development / migration / performance | none | — | — | — |

- `nextAction` is computed at index time and stored on each `Task` as `{ id: 'resume' \| 'startDevelopment' \| 'fromResearch' \| 'none', label: string }`.
- `maister.runNextAction` dispatches the composed command through the normal target resolution (§ 7.4), so it lands pre-filled in Claude Code, then Copilot, then the terminal, per `launch.targetOrder`.
- Both workflows accept `--research=PATH` (verified in the development and product-design skill definitions, Maister 2.2.3).
- The Resume action works for **any** unfinished task, including ones quiet for weeks — Maister's `work` command presents the resume options itself.
- Launch actions are hidden in untrusted workspaces (§ 8.1).

### 7.3 Start Workflow flow

1. **Choose type** (single-pick selection prompt): `Let Maister decide` → `work` *(first)*, `Development`, `Product design`, `Research`, `Migration`, `Performance` — each with a one-sentence description. This is an input prompt for the launch flow, not the Quick Pick navigation declined in Phase 5.
2. **Describe the task:** input box *"What should this workflow do?"* — 1–2,000 characters, not all whitespace; line breaks collapsed to spaces.
3. **Dispatch** to the first available target (§ 7.4).

### 7.4 Target resolution

**Setting** `maisterLens.launch.targetOrder`: ordered array of `'claudeCode' | 'copilotChat' | 'terminal' | 'clipboard'`.
**Default:** `["claudeCode", "copilotChat", "terminal", "clipboard"]`.

Users reorder or remove entries to change behaviour (e.g. `["terminal", "clipboard"]` = terminal only). The extension walks the list and uses the **first available** target. If an available target throws on dispatch, the error is logged to the output channel and the **next** target is tried. `clipboard` always succeeds, so a launch never silently fails. An empty or invalid array is treated as the default, with an output-channel warning.

| Target | Available when | Dispatch | Submit behaviour |
|---|---|---|---|
| **`claudeCode`** | `extensions.getExtension('anthropic.claude-code')` exists and, after `activate()`, `commands.getCommands(true)` includes `claude-vscode.editor.open` | `commands.executeCommand('claude-vscode.editor.open', undefined, command)` — opens a **new** Claude Code conversation with `command` pre-filled | **Pre-filled, not submitted** — the user presses Enter. The Claude Code extension offers no submit option. |
| **`copilotChat`** | `extensions.getExtension('GitHub.copilot-chat')` exists and `workbench.action.chat.open` is registered | `commands.executeCommand('workbench.action.chat.open', { query: command, isPartialQuery: !autoSubmit })` | Governed by `maisterLens.launch.autoSubmit` |
| **`terminal`** | always | § 7.5 | Governed by `maisterLens.launch.autoSubmit` |
| **`clipboard`** | always | `env.clipboard.writeText(command)` + message *"Maister command copied."* | n/a |

**Contract risk — Claude Code.** `claude-vscode.editor.open(sessionId, prompt, …)` is **not a documented public API**. Its signature was observed in Claude Code 2.1.278: passing `undefined` as the session starts a new conversation with the prompt pre-filled (the webview stores it as the session's `initialPrompt`; when it cannot be applied the extension reports *"Your prompt was not applied — enter it manually."*). The runtime command-existence check catches removal but not a signature change, so the integration test (Section 8) asserts pre-fill behaviour against the installed version. The extension's URI handler `vscode://anthropic.claude-code/open?prompt=…` routes to the same code path and is recorded as an alternative entry point should the command signature change.

**Caveat — Copilot.** `/maister:*` commands are Claude Code plugin skills. Copilot Chat receives the text but **can only run a Maister workflow if the user's Copilot setup provides Maister's skills** — the extension cannot verify this. The first time Copilot is used as a target, a one-time notice says so, with an **Adjust launch order** button that opens the `targetOrder` setting.

**Visible outcome:** after every dispatch, a 5 s status-bar message names the destination — *"Opened in Claude Code — press Enter to run"*, *"Sent to Copilot Chat"*, *"Sent to terminal '{name}' — press Enter to run"*, or *"Copied to clipboard"*.

### 7.5 Terminal target

The extension **cannot tell** whether a terminal is running Claude Code or sitting at a shell prompt, so it picks deterministically:

1. If `maisterLens.launch.terminalName` is set, use the open terminal with exactly that name.
2. Else, if exactly one open terminal's name matches `/claude/i`, use it.
3. Else, show a selection prompt listing each open terminal (active first, marked *(active)*) and **New terminal — start Claude Code**. The chosen name is remembered in `workspaceState` and tried first next time while a terminal with that name is open.

**Sending:**
- **Existing terminal:** `terminal.show(false)`; `terminal.sendText(command, autoSubmit)`. With `autoSubmit: false` (default) the command is typed but not run — the safety net if the terminal is actually a shell prompt.
- **New terminal:** `window.createTerminal({ name: 'Claude Code · Maister' })`, `show()`, then `sendText('claude ' + quote(command), autoSubmit)`. `quote` selected from `vscode.env.shell`:
  - POSIX: single quotes, embedded `'` written as `'\''`
  - PowerShell / pwsh: single quotes, embedded `'` doubled
  - `cmd.exe`: double quotes, embedded `"` doubled

  Windows quoting is best-effort and reviewed before running under the default.

### 7.6 Settings

Amends the Configuration table in § 1.3:

| Setting | Type | Default | Meaning |
|---|---|---|---|
| `maisterLens.launch.targetOrder` | `array` of enum `claudeCode`/`copilotChat`/`terminal`/`clipboard` (unique items) | `["claudeCode","copilotChat","terminal","clipboard"]` | Preference order; first available target is used |
| `maisterLens.launch.autoSubmit` | boolean | `false` | Submit immediately where the target allows it (Copilot Chat, terminal). Claude Code always pre-fills. |
| `maisterLens.launch.terminalName` | string | `""` | Preferred terminal name for the `terminal` target |

### 7.7 What launching deliberately does not do

- Does not detect or wait for the assistant to start, and does not read its output or the terminal's.
- Does not answer gates; they are answered wherever the workflow runs.
- Does not add flags (`--no-visual`, `--research=…`, `--from=…`). Pre-filling without submitting lets the user add them before pressing Enter.

After a workflow starts, its task appears in **Now** within about a second of Maister writing `orchestrator-state.yml` (§ 3.5). That is the only feedback loop — **file writes, never assistant or terminal output.**

---

## 8. Degraded Modes, Errors, Security, Accessibility & Acceptance Criteria

### 8.1 Degraded modes

| Situation | Behaviour |
|---|---|
| `html_output: false` for a task | No `dashboard.html` → Task mode uses the **fallback view**. Markdown reading unaffected; no `html` variants. |
| Dashboard vintage not recognized (§ 5.2) | Fallback view with the "version isn't supported" banner + **Open dashboard in browser** |
| `orchestrator-state.yml` unreadable | Task listed as **Unreadable**; fallback view shows raw text and `parseIssues`. Other tasks unaffected. |
| Standalone `.maister/tasks/mockups/*` (no state file) | **Not listed** — known limitation (§ 8.5) |
| `quick-dev` / `quick-plan` / `quick-bugfix` | Leave no task directory → **invisible** — known limitation |
| No `.maister/` in the workspace | Extension does not activate; if activated via a command, welcome views explain why |
| `git` missing / not a repository | Authors shown as "Author unknown"; Author facet still works ("Me" = none) |
| `files.watcherExclude` covers `.maister` | One-time notification; `Maister: Refresh` performs a full reconcile |
| Claude Code / Copilot not installed | Skipped in `targetOrder`; next target used |
| Artifact over 2 MB | "Too large to preview" + **Open source file** |
| Persisted index corrupt or version-mismatched | Silently rebuilt; one output-channel line |

**Workspace Trust** — declared as `"capabilities": { "untrustedWorkspaces": { "supported": "limited", "description": "…" } }`. In an **untrusted** workspace:
- The hosted dashboard and HTML companions are **not executed** (they contain model-authored scripts): Task mode always uses the fallback view, and artifacts render in the `md` variant only.
- **Launching is disabled** — launch commands hidden via `when: isWorkspaceTrusted`.
- Indexing, trees, Overview, Dashboard mode and markdown reading work normally.

**Remote & virtual workspaces:** `"extensionKind": ["workspace"]` — under Remote-SSH, WSL or Dev Containers the extension runs where the files live. `"virtualWorkspaces": false` — attribution requires `child_process`, indexing requires `FileSystemWatcher` on a real filesystem.

### 8.2 Error-handling rules

1. **Isolation:** a failure processing one task or artifact never affects another; every parse, stat and summary extraction is individually wrapped.
2. **The parser never throws** (Section 2). Every other fallible operation returns a renderable result — empty list, `null` with a reason, or the fallback view.
3. **One sink:** all internal errors go to the **Maister Lens** output channel with timestamp and task `relPath`.
4. **Notifications only when actionable:** the watcher-exclude warning, the one-time Copilot caveat, and index persistence failing **twice in a row** (the write is retried once after 5 s, then logged).
5. **Invalid webview messages** are dropped and logged, never acted on (§ 5.6).
6. **Wording rule:** no user-facing string may state that a task is "running", "waiting", "stalled" or "abandoned". Only observable wording is allowed — "written … ago", "quiet for …", "current phase", "not recorded". Enforced by test (AC13).

### 8.3 Security summary

| Threat | Control |
|---|---|
| Model-authored JavaScript (`dashboard-data.js`, companion scripts) | Runs **only** in webview sandboxes under a per-render nonce CSP with `default-src 'none'` — no network, no Node, no messaging API (the shim acquires it first). **Never evaluated by the extension host.** Disabled entirely in untrusted workspaces. |
| Model-authored markdown | `markdown-it` with `html: false` (raw HTML escaped); link scheme allow-list (`http(s)`, workspace-relative, in-task); images only from `.maister/tasks` |
| Path traversal via artifact links or registered paths | Every resolved path checked to lie inside the task folder (in-task targets) or a workspace folder (`openFile`); otherwise refused and logged |
| Command injection via attribution | `execFile` with an argument array — never a shell |
| Command text sent to a terminal | Composed only from a fixed skill name plus the user's own description or an index-sourced task path; not submitted by default |
| Untrusted webview → extension messages | Type allow-list, shape validation, index-membership check (§ 5.6) |

### 8.4 Accessibility

Against the project's frontend accessibility standard:
- **Keyboard:** every action in every extension-built webview is reachable via Tab/Enter/Space; tiles and sort headers are `<button>`s; table rows open on `Enter`.
- **Focus:** always visible using `--vscode-focusBorder`; moved to the new heading after in-panel navigation.
- **Contrast & themes:** extension-built surfaces use VS Code theme variables exclusively and are verified in Light, Dark, High Contrast and High Contrast Light.
- **Semantics:** `aria-pressed` on tiles, `aria-sort` on headers, `role="status"` on "Updating…", `<aside aria-label="Summary">`, reader skip link, full spoken labels on tree items (§ 4.3).
- **Never colour alone:** status, verdict and staleness always also appear as text.
- **Accepted exception:** the hosted dashboard and hosted companions retain Maister's own markup, unaudited against this standard (Phase 5 trade-off).

### 8.5 Known limitations (first release)

1. Standalone `mockups/` tasks are not listed (no state file).
2. `quick-*` workflows leave no trace and are not shown.
3. The hosted dashboard and companions follow the OS light/dark setting, not the VS Code theme.
4. No full-text search over artifact bodies.
5. No syntax highlighting or Mermaid rendering in markdown.
6. Remote images and fonts are not loaded.
7. Attribution credits whoever first committed the state file.
8. A skipped phase and an unrecorded completion are indistinguishable ("not recorded").
9. The workflow registry is pinned to Maister 2.2.3; newer phases show by raw id.
10. The Claude Code launch target relies on an undocumented command signature.
11. Copilot Chat can run Maister commands only if the user's Copilot setup provides Maister's skills.

### 8.6 Test strategy

Testing standards are not initialized for this project; this section proposes them.
- **Unit** (mocha, no VS Code host): `parseState` against every hazard fixture (§ 2.6), `parseSummary`, phase derivation, query engine, `recognize()`, the HTML insertion pass, link rewriting, shell quoting, target-order resolution with mocked availability.
- **Integration** (`@vscode/test-electron`, fixture workspace): activation, index build and persistence, watcher-driven updates, Now tree contents, Overview tiles/search/list, Overview↔Dashboard filter sharing, next-action computation and dispatch, panel mode switching, message validation, Workspace Trust gating, target dispatch with a stub terminal.
- **Performance:** a generator writes 300 realistic task folders (mixed types, statuses, vintages) for cold/warm start measurement.
- **Manual verification checklist:** hosted dashboard rendering and live refresh against real Maister tasks; Claude Code pre-fill against the installed extension version; the four themes; a screen-reader pass through Now, the Overview list and the reader.

### 8.7 Acceptance criteria

| # | Criterion | Verified by |
|---|---|---|
| AC1 | A task appears in **Now** within 1.5 s of its `orchestrator-state.yml` being created, and its description updates within 1.5 s of each rewrite | Integration |
| AC2 | Current phase and `not_recorded` gaps match expected values for every hazard fixture | Unit |
| AC3 | Opening a task with a recognized `dashboard.html` renders Maister's dashboard **with its data** and no CSP violations; a `dashboard-data.js` change re-renders within 1.5 s | Integration + manual |
| AC4 | Clicking an artifact link inside the hosted dashboard opens that artifact **in the same panel** — no browser, no new editor tab, no source view | Integration |
| AC5 | Every `.md` artifact opened through the extension renders with its summary card when present; **no `.md` or `.html` artifact is ever displayed as source** via extension navigation, except through the explicit **Open source file** action | Integration |
| AC6 | An `html_output: false` fixture shows the fallback view with banner, phases, decisions and risks | Integration |
| AC7 | Searching a phrase present only in a task's recorded decision returns that task marked `matched in decision`, in under 100 ms over 300 tasks | Unit + perf |
| AC8 | Clicking a Dashboard chart bar toggles that facet and filters only the table, while charts keep showing all tasks; every chart's **Table** link shows the same counts as a table. Activating an Overview tile or searching updates Overview's task list in place; **Open Dashboard** from the Overview title bar opens Dashboard mode with the same filter; **Clear Filters** resets both | Integration |
| AC9 | Warm start publishes the cached snapshot in under 300 ms; cold index of 300 tasks completes in under 5 s | Perf |
| AC10 | A corrupt state file lists its task as Unreadable while every other task indexes correctly | Unit + integration |
| AC11 | With Claude Code installed, **Start Workflow** opens a new Claude Code conversation with the command pre-filled; with `targetOrder: ["terminal"]` it goes to the terminal unsubmitted; with nothing else available it copies to the clipboard | Integration + manual |
| AC12 | Next actions match § 7.2 for every state: **Resume** composes `/maister:work .maister/tasks/{segment}/{name}` for all five types (including `migrations/`); a completed product-design with a brief offers **Start development**; a completed research task offers both research continuations with `--research={relPath}`; completed development/migration/performance tasks offer none | Unit |
| AC13 | No user-facing string contains "running", "waiting", "stalled" or "abandoned" | Unit (string-table lint) |
| AC14 | Every command and control is operable by keyboard alone; tree items expose status in accessible labels | Manual + integration |
| AC15 | In an untrusted workspace no hosted HTML executes, Task mode uses the fallback view, and launch commands are unavailable | Integration |
| AC16 | In a fixture repository with two authors, Overview's **Mine** toggle lists only the current user's tasks; uncommitted tasks show "Not committed" | Integration |
| AC17 | The next action is reachable in one click from a task's Now row, Overview row, task view and Dashboard row, and clicking the task title itself never launches anything | Integration |
| AC18 | Risks mode lists every unresolved risk from state and from artifact § 7 blocks exactly once per task, grouped by task in descending last activity; no severity or age is displayed; **Show resolved** reveals resolved risks struck through | Integration |

**Mapping to Phase 2 success criteria:**
- "Live answer without leaving the editor" → AC1, AC3, AC17
- "Rendered, always" → AC4, AC5, AC6
- "Recall in seconds" → AC7, AC8, AC9 (full-text excluded by decision)
- "Honest state" → AC2, AC10, AC13, AC18
