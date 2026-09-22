# Design Context — Maister Viewer VS Code Extension

## TL;DR
Maister writes five orchestrator task types under `.maister/tasks/<type>/YYYY-MM-DD-name/`, each anchored by an `orchestrator-state.yml` and a terser `dashboard-data.js` projection, plus 50+ markdown artifact kinds — 13 of which get self-contained `.html` companions.
There is **no task registry and no git linkage anywhere** in Maister's data; a viewer must glob the tasks tree, and the vision's "top layer over repository changes" has no existing data source behind it.
Every markdown artifact opens with a mandated TL;DR / Key Decisions / Open Questions block (§ 7 contract), which is the single richest parse target for list previews.
The existing `dashboard.html` is a 32 KB self-contained file-protocol viewer that polls every 5 s; its data-loading trick (dynamic `<script src>`) is blocked by VS Code webview CSP, so reuse is not copy-paste.
Project is greenfield: no `package.json`, no code — TypeScript + VS Code Extension API are intended but unconfirmed.

## Key Decisions
- Treat `orchestrator-state.yml` as the source of truth and `dashboard-data.js` as an optional accelerator — the latter is a lossy projection and absent when `html_output: false`.
- Scope the artifact model around the § 7 summary contract rather than per-artifact bespoke parsers — it is the one structure guaranteed across all workflows.
- **Repository/git integration is out of scope** (user decision, Phase 1 gate). The plugin is a view layer over Maister tasks and artifacts only.

## Open Questions / Risks
- ~~The vision's third key feature ("top layer view over all maister **and repository** changes") is not backed by any Maister data~~ — **resolved: git integration declared out of scope at the Phase 1 gate.** `vision.md` should be amended so its third key feature no longer promises repository-change viewing.
- Maister artifact schemas are prose specifications followed by an LLM, not enforced by code: real files drift (the live task file already carries three fields absent from the published schema). Parsing must be tolerant by design.
- `phase_summaries` keying is inconsistent across workflows (semantic names vs `phase-N`), and `options` appears both nested under `orchestrator:` and at top level.
- `.maister/tasks/mockups/*/` has no `orchestrator-state.yml` at all — the "a task is a folder with a state file" rule leaves it invisible.
- No code exists yet, so every tech-stack assumption (bundler, test runner, webview framework) is still open.

---

## 1. Project Documentation Context

Sources: `.maister/docs/INDEX.md`, `.maister/docs/project/vision.md`, `.maister/docs/project/tech-stack.md`.

**Vision.** Maister produces well-structured output in both HTML and JSON. The premise is that people with a more analytical profile — who prefer visual formats over reading code — could be brought into development work, and that because changes are produced very quickly, reviewing and filtering them should key off *the AI framework's outputs* rather than code and git.

Target users: "modern era analytics-developers using Visual Studio Code who want a productivity boost without leaving their editor and diving into code."

Three named key features:
1. Visual access to all flows and artifacts created by Maister.
2. A browser of completed tasks with search and filter.
3. A top-layer view over all Maister **and repository** changes.

Success criteria and differentiators are explicitly "to be defined."

**Tech stack.** Greenfield — no `package.json`, no source files, no build tooling. Intended: TypeScript, VS Code Extension API on the Node.js extension host, npm + `tsc` (or esbuild/webpack), ESLint + Prettier, distribution via `vsce` to Marketplace / Open VSX. The stack doc marks all of this as recommended defaults pending confirmation. Webview UI is listed as "only relevant if webview-based UI panels are added later" — i.e. not yet a decision.

**Standards that will constrain implementation.** Global standards (coding style, commenting, error handling, minimal implementation, validation, conventions) and Frontend standards (accessibility, components, CSS, responsive) are initialized. Backend and Testing standards are not. The frontend standards will apply to any webview UI; accessibility and design-token guidance in particular.

**Reference model named by the user.** GitLens — specifically the property that the extension is *self-sufficient*: it delivers its full functionality without forcing the user to jump around the VS Code UI.

## 2. The Data Surface: What Maister Actually Produces

