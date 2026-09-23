# Product Brief — Maister Lens

## TL;DR
Maister Lens is a VS Code extension that makes Maister's output visible and navigable without leaving the editor, and it always shows artifacts rendered, never as source.
Its sidebar has two views: **Now** (every unfinished task) and **Overview** (counts, filters, search and the task list). One reusable panel switches between Task, Artifact, Dashboard (KPI tiles and charts) and Risks modes.
Each task carries a one-click **next action** (Resume, Start development, or Continue from research). It's sent pre-filled to Claude Code, then Copilot, then the terminal, and never submitted without the user.
It is built to be honest: a parser that never throws, no guessed states, no durations, and no severities Maister doesn't record.
The design is ready to hand off to `/maister:development`, with an eight-section implementation spec, 18 acceptance criteria and six approved mockups.

## Key Decisions
- Scope is Maister tasks only. Git is used solely to attribute tasks to authors, never as a browsable feature.
- Task mode hosts each task's own `dashboard.html` unmodified, with its data loaded natively inside the webview sandbox. Tasks without a hostable dashboard get a native fallback view.
- Markdown is rendered in the extension with the TL;DR / Key Decisions / Risks block pinned. Maister's styled HTML companions open on request.
- A persisted two-tier index searches metadata and each artifact's summary block. There's no full-text search in the first release.
- Now lists every unfinished task with no time window, because colleagues' tasks reach a working copy only after they're completed.
- Launching is task-contextual (next actions), with a configurable target order: Claude Code, then Copilot Chat, then terminal, then clipboard.

## Open Questions / Risks
- The Claude Code launch target depends on an undocumented command signature, `claude-vscode.editor.open(sessionId, prompt)`, observed in Claude Code 2.1.278.
- Copilot Chat can run `/maister:*` commands only if the user's Copilot setup provides Maister's skills.
- The hosted dashboard and companions follow the OS light/dark setting rather than the VS Code theme, and their accessibility is unaudited.
- Performance targets (warm start under 300 ms, cold index of 300 tasks under 5 s) are specified but not yet measured.
- `vision.md` still promises a view of repository changes and needs amending. Testing standards are not yet initialized.

---

## Layer 0 — Core Brief

### Problem
Maister produces large amounts of well-structured output quickly: phase state, decisions, risks, specs, plans, verification verdicts and 13 kinds of styled HTML report. All of it is reachable only as files. VS Code's file explorer can't show what a task is or what state it's in, and clicking an HTML report displays its **source code**. Maister's own `dashboard.html` solves this for one task at a time, in a browser, outside the editor.

*Full detail: `analysis/problem-statement.md`.*

### Target users
Contributors who are distinguished by which workflows they use, **not** by a reader/writer role. Everyone contributes to their own tasks and reads everyone else's, through one reading experience.
- **Marek**, an engineering contributor, builds through Maister (development, migrations). The Now view is his working surface.
- **Ada**, a business-oriented contributor, runs product-design and research workflows and reads engineering output. For her the plugin is the way in.
- **Irena**, a delivery lead, needs portfolio oversight: failed verifications, stalled tasks and open risks in aggregate.

### Feature overview

| Surface | What it does |
|---|---|
| **Now** (sidebar tree) | Every unfinished task in the working copy, newest activity first: current phase, last recorded decision, recent artifacts, open risks, and an inline ▶ next action |
| **Overview** (sidebar webview) | Search, Mine/Everyone, status/type/attention tiles, and the filtered task list grouped by type with next-action buttons. Title-bar actions: Open Dashboard, Open Risks, Group By, Clear filters, Refresh. |
| **Task mode** (panel) | Hosts the task's own Maister `dashboard.html` unmodified, or a clearly labelled native fallback view with phases, key artifacts, decisions, risks, raw state and the next-action button |
| **Artifact reader** (panel) | Rendered markdown with a pinned summary card, checklist progress, chips to jump between key artifacts, and in-panel link navigation. The styled HTML companion is available as a toggle. |
| **Dashboard mode** (panel) | Four KPI tiles, four charts that double as filters (status, verification, workflow type, created per week), and the filtered task table with a Next column |
| **Risks mode** (panel) | Every open risk across tasks, grouped by task with its source and the task's next action. No severity or age is shown, because Maister records neither. |
| **Launching** | Next actions (Resume · Start development · Continue from research) and Start Workflow…, sent pre-filled per `maisterLens.launch.targetOrder` |

*Full detail: `analysis/feature-spec.md` §§ 1–8.*

### Constraints
1. Maister keeps no task registry. Tasks are found by globbing for `orchestrator-state.yml`.
2. Parsing must be tolerant. The schemas are prose followed by an LLM, and real files drift.
3. Hundreds of tasks require a persisted, change-stamped index.
4. The extension never asserts what isn't on disk: no "running", "waiting", "stalled" or "abandoned".
5. Webview CSP: model-written JavaScript runs only in the sandbox, never in the extension host.
6. Degraded modes are normal: `html_output: false`, unrecognized dashboard versions, unreadable state.
7. Only two runtime dependencies: `yaml` and `markdown-it`.

