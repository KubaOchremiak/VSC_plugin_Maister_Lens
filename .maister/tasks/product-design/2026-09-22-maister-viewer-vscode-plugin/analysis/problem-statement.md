# Problem Statement — Maister Viewer VS Code Extension

## TL;DR
Maister produces high-quality structured output fast, but it is reachable only as files — and VS Code's file explorer is the wrong instrument for it, to the point that clicking an HTML companion shows source instead of the rendered report.
The primary job is live monitoring of a workflow running in the integrated terminal one pane away; orientation and decision recall across hundreds of tasks come second.
Contributors are differentiated by workflow affinity (business-oriented toward product-design, engineering-oriented toward development/migrations), not by a reader/writer split — everyone reads others' tasks and contributes to their own, through one identical reading experience.
Scope is Maister-only, read plus workflow launching, never mutating task state; git is permitted solely as a data source for task attribution.
The binding constraints are tolerant parsing, an indexing layer for hundreds of tasks, and a rule that the plugin never asserts what it cannot observe on disk.

## Key Decisions
- Repository/git change viewing is out of scope — no Maister data backs it, and correlation would have to be invented from scratch.
- The plugin may launch and resume workflows by sending commands to the integrated terminal, but never writes task files itself.
- Gate-blocked state is shown as factual activity (current phase, last write, quiet-for-N) rather than inferred, because Maister does not record it.
- Personas are differentiated by workflow affinity, not read/write role (Phase 3 correction) — and reading someone else's task uses the same view as reading your own.
- Task attribution is inferred from git authorship of the task directory, since Maister records no author field — git as data source only, never as a browsable feature.
- Success criteria are proposed here because `vision.md` leaves them undefined.

## Open Questions / Risks
- Search spans four modes at once (metadata, decisions/risks, full-text, structured facets) against hundreds of tasks — the single largest scope and performance driver, and it partly overlaps VS Code's built-in search.
- Rendering artifacts inside the extension duplicates work Maister's `dashboard.html` and HTML companions already do; the boundary between reusing and reimplementing them is unresolved.
- `vision.md` still promises a "top layer view over all maister and repository changes" and needs amending to match the agreed scope.
- Maister's schemas are prose followed by an LLM, so artifact and state shapes will drift; the parsing layer carries permanent tolerance requirements.
- A meaningful slice of Maister usage (`quick-dev`, `quick-plan`, `quick-bugfix`) writes no task directory and is therefore structurally invisible to any viewer.

---

## 1. The Problem

Maister produces a large volume of well-structured, high-quality output — phase state, decisions, risks, specifications, implementation plans, verification verdicts, research reports, mockups, and thirteen kinds of styled HTML companion — and it produces that output quickly.

Every bit of that value is reachable only as files on disk.

VS Code's file explorer is the wrong instrument for reading it. It presents a tree of `analysis/`, `implementation/`, `verification/` folders with no sense of what a *task* is, what state that task is in, which phase is running, or which of its two dozen files actually matters. Worse, the editor actively defeats Maister's best output: clicking a `.html` companion opens its source code rather than the rendered report. The framework invests real effort in producing readable, styled documents, and the default editor behavior throws that away.

Maister does ship a per-task `dashboard.html`, and it is good — but it solves exactly one task, renders in a browser outside the editor, requires deliberately locating and opening a file, and has no visibility across tasks.

The net effect: work the framework has already done well is hard to see, hard to navigate, and hard to share with anyone who is not already reading raw files.

## 2. Job To Be Done

**Primary: "What's happening right now?"**

The dominant use is monitoring a workflow that is actively running — in the Claude Code session in VS Code's own integrated terminal, one pane away from the plugin. The operator wants live visibility of phase progress, decisions as they are recorded, and artifacts as they land, without switching to a browser or hunting through the file tree.

**Secondary: orientation and recall.**

Returning to a project and needing its overall shape (what ran, what finished, what stalled), and recovering a past decision or risk from a task completed weeks earlier.

## 3. Who It Is For

*Superseded and refined during Phase 3 — see `analysis/personas.md` for the full cards.*

There is **no reader/writer separation**. Every contributor is both: a contributor on their own tasks and a reader of everyone else's. What differentiates people is **workflow affinity**, not role capability — a business-oriented contributor lives in `product-design` tasks, an engineering-oriented one in `development` and `migrations`.

`vision.md`'s "analytics-developer" framing holds, but not as a separate passive audience: it describes a contributor whose affinity is analytical and visual rather than code-first.