Evidence base: Maister plugin 2.2.3 at `/Users/jakub/.claude/plugins/cache/maister-plugins/maister/2.2.3/`, normative spec in `skills/orchestrator-framework/references/orchestrator-patterns.md`.

### 2.1 Task types and layouts

| Directory | Orchestrator | `task.type` | State file |
|---|---|---|---|
| `development/` | development (14 phases) | `development` | yes |
| `product-design/` | product-design (9 phases, 0–8) | `product-design` | yes |
| `research/` | research (6 phases) | `research` | yes |
| `migrations/` | migration (8 phases) | `migration` | yes |
| `performance/` | performance (9 phases) | `performance` | yes |
| `mockups/` | mockup-studio standalone | — | **no** |

Note the pluralization inconsistency: the skill is `migration`, the directory is `migrations/`, and `task.type` is `migration`.

Directory naming is `YYYY-MM-DD-kebab-case-name`; the date prefix is a *name*, not a timestamp.

**Workflows that produce no task directory at all**: `quick-dev`, `quick-plan`, `quick-bugfix` (explicitly "no orchestrator state, no task directory, no subagents"). The `reviews-*` commands write into an existing task directory but never create one. A meaningful share of Maister usage therefore leaves no trace a viewer could show.

Per-type layouts (condensed):
- **development**: `analysis/` (codebase-analysis, clarifications, gap-analysis, scope/technical-clarifications, `design-context/` with mockups + INDEX.md + brief.md, `research-context/`), `implementation/` (spec, requirements, implementation-plan, visual-coverage, work-log, tdd-red/green-gate), `verification/` (spec-audit, implementation-verification, e2e-verification-report, visual-fidelity, code-review-report, pragmatic-review, production-readiness-report, reality-check), `documentation/user-guide.md`.
- **product-design**: `context/` (user drop-zone + README), `analysis/` (design-context, problem-statement, personas, alternatives, design-decisions, feature-spec, `mockups/`), `outputs/product-brief.md`.
- **research**: `planning/` (research-brief, research-plan, sources), `analysis/findings/*` (dynamic categories, N gatherer files) + `synthesis.md`, `outputs/` (research-report, solution-exploration, high-level-design, decision-log).
- **migration**: `analysis/` (current-state-analysis, target-state-plan, requirements, rollback-plan, dual-run-plan), `implementation/`, `verification/` (+ compatibility-test-results), `documentation/migration-guide.md`.
- **performance**: `analysis/` (codebase-analysis, performance-analysis, `user-profiling-data/`, requirements), `implementation/`, `verification/`.

### 2.2 `orchestrator-state.yml`

Common block: `orchestrator.{started_phase, completed_phases[], failed_phases[], auto_fix_attempts{}, options{}, created, updated, task_path, task_ids{}}` and `task.{title, description, status, tags[], priority}`.

`task.status` ∈ `pending | in_progress | completed | failed | blocked`. Derived progress: the active phase is the first phase not in `completed_phases`.

Domain extensions, one per workflow, each with its own `phase_summaries` sub-tree:
- `task_context` (development) — includes `task_characteristics` (`has_reproducible_defect`, `modifies_existing_code`, `creates_new_entities`, `involves_data_operations`, `ui_heavy`), `research_reference`, `design_reference`.
- `design_context` (product-design) — `design_characteristics` (6 booleans), `complexity_level`, `refinement_iterations`, `visual_companion`.
- `research_context` — `research_type`, `research_question`, `scope`, `confidence_level`, `gathering_strategy`.
- `migration_context` — `migration_type`, `current_system`, `target_system`, `migration_strategy`, `breaking_changes[]`, plus a top-level `external_research` sibling.
- `performance_context` — `bottlenecks_identified`, `bottleneck_priorities` (p0–p3).
- `verification_context` (shared) — `last_status`, `issues_found[]`, `fixes_applied[]`, `reverify_count`.

Shared `phase_summaries.[phase]` base shape: `{summary, decisions: [{decision, rationale}], risks: [string], artifacts: [{path, label, html}]}`, merged with domain-specific fields.

