# Codebase Analysis Report

**Date**: 2026-09-22
**Task**: Implement the Maister Lens VS Code extension (greenfield TypeScript)
**Description**: Implement the Maister Lens VS Code extension as specified in analysis/design-context/feature-spec.md and brief.md: sidebar Now tree + Overview webview, reusable panel with Task/Artifact/Dashboard/Risks modes, persisted two-tier index of .maister/tasks/**/orchestrator-state.yml, next-action launching to Claude Code/Copilot/terminal/clipboard.
**Analyzer**: codebase-analyzer skill (2 Explore agents: File Discovery + Context Discovery, Pattern Mining)

---

## TL;DR
The repo has no source code, build setup or tests. The whole extension is new work, fully specified in feature-spec.md (1214 lines, layout § 1.4, ACs § 8.7).
The main risk is external data formats, not integration with existing code. Maister state files vary across workflow types and plugin versions. dashboard-data.js is sometimes a JS object literal rather than JSON. The launch commands for Claude Code and Copilot are undocumented.
The parser must be tolerant, the host must never parse or eval dashboard-data.js, and Task mode must fall back cleanly when there is no dashboard.
Resolve the ten spec gaps listed below, plus the conflict between skip_test_suite:true and the test strategy, before planning.

## Key Decisions
- Greenfield scaffold exactly per spec § 1.4 (esbuild two targets, TS strict, engine ^1.90.0) — no existing code to integrate with; spec is the single source of structure.
- Runtime dependencies limited to `yaml` + `markdown-it` — the spec requires it and it matches the minimal-dependencies standard; record the reason for each in README/tech-stack.md.
- Treat orchestrator-state.yml as the only source of truth; dashboard-data.js is optional and lossy — the data file may not be valid JSON (object literal in product-design sample), and it omits some state.
- Discover tasks by glob `.maister/tasks/*/*/orchestrator-state.yml` and do not derive the type from the folder name — migration tasks live in `migrations/` (plural).
- Parse phase_summaries under any `*_context` or at the top level, with either semantic keys or `phase-N` keys, and phases starting at 0 or 1 — observed drift across the dev, research and product-design schemas.
- Identify the hosted dashboard with a structural signature (dashboard-data.js reference, MAISTER_DATA, inline script, no `<iframe>`), not a version marker — dashboard.html carries no version stamp. Plugin 2.1.7-era tasks have no dashboard at all.
- Use `phase_summaries.*.artifacts[].html` as the source of truth for companion HTML — the patterns.md § 9 table is incomplete.
- Pre-fill only, never auto-send, for Claude Code (2nd positional arg to `claude-vscode.editor.open`) and Copilot (`{query, isPartialQuery:true}`) — a plain string sent to Copilot is submitted immediately.
- Pin `@types/vscode` to `~1.90.0` — installed VS Code is 1.138.0, so pinning keeps the code honest against the declared engine floor.
- Reuse the two real task folders as the base for test fixtures (spec § 2.6), plus a synthetic hazard set — they are real drifted samples at no extra cost.

## Open Questions / Risks
- **Test strategy conflict**: state has `skip_test_suite: true`, but spec § 8.6 defines a unit, integration and performance suite, and the ACs reference those suites. Confirm the scope with the user.
- **Spec gaps** (fix these in the spec or clarifications before planning):
  1. § 4.2 Overview message list does not match the § 5.6 table. No setGroupBy or group-collapse message is defined.
  2. `src/webview/risksMode.ts` (§ 5.7) is missing from the § 1.4 layout.
  3. `maisterLens.openRisks` is missing from the § 1.6 menu addenda.
  4. Command-palette invocation of launch commands that take a task argument is unspecified (quick pick, or hide them?).
  5. The hosted dashboard follows the OS theme, not the VS Code theme (accepted, but document it).
  6. design-resources.md says charts are forbidden, while spec § 5.5 requires 4 hand-written SVG charts. The spec wins.
  7. README and CHANGELOG are required by the conventions standard but do not exist.
  8. AC11 depends on an undocumented Claude Code command. Fallback: `vscode://anthropic.claude-code/open?prompt=`.
  9. The spec's size is in tension with the minimal-implementation standard.
  10. Performance and integration tests need a 300-task fixture generator, a two-author git fixture and a stub terminal.