Critically, **reading someone else's task requires no different view from reading your own.** Ownership affects which tasks you look at, not how you read them.

## 4. Scope

**In scope**
- Maister tasks across all five orchestrator types (`development`, `product-design`, `research`, `migrations`, `performance`).
- Live monitoring of in-flight workflows: current phase, progress, decisions, risks, artifacts as they are registered.
- Cross-task browsing with search and filtering — spanning task metadata, decisions and risks, full artifact text, and structured facets (type, status, date, verification outcome).
- Rendered reading of artifacts — both markdown and the HTML companions — inside the extension's own surface.
- Launching and resuming Maister workflows by composing `/maister:*` commands and sending them to the integrated terminal.

- Task attribution via git authorship — reading `git log` over a task directory to learn who authored it, because Maister records no author field.

**Out of scope**
- Repository and git change viewing: commits, branches, diffs, changed-file history as a browsable surface. No Maister data supports it. (Git is permitted strictly as a *data source* for task attribution, never as a feature surface.)
- Writing or mutating `orchestrator-state.yml`, artifacts, or any workflow state.
- Answering orchestrator gates from the plugin UI — gates are answered in the session driving the workflow.

## 5. Constraints

1. **No registry exists.** Maister maintains no index of tasks. Discovery is by globbing `.maister/tasks/*/*/` and treating a folder as a task only if it contains `orchestrator-state.yml` — exactly what Maister itself does.
2. **Tolerant parsing is mandatory, not defensive polish.** Maister's schemas are prose specifications followed by an LLM, not code-enforced contracts. Real files drift: the live example already carries three fields absent from the published schema, `phase_summaries` keys differ between workflows, `options` appears at two different nesting levels, and one summary entry is a list where every sibling is a map.
3. **Scale forces an indexing layer.** Hundreds of tasks in a single long-lived project, combined with full-text search, rules out eager parsing on activation. Lazy loading, caching, or a persisted index is required.
4. **Never assert what cannot be observed.** Maister does not record gate-blocked state — the rule is gate fires, user answers, *then* state is written. The plugin therefore presents factual activity (current phase, last write time, quiet-for-N) and lets the user draw conclusions, rather than inferring "waiting for input."
5. **Webview CSP.** Maister's `dashboard.html` loads data by injecting a `<script src="dashboard-data.js?t=…">` tag, which VS Code's nonce-based webview CSP blocks. Relative artifact links also require `asWebviewUri()` or command URIs. The existing dashboard is a design reference, not a droppable asset.
6. **Degraded modes are normal, not edge cases.** `html_output: false` removes the dashboard and all HTML companions, leaving markdown and state only. `.maister/tasks/mockups/*/` has no state file. `quick-dev`, `quick-plan` and `quick-bugfix` write no task directory at all.
7. **`dashboard-data.js` is JavaScript, not JSON** — a `window.MAISTER_DATA = {…};` assignment with no JSON twin — and it is a lossy projection of the state file.
8. **Greenfield.** No `package.json`, no source, no build tooling, no committed tech decisions beyond the intent to use TypeScript and the VS Code Extension API. Project standards exist for global coding style and frontend (accessibility, components, CSS, responsive); backend and testing standards are not initialized.

## 6. Success Criteria

Proposed here — `vision.md` records these as "to be defined."

1. **Live answer without leaving the editor.** An operator can answer "what is my running workflow doing right now?" from the sidebar, without switching to a browser or opening a file.
2. **Rendered, always.** A reader can open any completed task and read its decisions, risks and reports as rendered documents — never as source — without knowing what a task directory is or where it lives.
3. **Recall in seconds.** Finding a specific task, or a decision made in a past task, takes seconds among hundreds of tasks and never falls back to the file explorer or grep.
4. **Honest state.** The plugin never displays a status it cannot justify from files on disk.

## 7. Key Assumptions

- Maister's Artifact Summary Contract (the mandated TL;DR / Key Decisions / Open Questions block opening every markdown artifact) remains stable enough to parse for previews and search. It is the one structure guaranteed across all workflows.
- The Claude Code session driving workflows runs in the same VS Code window, in the integrated terminal — making file-watch latency negligible and the terminal reachable for launching commands.
- `vision.md` will be amended so its third key feature no longer promises repository-change viewing.
- Maister's plugin version may advance underneath the extension; each task directory holds a copy of `dashboard.html` pinned to the version that created it, so artifact shapes vary by task age.