**Parsing hazards, all confirmed:**
- YAML is authored by a model, so both block and flow styles appear in the same file.
- `phase_summaries` keys are semantic names in development/performance/product-design but `phase-N` in research.
- `options` is nested under `orchestrator:` in the live file but shown at top level in two SKILL.md schemas.
- `task_context.phase_summaries.clarifications` is a **list**, while every sibling is a map.
- The live product-design state file carries `project_doc_paths`, `project_context_summary`, `next_phase` — none of which appear in the published schema.
- Resume logic *removes* phases from `completed_phases` when their artifacts are missing, so state can shrink between reads.
- `task_ids` are ephemeral per Claude Code session and not a durable identifier.
- An abandoned task stays `in_progress` forever; `completed` is written only at finalization.

### 2.3 `dashboard-data.js` and `dashboard.html`

`dashboard-data.js` is a single statement — `window.MAISTER_DATA = {...};` — rewritten in full at init, phase start, before every exit gate, after every completion and gate decision, and at finalization. It is **JS, not JSON**; there is no `.json` twin. Live example: 3.5 KB.

Schema: `{generated, task{title,type,status,description,path,current_activity}, characteristics{}, phases[{id,name,icon_hint,status,started,completed,skip_reason,summary,decisions[],risks[],artifacts[],gate}], verification{status,issues[],fixes[],reverify_count}}`. `icon_hint` ∈ `analysis|spec|plan|code|verify|docs|done`. Issue severity ∈ `critical|warning|info`.

`dashboard.html` is a maintained plugin asset copied verbatim into each task root — 615 lines, 32,629 bytes, fully self-contained (inline style + script, inline SVG icons, system fonts, zero external resources, no fetch). It loads data by injecting `<script src="dashboard-data.js?t=<now>">`, polls every 5 s, re-renders only on content change, and preserves expanded-phase state across renders. It has a `HERO_MAP` per task type selecting 3–4 hero artifacts, renders decisions/risks/verification drawers, and supports light/dark via `prefers-color-scheme`.

**Consequences for a VS Code viewer** (these are facts, not decisions):
- Dynamic `<script src>` injection is blocked under VS Code's nonce-based webview CSP; data would need `postMessage` or inlining.
- Relative `href`s to `.md`/`.html` siblings require `webview.asWebviewUri()` or command URIs.
- Each task holds a *copy* of `dashboard.html` pinned to the plugin version that created it; old tasks carry old copies.
- Nothing notifies on write — 5 s polling is Maister's only freshness mechanism. A VS Code extension has `FileSystemWatcher` available instead.
- `html_output: false` suppresses `dashboard.html`, `dashboard-data.js`, and all `.html` companions, leaving markdown + state only.

### 2.4 Artifacts

Roughly 50 distinct artifact kinds across the five workflows. Thirteen get self-contained `.html` companions: `spec`, `implementation-plan`, `implementation-verification`, `e2e-verification-report`, `visual-fidelity`, `research-report`, `solution-exploration`, `high-level-design`, `decision-log`, `alternatives`, `design-decisions`, `feature-spec`, `product-brief`. Companions follow a fixed skeleton (breadcrumb nav → header with type badge → stat tiles → TL;DR section → optional TOC → main) and are self-contained with relative links only.

**The § 7 Artifact Summary Contract is the key structural affordance.** Every markdown artifact in a task directory must open with:

```markdown
## TL;DR
[3-5 lines: what this artifact concludes / recommends / delivers]

## Key Decisions
- [decision] — [one-line rationale]

## Open Questions / Risks
- [question or risk]
```

Sections are omitted entirely when empty (never "None"), so all three are optional. Heading text varies slightly in practice ("Open Questions & Risks"), so matching must be loose. Exempt: `orchestrator-state.yml`, `dashboard-data.js`, raw mockups, screenshots, and `work-log.md`.