- **Undocumented launch APIs**: `claude-vscode.editor.open` was observed in Claude Code 2.1.278. If a session is already open, it ignores the prompt ("prompt was not applied"). Copilot Chat is built into VS Code 1.138 (copilot-chat 0.66.0 in the app bundle), so `getExtension` checks must allow for that.
- **Toolchain on Node v26.7.0** (very new): check that esbuild, mocha and @vscode/test-electron work early. `code` is not on PATH, so point test-electron at `/Applications/Visual Studio Code.app` or let it download a build.
- **Webview CSP hosting**: dashboard.html injects `<script src="dashboard-data.js?t=…">` dynamically. This needs nonce injection via the shim's appendChild/insertBefore patch, a `<base href>` set to the task folder's webview URI, and a check that `?t=` query strings resolve through asWebviewUri.
- **Status semantics**: task.status stays `in_progress` for interrupted tasks, and waiting at a gate is never recorded. AC13 forbids the words running, waiting, stalled and abandoned in any user-facing string.
- **Doc drift**: tech-stack.md says webviews are "not applicable", there is "no persistence" and there are "no dependencies"; vision.md says "repository changes". Both conflict with the design and need updating after implementation.
- **Hygiene**: there is no .gitignore, and the modified `.playwright-mcp/console-*.log` is being tracked. Add .gitignore entries for node_modules, dist, *.vsix, .vscode-test/ and .playwright-mcp/.

---

## Summary

The repository holds only project docs and Maister task folders: a product-design task with a real dashboard, plus this development task containing the design context and 6 HTML mockups. The implementation will be built entirely from feature-spec.md. The main analysis work was mining the Maister data formats that the extension consumes (the state schema per workflow type, the summary-block contract, dashboard.html loading mechanics, HERO_MAP) and the launch-target APIs. Complexity comes from tolerant parsing, webview security and the breadth of the spec, not from existing code.

---

## Files Identified

### Primary Files (inputs that define the work)

**.maister/tasks/development/2026-09-22-maister-lens-vscode-extension/analysis/design-context/feature-spec.md** (1214 lines)
- The authoritative spec: layout (§ 1.4), contributions (§ 1.6), index (§ 3), views (§ 4), panel modes (§ 5), next actions (§ 7.2), tests (§ 8.6) and ACs (§ 8.7).

**.../analysis/design-context/brief.md** (148 lines)
- The product brief: scope and intent.

**.../analysis/design-context/design-decisions.md** (126 lines), **design-context.md** (167), **personas.md** (143), **design-resources.md** (31), **INDEX.md** (26)
- Rationale, user context and visual resources. design-resources.md conflicts with the spec on charts; the spec wins.