### Success criteria
1. **Live answer without leaving the editor.** "What is my task doing?" is answered from the sidebar.
2. **Rendered, always.** No artifact is ever shown as source through the extension's own navigation.
3. **Recall in seconds.** A task or past decision is found among hundreds without the file explorer or grep.
4. **Honest state.** Nothing is displayed that can't be justified from files on disk.

### Acceptance criteria (condensed)
AC1–AC18 in `analysis/feature-spec.md` § 8.7. The critical ones:
- AC1: Now updates within 1.5 s of a state write.
- AC4 and AC5: artifacts open rendered in the same panel.
- AC7: decision search in under 100 ms across 300 tasks.
- AC9: warm start in under 300 ms; cold start for 300 tasks in under 5 s.
- AC11 and AC17: next actions are one click away and land pre-filled.
- AC13: none of the forbidden state words appear.
- AC15: untrusted workspaces execute no hosted HTML.
- AC18: every open risk is listed once per task, with no invented severity.

---

## Layer 1 — Persona Cards

| | Marek (engineering) | Ada (business) | Irena (delivery lead) |
|---|---|---|---|
| **Workflows** | development, migrations | product-design, research | occasional research |
| **Primary surface** | Now → reader | Overview → reader | Dashboard, Risks |
| **Core need** | Follow and judge his own running task; reach the spec, plan and verification in one move | Documents, not files; know what's worth reading | Aggregate trouble: failed verifications, quiet tasks, open risks |
| **Next action they use most** | Resume | Start development (from her briefs); Continue from research | Resume (via the task's owner) |

*Full cards and journeys: `analysis/personas.md`.*

---

## Layer 2 — Design Decisions

| Area | Decision |
|---|---|
| A — Presentation | Tree (Now) + Overview webview view + one reusable webview panel |
| B — Rendering | In-extension markdown with the summary block pinned; HTML companions re-hosted on request |
| C — Data | Persisted two-tier index (metadata and summary blocks eager, bodies lazy); no full-text search |
| D — Navigation | Now + Overview (Browse merged in at Phase 7); panel modes Task, Artifact, Dashboard and Risks; no Quick Picks |
| E — Maister dashboard | Each task's own `dashboard.html` hosted with its styling unmodified; tolerant YAML parser for everything else |
| Launching | Task next actions; configurable target order: Claude Code → Copilot → terminal → clipboard |

Decisions that changed after convergence and are recorded in the spec:
- Dashboard data is loaded natively in the sandbox rather than passed by message (§ 5.3).
- Browse was merged into Overview (§ 4).
- Now has no time window (§ 4.1).
- Next actions were added (§ 7.2).
- The Dashboard gained validated charts (§ 5.5).
- Risks mode was added (§ 5.7).
- The extension is named **Maister Lens**.

*Full rationale: `analysis/design-decisions.md`. All 20 alternatives considered: `analysis/alternatives.md`.*

---

## Layer 3 — Mockup References

HTML mockups in VS Code Dark+ (approved at Phase 7), in `analysis/mockups/`:

| Screen | File |
|---|---|
| Sidebar — Now + Overview (tiles, filtered task list, next actions) | `analysis/mockups/sidebar-now-overview.html` |
| Task mode — native fallback view | `analysis/mockups/task-fallback-view.html` |
| Artifact reader — Implementation Plan | `analysis/mockups/artifact-reader-implementation-plan.html` |
| Dashboard mode — KPI tiles, charts, table | `analysis/mockups/dashboard-mode.html` |
| Open risks | `analysis/mockups/open-risks.html` |
| Start Workflow flow → Claude Code pre-fill | `analysis/mockups/start-workflow-flow.html` |

The hosted Maister dashboard is intentionally not mocked up, because it is Maister's existing UI shown unmodified. Design-resource discovery: `analysis/design-context/design-resources.md`.

---

## Follow-ups outside the build
- **Amend `vision.md`.** Key feature #3 ("top layer view over all maister and repository changes") should become "top layer view over all Maister tasks". Its success criteria can take this brief's four.
- **Ratify testing standards.** § 8.6 of the spec proposes unit tests (mocha), integration tests (`@vscode/test-electron`), and a 300-task performance generator. Record them via `/maister:standards-update`.
- **Re-verify the Claude Code pre-fill** (AC11) whenever the Claude Code extension updates.

## References
- `analysis/design-context.md`: inventory of Maister's data (task types, state schema, artifacts, dashboard)
- `analysis/problem-statement.md`: problem, scope, constraints, success criteria
- `analysis/personas.md`: three personas and the cross-persona requirements matrix
- `analysis/alternatives.md` (and `.html`): 20 alternatives across 5 decision areas
- `analysis/design-decisions.md` (and `.html`): the chosen direction and its trade-offs
- `analysis/feature-spec.md` (and `.html`): the implementation-ready specification
- `analysis/mockups/*.html`: approved screens