Other parseable internal structures:
- `implementation-plan.md` — `### Task Group N:` headings with GFM checkboxes `- [ ]` / `- [x]` / `- [~]` (skipped), giving real per-step progress. UI groups carry a `**Visual References:**` block.
- `spec.md` — fixed section set (Goal, User Stories, Core Requirements, Visual Design, Reusable Components, Technical Approach, Implementation Guidance, Out of Scope, Success Criteria).
- `product-brief.md` — layered (Layer 0 core, Layer 1 personas, Layer 2 decisions, Layer 3 mockups), with layer presence mirrored in state.
- `design-context/INDEX.md` — markdown table with stable IDs (`screen:add-allergy-form`, `component:severity-badge`).
- Verification verdicts — ✅ Passed / ⚠️ Passed with Issues / ❌ Failed, rewritten (not appended) after fixes with a `## Fix & Re-Verification History` section.
- `work-log.md` — append-only, `## [ISO timestamp] - Group N Complete` entries carrying `**Files Modified**: [list]` as prose.

### 2.5 Cross-cutting findings

- **`.maister/config.yml`** has exactly two keys: `html_output` (default true) and `mockup_format` (`html` | `ascii`, default html).
- **No git linkage exists.** An exhaustive grep of the plugin found no commit SHA, branch name, or changed-file list persisted in any state file, dashboard projection, or artifact schema. The only record of touched files is prose inside `work-log.md`. Development's final phase produces a commit message *template* and does not commit or record anything.
- **No task index or registry exists.** Maister itself discovers tasks by globbing `.maister/tasks/*/` and treating a folder as a task **iff it contains `orchestrator-state.yml`**. A viewer must do the same — and `.maister/tasks/mockups/*/` will fail that test.
- **`.maister/docs/`** (INDEX.md, `project/`, `standards/`) is project documentation, not task data. The only write from a task workflow back into it is implementation-verifier optionally ticking items in `project/roadmap.md`.

## 3. Cross-Reference: Vision vs. Available Data

| Vision feature | Data available | Assessment |
|---|---|---|
| Visual access to all flows and artifacts | `orchestrator-state.yml` + phase/artifact registries + 13 HTML companions | **Fully supported.** Richest area; the § 7 contract makes previews cheap. |
| Browser of completed tasks with search/filter | Glob + per-task state parse; `task.status`, `tags`, `task_characteristics`, `design_characteristics`, timestamps | **Supported, but requires building an index.** No registry exists; `completed` is unreliable (abandoned tasks stay `in_progress`). Full-text search means reading artifact bodies. |
| Top-layer view over Maister **and repository** changes | Maister side: yes. Repository side: **nothing** | **Scoped down to Maister only.** Git correlation would have to be built from scratch (no shared key between a task and a commit exists; `work-log.md` prose file lists are the only bridge). Declared out of scope at the Phase 1 gate — the "top layer" is over Maister tasks and artifacts. |

## 4. Implications for Design

1. **Tolerant parsing is a first-class requirement, not defensive polish.** Maister's schemas are prose followed by an LLM. A viewer that assumes schema conformance will break on real repositories — the live example already deviates in three fields.
2. **The § 7 summary block is the product's leverage point.** It is the only guaranteed structure across every artifact and workflow, and it maps directly to the vision's "review changes based on the AI framework's outputs, not code and git."
3. **Self-sufficiency (the GitLens property) conflicts with Maister's file-based artifacts.** Markdown and HTML companions naturally open in VS Code's own editor and browser. Delivering them "without jumping around the VS Code UI" implies rendering them inside the extension, which raises real questions about webview vs. editor and about duplicating the existing dashboard's work.
4. **Git is out.** With repository-change viewing excluded, the product's entire value rests on making Maister's own outputs navigable. That raises the bar on the artifact-browsing experience: it is no longer one feature among three, it is the product.
5. **Greenfield means the extension's own architecture is fully open** — tree views, webviews, virtual documents, custom editors, and the package.json contribution surface are all undecided.
6. **A meaningful share of Maister activity is invisible** (quick-dev, quick-plan, quick-bugfix leave no artifacts), which bounds what "top layer over all Maister changes" can honestly mean.

---

*Sources*: `.maister/docs/project/{vision,tech-stack}.md`, `.maister/docs/INDEX.md`, `.maister/config.yml`, Maister plugin 2.2.3 skills and orchestrator-framework references, live task directory at `.maister/tasks/product-design/2026-09-22-maister-viewer-vscode-plugin/`.