**.../analysis/design-context/mockups/*.html** (6 files: sidebar-now-overview, dashboard-mode, task-fallback-view, artifact-reader-implementation-plan, open-risks, start-workflow-flow)
- Visual targets for the views and panel modes.

**.maister/tasks/product-design/2026-09-22-maister-viewer-vscode-plugin/** (orchestrator-state.yml, dashboard.html, dashboard-data.js, analysis/, ...)
- A real fixture: product-design schema with drift, and a dashboard-data.js written as an unquoted object literal. Named as a fixture in spec § 2.6.

**Maister plugin 2.2.3 `skills/orchestrator-framework/assets/dashboard.html`** (615 lines, external)
- The reference for hosting: loadData (lines 582–612), HERO_MAP (249–276), aLink (330), prefers-color-scheme theming (37).

**Maister plugin `patterns.md` §§ 4, 7, 8, 9** (external)
- The state schema, the summary-block contract and the companion table (which is incomplete).

### Related Files

**.maister/docs/project/tech-stack.md**, **vision.md**
- Need updating after implementation to reflect webviews, persistence, dependencies and the exclusion of repo changes.

**.maister/docs/standards/global/*.md** (6), **standards/frontend/*.md** (4)
- The standards that apply. There are no testing or backend standards; the spec's § 8.6 proposals can be ratified via /maister:standards-update.

**.maister/config.yml**
- `html_output: true`, `mockup_format: html`.

**README.md** (1 line), **CLAUDE.md**
- README must be rewritten with the extension's docs.

**Reference extensions** (installed, read-only): `42crunch.vscode-openapi-5.9.0` (readable tsc output showing activitybar, trees and webview CSP templates in `out/webapps/web-view.js` and `out/preview.js`); `anthropic.claude-code-2.1.278-darwin-arm64` (webview views, CSP, launch command signatures).

### Files to Create (none exist)
package.json, tsconfig.json, esbuild script, .eslintrc/eslint.config, .prettierrc, .editorconfig, .gitignore, .vscodeignore, .vscode/{launch,tasks,extensions}.json, CHANGELOG.md, LICENSE, media/maister.svg, `src/**` (per § 1.4 + risksMode.ts), `test/{fixtures/tasks,unit,integration}`.

---

## Current Functionality

There is no current functionality: this is a greenfield build. The behaviour of the external formats the extension consumes is described below.

### Key Components/Functions (to build, per spec § 1.4)

- **model/parseState.ts**: never throws. Implements rules N1–N15 and tolerates schema drift.
- **model/parseSummary.ts**: extracts the § 7 block from the first 8 KB. Matches both "Open Questions / Risks" and "Open Questions & Risks".
- **model/workflows.ts**: registry pinned to Maister 2.2.3 covering 5 workflows with their phases and heroes (mirrors HERO_MAP).
- **index/taskIndex.ts**: tier 1 persisted to `context.storageUri/index-v1.json` `{schemaVersion:1, registryVersion:'2.2.3'}`. Invalidated by mtime and size. Atomic write (.tmp then rename), debounced 2 s, flushed on deactivate, rebuilt silently if corrupt. Tier 2 is an LRU of 20 TaskDetail entries.
- **index/watcher.ts**: watches `.maister/tasks/**`. Debounces 250 ms per task, publishes snapshots at most every 500 ms, refreshes relative times every 60 s.
- **index/attribution.ts**: runs one `git log --diff-filter=A` per repo via execFile with a 10 s timeout.
- **views/nowTree.ts** (TreeDataProvider) and **views/overviewView.ts** (WebviewViewProvider, nonce CSP, getState/setState).
- **panel/panel.ts**: singleton `maister.panel` with its own back/forward history (max 50). Modes: Task, Artifact, Dashboard, Risks. **hostDashboard.ts** makes exactly three HTML insertions; **render.ts** uses markdown-it (html:false, linkify, allowlisted link rewrite, images only from .maister/tasks, refuses files over 2 MB).
- **launch/launch.ts**: tries targets in `targetOrder` sequence: claudeCode, copilotChat, terminal, clipboard. Terminal selection uses terminalName, else the single terminal matching /claude/i, else a picker; the choice is remembered in workspaceState. Shell quoting is applied. A 5 s status bar message names the destination.

### Data Flow

findFiles (per workspace folder) → parseState → tier-1 Task records (persisted) → snapshot publish → Now tree and Overview webview. Selecting a task opens the panel. Task mode builds a tier-2 TaskDetail from phase_summaries, parseSummary and HERO_MAP artifacts. If a recognised dashboard.html exists, it is hosted in Dashboard mode. The shim routes link clicks and window.open to `navigate` messages. The host validates each message (type allowlist, shape, index membership, path containment) and then opens Artifact mode or an external link. When the watcher detects a change, the index updates and the webview receives `refresh`, which calls `window.loadData?.(false)`. Next action: derived per § 7.2, then the launch target chain.

### External Format Facts (from Pattern Mining)

- **State schema**: `orchestrator{started_phase, completed_phases[], failed_phases[], auto_fix_attempts, options, created, updated, task_path, task_ids}`; `task{title, description, status pending|in_progress|completed|failed|blocked, ...}`; `verification_context`; `phase_summaries.X{summary, decisions[{decision,rationale}], risks[str], artifacts[{path,label,html}]}`.
- **Per type**:

| Type | Folder | Context key | Phases |
|---|---|---|---|
| development | `development/` | `task_context` (summaries nested, semantic keys) | phase-1..14 |
| research | `research/` | `research_context` (summaries keyed phase-N; top-level options) | phase-1..6 |
| product-design | `product-design/` | `design_context` (semantic keys) | phase-0..8 |
| migration | `migrations/` (plural) | `migration_context` | phase-1..8 |
| performance | `performance/` | `performance_context` (summaries nested) | phase-1..9 |

- **Observed drift**: options may sit under `orchestrator` rather than at the top level. Some files lack `task_ids`. Some have `auto_fix_attempts` that is empty or only partly filled. Some summaries lack a `summary` field, and some have extra fields.
- **Dashboard loading**: no fetch. The page injects `<script src="dashboard-data.js?t=…">` every 5 s and compares `JSON.stringify(window.MAISTER_DATA)`; onerror is silent. A risk counts as resolved if it matches `/^resolved:/i` or `/\(resolved\b/i`. Phases with status completed or skipped count toward progress.
- **Links**: relative `<a target="_blank" rel="noopener">`. The HTML twin is listed first, then an "md" link. Companions carry the breadcrumb `../dashboard.html`. Mockups contain root-absolute `/` and `/screen/…` links, which are dead, so mockups are non-navigable.
- **Next-action commands**: resume with `/maister:<type> <task-path>`; the migration command is `migration` while its folder is `migrations`. Do not generate `--from` (its values are undefined). The resume point is the first phase not in completed_phases. Handoffs: product-design → `/maister:development <path>`; research → development `--research=<path>` or product-design `--research=<path>`. The router is `/maister:work`.

---

## Dependencies

### Imports (What This Depends On)

- `vscode` API ^1.90.0: views, webviews, FileSystemWatcher, workspace trust, storageUri.
- `yaml`: tolerant parsing of state files.
- `markdown-it`: artifact rendering with html:false.
- Node `child_process.execFile` (git and terminal commands, no shell), `fs`, `path`, `crypto` (32-byte nonce).
- External commands (undocumented): `claude-vscode.editor.open`, `workbench.action.chat.open`.
- Dev: typescript, esbuild, @types/vscode ~1.90.0, @types/node, @vscode/test-electron, mocha, eslint, prettier, @vscode/vsce.

### Consumers (What Depends On This)

- None in the codebase. The external consumers are end users, the Claude Code and Copilot chat inputs (fed through launch), and the terminal.

**Consumer Count**: 0 files
**Impact Scope**: Low for the code, since nothing breaks elsewhere. It is medium for the external contract, because the extension depends on Maister formats and undocumented commands.

---

## Test Coverage

### Test Files

- None exist. Spec § 8.6 plans:
  - **Unit tests** (mocha, no VS Code host): parser hazard fixtures, summary parsing, phase derivation, query, recognize(), HTML insertion, link rewrite, shell quoting, target resolution.
  - **Integration tests** (@vscode/test-electron): activation, index persistence, watcher, views, filter sharing, next actions, panel modes, message validation, trust gating, stub terminal.
  - **Performance tests**: a 300-task generator (cold start under 5 s, warm under 300 ms, search under 100 ms).
  - **Manual checks**: hosted dashboard, Claude pre-fill, 4 themes, screen reader.

### Coverage Assessment

- **Test count**: 0
- **Gaps**: all coverage is still to be built. There are no testing standards, and `skip_test_suite: true` conflicts with the plan. At minimum, the pure logic called out by the ACs should get unit tests: parser (AC2, AC10), next actions (AC12), query (AC7), CSP insertion and recognize() (AC3), shell quoting and target order (AC11).

---

## Coding Patterns

### Naming Conventions

- **Identifiers**: extension id `maister-lens`, display name "Maister Lens", setting and command prefix `maisterLens.*`. View, container and panel ids use `maister.*` (e.g. `maister.now`, `maister.overview`, `maister.panel`).
- **Files**: camelCase `.ts` modules grouped by domain folders (`model/`, `index/`, `views/`, `panel/`, `launch/`, `webview/`).
- **Context keys**: `maister.overview.filtered`, `maister.panel.mode|canGoBack|canGoForward|variantAvailable|hasNextAction`. Tree `viewItem` format: `task.{type}.{status}.next-{id}`.

### Architecture Patterns

- **Style**: functional modules for pure logic (parsers, query, derivation), kept free of the VS Code host so they can be unit-tested. Classes are used only where the VS Code API requires providers or a panel singleton. Everything is disposed via `context.subscriptions`.
- **State Management**: an in-memory index plus a persisted tier 1. Webviews are stateless (`retainContextWhenHidden: false`) and restore through getState/setState. The host is the authority, and every webview message is validated.
- **Error handling**: one "Maister Lens" output channel as the central sink. Parsers degrade gracefully (an unreadable task is shown as Unreadable). A failed index write is retried once after 5 s.
- **Security**: nonce CSP, `enableCommandUris: false`, localResourceRoots restricted, no eval of task content, execFile without a shell. Untrusted workspaces are in limited mode (no hosted HTML, no launch).
- **Frontend**: VS Code theme CSS variables as tokens, semantic HTML with ARIA (aria-pressed, aria-sort, aria-expanded, role=status), focus visible via `--vscode-focusBorder`, a fluid Overview layout at 250–400 px. Shared tile, row, summary card and chip components.

---

## Complexity Assessment

| Factor | Value | Level |
|--------|-------|-------|
| File Size | ~20+ new source files, spec 1214 lines | High |
| Dependencies | 2 runtime + ~9 dev + 2 undocumented external commands | Medium |
| Consumers | 0 internal | Low |
| Test Coverage | 0 tests (greenfield), large planned suite | High |

### Overall: Complex

Integration risk is low because there is no existing code. The scope is broad, though: two views, a four-mode panel with history, a persisted index with watcher, git attribution, webview CSP hosting of third-party HTML, and a four-target launcher. Correctness also depends on drifted external formats.

---

## Key Findings

### Strengths
- The spec is exhaustive: precise layout, contributions, CSP, settings and measurable ACs.
- Real fixtures are already in the repo (a product-design task with a dashboard, and this dev task).
- The Claude Code extension (2.1.278) is installed and its command signatures were verified. Copilot Chat is bundled with VS Code 1.138.
- The Maister formats are now well characterised, including their drift.

### Concerns
- Undocumented launch APIs (AC11) could break with extension updates.
- dashboard-data.js is not always JSON, so the host must never parse it.
- Hosting dashboard.html under a strict CSP depends on the shim correctly patching the dynamically inserted script.
- Spec size is in tension with the minimal-implementation standard, and there are ten spec gaps.
- Node 26 toolchain compatibility is unverified.
- The test plan conflicts with the task option.

### Opportunities
- Keep the model and index logic free of the VS Code host so it is fast to unit-test.
- Build the fixture generator once and reuse it for the performance and integration tests.
- Ratify the testing standards proposed in § 8.6 via /maister:standards-update.
- Use the 42crunch extension's readable CSP and webview templates as a reference.

---

## Impact Assessment

- **Primary changes**: new `package.json`, `tsconfig.json`, esbuild config, and `src/**` per § 1.4 plus `src/webview/risksMode.ts`, `media/maister.svg`.
- **Related changes**: README.md (rewrite), CHANGELOG.md (new), .gitignore/.vscodeignore (new), `.maister/docs/project/tech-stack.md` and `vision.md` (update), possibly new testing standards.
- **Test updates**: new `test/fixtures/tasks` (the real folders plus hazard fixtures: html_output:false, 2.1.7-era, corrupt YAML, migrations folder, two-author git), `test/unit`, `test/integration`, and a performance generator.

### Risk Level: Medium

No existing code or consumers can break. The risk comes from external contracts (undocumented launch commands, drifted formats, third-party HTML under CSP), the breadth of the spec, the open spec gaps and toolchain novelty.

---

## Recommendations

**New capability, greenfield:**

1. **Scaffold first.** Build package.json (contributions § 1.6 including openRisks), tsconfig strict, dual-target esbuild, eslint and prettier, .gitignore and .vscodeignore, .vscode launch config. Verify the build and a mocha run on Node 26 before writing any feature code.
2. **Build bottom-up by layer:**
   1. `model/` (types, workflows registry, parseState, parseSummary), with hazard-fixture unit tests.
   2. `index/` (taskIndex, persistence, watcher, attribution).
   3. `views/` (Now tree, Overview).
   4. `panel/` (Task and Artifact modes, then Dashboard hosting, then Risks).
   5. `launch/`.

   Each layer depends only on the layers before it.
3. **Parser contract.** It never throws and returns an `Unreadable` task on failure. It locates phase_summaries in any `*_context` or at the top level, accepts both semantic and `phase-N` keys, and reads options from `orchestrator` or the top level. It infers the type from state or the registry, never from the folder name alone.
4. **Dashboard hosting.** recognize() by structural signature. Make exactly the three insertions. The shim handles nonce patching of appendChild/insertBefore, the refresh bridge and link interception. Test the `?t=` query resolution early with the real product-design dashboard.
5. **Launch.** Detect Claude Code with `getExtension('anthropic.claude-code')`. Call `executeCommand('claude-vscode.editor.open', undefined, prompt)` and fall back to the `vscode://anthropic.claude-code/open?prompt=` URI. Call Copilot with `{query, isPartialQuery: !autoSubmit}`. Clipboard is the always-succeeding last resort. Wrap each target in try/catch and advance to the next.
6. **Security.** Centralise webview message validation in one host module (type allowlist, shape, index membership, path containment) and test it directly.
7. **Resolve the spec gaps** and the test-scope question in the gap-analysis and clarification phases before writing the implementation plan.
8. **Close out** by updating README, CHANGELOG, tech-stack.md and vision.md, and proposing the testing standards.

---

## Next Steps

Invoke the gap-analyzer to turn the ten spec gaps and the `skip_test_suite` conflict into clarification questions. Then run specification and planning, using the layered order above as the grouping for task groups.
