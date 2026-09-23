# Implementation Plan: Maister Lens — VS Code Extension

## TL;DR
Twelve task groups, greenfield, bottom-up: de-risk (A18 resource resolution + Node 26 toolchain) → manifest/hygiene → model → index → views → panel core → the four panel modes → launch → harnesses → docs & signed manual checklist → gap review.
Groups 2 and 3 run in parallel after group 1; groups 5, 6 and 9 run in parallel after group 4; groups 7 and 8 fan out from group 6.
Every group carries 2–8 named tests mapped to the ACs the spec's authoritative **Verified by** column assigns to a harness that can actually run them; AC3/AC4/AC11/AC14 manual remainders are signed checklist items in group 11, never automation.
Six approved mockups plus `component:hosted-dashboard` are bound to groups 5–9 through `Visual References`; `visual-coverage.md` proves 100 % coverage.
Expected 63 automated tests across groups 1–10, plus up to 10 gap tests in group 12.

## Key Decisions
- Group 1 is the de-risking group and carries only the scaffold the two probes need (esbuild, mocha, `@vscode/test-electron`, the two runtime deps, one fixture task snapshot) — the A18 `?t=` cache-buster resolution check runs before any feature code, per spec § "Risk handled first".
- `package.json` ownership is split: group 1 creates it with dependencies and scripts; group 2 owns every `contributes` block. No other group edits it, so nothing serializes on it later.
- Manifest work (group 2) is testable without implementations — its five tests are JSON-shape assertions over `contributes` (A4 `commandPalette: when:false` set, A15 view-title rows, capabilities, settings) plus `npm ls --prod --depth=0` and the git-hygiene check.
- Views, panel core and launch (5, 6, 9) all depend only on the index (4) and the manifest (2), so the executor can run three groups concurrently; their file sets are disjoint.
- Audit item I8 (forcing an untrusted workspace under `@vscode/test-electron`) is resolved in group 6, where AC15 is first asserted, and reused by group 10 rather than re-invented.
- Audit item I5 (insert the CSP meta **after** the existing `<meta charset>`) is folded into group 6's insertion pass as a rule, with its own test.
- Group 11 declares **zero automated tests**: its deliverable is a signed manual checklist. Inventing tests for manually-verified criteria would contradict A16 and `global/minimal-implementation.md`.
- The DOM (Playwright) harness is one group (10) rather than a slice inside each UI group, because it needs all five generated bundles present before a single stub of `acquireVsCodeApi` can serve them all.

## Open Questions / Risks
- **Shared-file contention:** `src/strings.ts` is written in group 3 but appended to by groups 5–9 as each surface's copy is authored. It is declared in all six groups so the executor serializes them; groups 5, 6 and 9 otherwise parallel will be ordered on that file alone.
- **A18 may fail.** If the webview resource resolver rejects the `?t=` query, group 1 must apply the pre-authorised contingency (shim strips the query; else `recognize()` returns `'unrecognized'` for every vintage) and group 6's hosted-dashboard scope shrinks to the fallback path. Group 1 must report which branch it took before group 6 starts.
- **`test:min` against VS Code 1.90.0 can never exercise the `claudeCode` target** (Claude Code 2.1.278 declares `engines.vscode: ^1.94.0`, audit I6). Group 9 must not chase it.
- **AC11's pre-fill path is unverifiable in automation** — the Claude Code command signature is undocumented and ignores the prompt when a session is already open. Group 9 gets a mocked-`executeCommand` unit test only; the real check is a group 11 checklist item.
- **`setGroupBy` has no in-webview sender** (audit I2). Group 5 must either name the control that sends it or drop it from the A2 allowlist — an allowlist entry with no caller is attack surface. Recorded as a group 5 decision point.
- Test volume (≈63) exceeds the generic 16–34 guideline. The spec's own per-group limit of 2–8 governs here; the extension has 18 acceptance criteria across ten layers.

## Overview

Total Steps: 101
Task Groups: 12
Expected Tests: 63 automated across groups 1–10 (2–8 per group), plus ≤ 10 in group 12 → **63–73 total**; group 11 contributes 7 signed manual checklist items and no tests.

---

## Implementation Steps

### Task Group 1: De-risking scaffold & A18 resource-resolution probe
**Dependencies:** None
**Implements:** R1 (partial), A18, spec § Technical Approach "Risk handled first"
**Files to Modify:** `package.json`, `tsconfig.json`, `esbuild.mjs`, `.mocharc.json`, `.vscode-test.mjs`, `src/extension.ts`, `src/webview/shim.ts`, `test/fixtures/tasks/pd-real/dashboard.html`, `test/fixtures/tasks/pd-real/dashboard-data.js`, `test/fixtures/tasks/pd-real/orchestrator-state.yml`, `test/unit/smoke.test.ts`, `test/integration/a18-resolution.test.ts`, `test/integration/index.ts`, `test/runIntegration.ts`
**Estimated Steps:** 8

- [x] 1.0 Prove the toolchain and the hosted-dashboard resource dependency before any feature code
  - [x] 1.1 Write 3 focused tests
    - `smoke/unit: mocha executes a TypeScript test on Node v26.7.0` — the toolchain gate
    - `smoke/integration: @vscode/test-electron launches the pinned stable build and the extension activates` — the host gate
    - `A18/integration: hosting the fixture dashboard.html in a webview populates window.MAISTER_DATA with the ?t= cache-buster intact` — the resolution gate; the probe posts the value of `window.MAISTER_DATA` back to the host, which asserts it is non-empty
  - [x] 1.2 Create `package.json` with the two runtime dependencies (`yaml`, `markdown-it`) only, the dev dependencies of § 1.1, `engines.vscode: ^1.90.0`, `@types/vscode` pinned to `~1.90.0`, and the scripts `build`, `watch`, `lint`, `test`, `test:integration`, `test:min`, `bench`. **No `contributes` block** — group 2 owns it
  - [x] 1.3 Create `tsconfig.json` (`strict: true`) and `esbuild.mjs` with the two targets of § 1.1: `src/extension.ts` → `dist/extension.js` (node, cjs) and `src/webview/*.ts` → `dist/webview/*.js` (browser, iife)
  - [x] 1.4 Commit a fixture snapshot of the real product-design task folder (`dashboard.html`, `dashboard-data.js`, `orchestrator-state.yml`) under `test/fixtures/tasks/pd-real/` — the same snapshot groups 3 and 6 reuse
  - [x] 1.5 Write the minimal `src/extension.ts` and `src/webview/shim.ts` the A18 probe needs: a command that opens a webview with `localResourceRoots` on the fixture folder, the three § 5.3 insertions (CSP meta **after** the existing `<meta charset>` per audit I5, `<base href>`, shim script), and the shim's `appendChild`/`insertBefore` nonce patch
  - [x] 1.6 Configure `.vscode-test.mjs` to download and cache a pinned stable VS Code in `.vscode-test/`, and `.mocharc.json` for the unit suite
  - [x] 1.7 Run the A18 probe and **record the outcome in the work log**: resolution works as specified, or contingency (1) query-stripping, or contingency (2) `recognize()` always `'unrecognized'`. Apply the chosen contingency here, not later
  - [x] 1.8 Ensure the 3 tests pass
    - Run ONLY the 3 tests written in 1.1

**Acceptance Criteria:**
- The 3 tests pass on Node v26.7.0 with the pinned stable VS Code build
- `npm run build` produces `dist/extension.js` and `dist/webview/shim.js`
- The A18 outcome is recorded with the contingency branch taken, if any, so group 6 plans against a known answer
- `npm ls --prod --depth=0` lists exactly `yaml` and `markdown-it`

---

### Task Group 2: Manifest, packaging & repo hygiene
**Dependencies:** 1
**Implements:** R1, R2, R27, A3, A4, A11, A12, A15, § 1.3, § 1.6
**Files to Modify:** `package.json`, `LICENSE`, `.gitignore`, `.vscodeignore`, `media/maister.svg`, `test/unit/manifest.test.ts`
**Estimated Steps:** 8

- [x] 2.0 Complete the manifest and repository hygiene
  - [x] 2.1 Write 5 focused tests over the parsed `package.json`
    - `manifest: every task-argument command carries menus.commandPalette when:"false"` (A4 — the nine listed commands)
    - `manifest: palette-visible commands are exactly the nine of A4, and maister.startWorkflow carries isWorkspaceTrusted`
    - `manifest: view/title contributes startWorkflow(add,navigation@1) and refresh(refresh,navigation@2) for view == maister.now` (A15), and openRisks at navigation@2 for maister.overview (A3)
    - `manifest: capabilities.untrustedWorkspaces.supported === 'limited', virtualWorkspaces === false, extensionKind === ['workspace'], activationEvents include onWebviewPanel:maister.panel`
    - `manifest: the five maisterLens.* settings exist with the § 1.3/§ 7.6 defaults, and exactly two runtime dependencies are declared`
  - [x] 2.2 Add the `viewsContainers`/`views` contributions (`maister` activitybar container, `maister.now` tree, `maister.overview` webview) and `viewsWelcome`
  - [x] 2.3 Add every command of § 1.3 + § 1.6 with the `Maister:` category, then the `menus` blocks: `commandPalette` (A4 hiding), `view/title` (A15 + § 4.2 rows), `view/item/context` inline next-action entry, `editor/title` (§ 1.6 table with the `activeWebviewPanelId` `when` clauses)
  - [x] 2.4 Add `capabilities`, `extensionKind`, `activationEvents`, and the five `configuration` settings
  - [x] 2.5 Set `publisher: "maister"` (placeholder) and `license: "MIT"`; add the `LICENSE` file (A11)
  - [x] 2.6 Add `.gitignore` (`node_modules/`, `dist/`, `out/`, `*.vsix`, `.vscode-test/`, `.playwright-mcp/`) and untrack the stray log with `git rm --cached .playwright-mcp/console-*.log`; add `.vscodeignore` excluding `src/`, `test/`, `.vscode-test/` and analysis assets
  - [x] 2.7 Add `media/maister.svg` (single-colour codicon-style glyph, no external references)
  - [x] 2.8 Ensure manifest tests pass
    - Run ONLY the 5 tests written in 2.1

**Acceptance Criteria:**
- The 5 tests pass
- No status-bar contribution exists anywhere in the manifest (A12)
- `git status` is clean of build output and of `.playwright-mcp/console-*.log`
- `npx vsce package` produces a `.vsix` (smoke run; publishing is out of scope)

---

### Task Group 3: Model layer — types, registry, tolerant parsing, risks, strings
**Dependencies:** 1
**Implements:** R3, R4, R5, R6, R7, A5, A6, A8, A13, A14, A17, § 2.1–2.6
**Files to Modify:** `src/model/types.ts`, `src/model/workflows.ts`, `src/model/parseState.ts`, `src/model/parseSummary.ts`, `src/model/risks.ts`, `src/strings.ts`, `test/fixtures/tasks/**`, `test/unit/parseState.test.ts`, `test/unit/parseSummary.test.ts`, `test/unit/phases.test.ts`, `test/unit/risks.test.ts`, `test/unit/strings.test.ts`
**Estimated Steps:** 10

- [x] 3.0 Complete the model layer
  - [x] 3.1 Write 8 focused tests
    - `parseState: the A14 fixture — this development task's task_context.phase_summaries.clarifications (a list) yields exactly 4 decisions in file order with the four texts named in A14, each rationale "user choice", source "clarifications", and 0 risks, 0 artifacts, 0 parse issues` (AC2)
    - `parseState: a list entry mixing an unclassifiable item records the A14 warning and still lands its classifiable siblings` (AC2)
    - `parseState: the A8 drift matrix — options at both levels (N7), phase_summaries under each *_context key (N8), semantic vs positional keys (N9), migrations/ → migration (N1), date-only timestamps (N5), unknown dirSegment` (AC2)
    - `parseState: corrupt, truncated and empty state files each return a Task with status 'unknown', folder-derived title and one error issue; the parser never throws` (AC10 unit half)
    - `parseState: non-empty failed_phases, populated auto_fix_attempts and a started_phase disagreeing with the derivation each record a warning ParseIssue and no phase gains a failed status` (A17, AC2)
    - `phases: § 2.4 derivation — gaps below max are not_recorded, first phase above max is current only for unfinished statuses, completed tasks have no current phase; product-design starts at 0, all others at 1` (AC2)
    - `parseSummary: TL;DR / Key Decisions / Risks extracted from the leading region only; "Open Questions / Risks", "& Risks" and "and Risks" headings all match; a "Risks" heading past the fourth heading or a thematic break is not matched; missing sections yield null`
    - `strings: no exported value in src/strings.ts matches /\b(running|waiting|stalled|abandoned)\b/i` (AC13)
  - [x] 3.2 Write `src/model/types.ts` per § 2.1 with `TaskRef.folderUri` as the identity field (A1) and `relPath` retained for display and command composition
  - [x] 3.3 Write `src/model/workflows.ts`: the five workflow defs pinned to `maisterVersion: '2.2.3'`, all phase tables of § 2.2 verbatim (development 14, product-design 0–8, research 6, migration 8 under `dirSegment: 'migrations'`, performance 9), and the `HERO_MAP` heroes transcribed from `dashboard.html` lines 249–276. Phase ids outside the registry render by raw id with a warning
  - [x] 3.4 Write `src/model/parseState.ts`: `yaml.parseDocument(text, { strict:false, uniqueKeys:false, prettyErrors:true })`, partial-tree recovery, then N1–N15 applied independently, with A14's three entry shapes and per-item classification table, and A17's issue recording. **The parser never throws**
  - [x] 3.5 Write `src/model/parseSummary.ts` per § 2.5 — first 8 KB, front-matter and H1 stripped, leading-region heading match, decision `text`/`rationale` split on ` — ` then ` – ` then ` - `, N11's resolved rule, TL;DR capped at 1,000 chars
  - [x] 3.6 Write `src/model/risks.ts` exporting `collectRisks(task)` and `openRiskCount(task)` exactly as A5 defines them — state risks plus every registered artifact's § 7 risks, deduplicated per task on normalized text with the artifact winning as `source`; each risk carries `{ text, resolved, source, sourceKind, folderUri }`
  - [x] 3.7 Write `src/strings.ts` as the single home for every Maister Lens-authored user-facing string (A6). Maister's own phase names live in `workflows.ts` and are exempt as constant input
  - [x] 3.8 Build the fixture corpus under `test/fixtures/tasks/`: committed snapshots of the two real task folders plus one hand-written folder per A8 hazard row (both-level options, multi-`*_context`, migrations mapping, date-only, corrupt, truncated, empty, `html_output:false`, unknown dirSegment, populated `failed_phases` + `auto_fix_attempts`, the three risk-heading spellings)
  - [x] 3.9 Verify `openRiskCount` equals `collectRisks(...).filter(r => !r.resolved).length` on every fixture (success criterion 6 precondition)
  - [x] 3.10 Ensure model tests pass
    - Run ONLY the 8 tests written in 3.1

**Acceptance Criteria:**
- The 8 tests pass; **AC2, AC10 (unit half) and AC13 are satisfied**
- No fixture makes `parseState` throw, and nothing guessed or skipped is absent from `parseIssues`
- `src/strings.ts` is the only module exporting user-facing copy (code-review convention per A6, not a test)

---

### Task Group 4: Index layer — two-tier index, persistence, watcher, attribution
**Dependencies:** 3
**Implements:** R8, R9, R10, R11, R12, R13, R14, A1, § 3.1–3.9
**Files to Modify:** `src/index/taskIndex.ts`, `src/index/watcher.ts`, `src/index/attribution.ts`, `src/extension.ts`, `src/strings.ts`, `test/unit/query.test.ts`, `test/integration/index.test.ts`, `test/integration/attribution.test.ts`, `test/helpers/gitRepo.ts`
**Estimated Steps:** 10

- [x] 4.0 Complete the index layer
  - [x] 4.1 Write 7 focused tests
    - `query/unit: AND-ed text tokens across title, folder name, description, tags, decision text and rationale, risk text and every registered artifact's TL;DR; ranking 3/2/1 with activityMtime tie-break; matchedIn reports 'decision' for a decision-only hit` (AC7 unit half)
    - `query/unit: facets combine with AND, an unset facet does not filter, and staleness applies only to non-completed tasks`
    - `index/integration: discovery finds .maister/tasks/*/*/orchestrator-state.yml per workspace folder with a null exclude argument, keyed on folderUri` (A1)
    - `index/integration: persistence round-trip — a schemaVersion or registryVersion mismatch discards the file; an mtime-or-size change invalidates one entry; a corrupt file is deleted and rebuilt with no user-facing error`
    - `index/integration: persisted entries whose folderUri no longer resolves to an open workspace folder are dropped on load` (A1)
    - `index/integration: a corrupt state file lists its task as Unreadable while every other task indexes correctly` (AC10 integration half)
    - `attribution/integration: in a generated two-author repository, isMe matches git config user.email case-insensitively; an uncommitted task has author null; a missing git binary degrades to null with one output-channel line and no notification` (AC16)
  - [x] 4.2 Write `src/index/taskIndex.ts` tier 1: one `Task` per folder keyed on `folderUri`, tier 2 `TaskDetail` LRU(20) built on demand, plus the § 3.6 API with `getDetail(folderUri)` and `onDidChange.changed: readonly folderUri[]` (A1)
  - [x] 4.3 Implement § 3.3 persistence at `storageUri/index-v1.json`: version gate, mtime/size invalidation per entry and per artifact, atomic `.tmp` + rename write debounced 2 s, flush on `deactivate()`, retry once after 5 s then notify on a second failure
  - [x] 4.4 Implement the § 3.4 load algorithm — instant cached paint (`freshness: 'cached'`), discover, stat at concurrency 16, reconcile at concurrency 8, publish `fresh`, all under `window.withProgress` on the `maister.overview` view
  - [x] 4.5 Implement the § 3.7 query engine over tier 1 only, returning `TaskHit[]` with `matchedIn` and `score`
  - [x] 4.6 Write `src/index/watcher.ts`: one recursive watcher per folder on `.maister/tasks/**`, the § 3.5 routing table, 250 ms per-task trailing debounce, snapshot publication throttled to one per 500 ms, a 60 s relative-time refresh with no file I/O, and the one-time `files.watcherExclude` notice
  - [x] 4.7 Write `src/index/attribution.ts`: one `execFile` per repository (never a shell, 10 s timeout) with the § 3.8 `git log` invocation, `\x1e`/`\x1f` record splitting, last-record-wins, `isMe` by `user.email`, the three degraded cases, gated by `maisterLens.attribution.enabled`
  - [x] 4.8 Compute `nextAction` at index time per § 7.2 and store it on each `Task` (the launch layer consumes it in group 9)
  - [x] 4.9 Write `test/helpers/gitRepo.ts` — generates a two-author repository into a temp dir at run time, never committed (A10); group 10 reuses it
  - [x] 4.10 Ensure index tests pass
    - Run ONLY the 7 tests written in 4.1

**Acceptance Criteria:**
- The 7 tests pass; **AC7 (unit half), AC10 (integration half) and AC16 are satisfied**
- The index never reads an artifact body; only the first 8 KB per registered artifact for its § 7 block
- Every watcher, timer and disposable is registered in `context.subscriptions`

---

### Task Group 5: Sidebar views — Now tree & Overview webview
**Dependencies:** 4, 2
**Implements:** R15, R16, A2 (`overview` payload, `setFilter`, `clearFilter`, `setGroupBy`, `openDashboard`, `openRisks`, `runNextAction`), A9, A5, § 4.1–4.3
**Files to Modify:** `src/views/nowTree.ts`, `src/views/overviewView.ts`, `src/webview/overview.ts`, `src/webview/components.ts`, `media/webview.css`, `src/strings.ts`, `src/extension.ts`, `test/integration/nowTree.test.ts`, `test/integration/overview.test.ts`
**Visual References:**
- mockup: `analysis/design-context/mockups/sidebar-now-overview.html`
  element: `screen:sidebar-now-overview`
  locator: Now section — lines 318–331 (`<aside class="sb">`, `<section class="sec" aria-label="Now">`, the `＋ ↻` title actions and the task/child node rows)
  acceptance: Task node shows `label` = title and `description` = `{Type label} · {current phase activeForm, or status} · {activity}`; children appear in exactly this order — Progress, Last recorded decision, **Recent artifacts** (A9 collapsible group node, ≤ 5 children by mtime descending), Open risks; the inline ▶ next-action button sits trailing on the task row and is absent when the task has none; the title-bar carries `＋` (Start Workflow) then `↻` (Refresh) in that order (A15). The `◈ Maister: 2 unfinished` status-bar element in the mockup is **not** implemented (A12)
- mockup: `analysis/design-context/mockups/sidebar-now-overview.html`
  element: `screen:sidebar-now-overview`
  locator: Overview section — lines 332–360 (`<section class="sec">` with the Overview `sech`, the search box, Mine/Everyone, the STATUS/TYPE/ATTENTION tile rows, and the grouped task list at lines 347–358)
  acceptance: field order is search box → Mine/Everyone → STATUS row → TYPE row → ATTENTION row → `TASKS {n} of {m} · {k} filters` heading → group sections; every tile is a `<button aria-pressed>` showing a ✓ glyph when pressed; every group header is a `<button aria-expanded>` labelled `{Group} ({count})`; each row carries status glyph + status word + title button + description + markers + a separate trailing next-action button; the title control never launches anything. The mockup's stale "Browse" wording and its non-navigable `/screen/*` links are **not** reproduced
**Estimated Steps:** 9

- [x] 5.0 Complete the sidebar views
  - [x] 5.1 Write 6 focused tests
    - `nowTree/integration: a new orchestrator-state.yml appears in Now within 1.5 s, and a rewrite updates its description within 1.5 s` (AC1)
    - `nowTree/integration: membership is exactly the unfinished statuses sorted by activityMtime descending, the view badge equals that count, and node ids are now:{folderUri}` (A1)
    - `nowTree/integration: children are Progress, Last recorded decision, Recent artifacts (group node, ≤ 5) and Open risks, in that order; Open risks is omitted at zero and its count equals openRiskCount(task)` (A5, A9, AC18 precondition)
    - `nowTree/integration: every task item exposes a complete accessibilityInformation.label naming type, phase, activity and next action` (AC14 integration half)
    - `overview/integration: setFilter, clearFilter and openDashboard round-trip, and Overview and Dashboard read the same TaskQuery instance; the maister.overview.filtered context key tracks it` (AC8 integration half)
    - `overview/integration: the overview payload carries row fields only, at most 50 tasks per group, and never a full Task object` (A2)
  - [x] 5.2 Write `src/views/nowTree.ts` per § 4.1 with the A9 Recent-artifacts group node, the view badge, the § 4.1 node property table, `contextValue` = `task.{type}.{status}.next-{nextActionId}`, and § 4.3 accessible labels
  - [x] 5.3 Write `src/webview/components.ts` and `media/webview.css`: the shared tile, chip, row and summary-card primitives, styled with `--vscode-*` variables only — imported by all five bundles, never duplicated
  - [x] 5.4 Write `src/views/overviewView.ts`: the `WebviewViewProvider`, the shared `TaskQuery` owned by the extension, the § 4.2 tile aggregates, grouping modes with `workspaceState` persistence, and the CSP/nonce hygiene of § 4.2
  - [x] 5.5 Write `src/webview/overview.ts`: the § 4.2 layout in mockup field order, tiles as `aria-pressed` buttons, 200 ms-debounced search with Escape-to-clear, group disclosures, row anatomy with a separate next-action control, hero expander, and the two empty states
  - [x] 5.6 Persist webview-local state (search text, Mine toggle, group collapse) via `vscode.getState()/setState()` — no message, per A2
  - [x] 5.7 **Resolve audit I2**: either name the in-webview control that sends `setGroupBy`, or remove `setGroupBy` from the A2 allowlist because group-by is the native title-bar command. Record the choice in the work log
  - [x] 5.8 Add every Overview and Now string to `src/strings.ts`
  - [x] 5.9 Ensure view tests pass
    - Run ONLY the 6 tests written in 5.1

**Acceptance Criteria:**
- The 6 tests pass; **AC1, AC14 (integration half) and AC8 (integration half) are satisfied**
- Implementation matches each `acceptance` criterion in the two Visual References above
- Neither view reads a file — both render exclusively from the index snapshot
- Overview reflows without horizontal scrolling at 250 px and at 400 px sidebar widths

---

### Task Group 6: Panel core — lifecycle, message validation & hosted dashboard
**Dependencies:** 4, 2
**Implements:** R17, R18, R23, R25, A1, A2, A2.1, A2.2, A18, § 5.1–5.3, § 8.1, § 8.3
**Files to Modify:** `src/panel/panel.ts`, `src/panel/messages.ts`, `src/panel/hostDashboard.ts`, `src/webview/shim.ts`, `src/strings.ts`, `src/extension.ts`, `test/unit/messages.test.ts`, `test/unit/hostDashboard.test.ts`, `test/integration/panel.test.ts`, `test/integration/trust.test.ts`, `test/helpers/untrustedHost.ts`
**Visual References:**
- mockup: *(not mocked — Maister's own `dashboard.html`, hosted verbatim)*
  element: `component:hosted-dashboard`
  locator: `test/fixtures/tasks/pd-real/dashboard.html` — the committed vintage snapshot
  acceptance: markup, styles and script logic are untouched apart from exactly three insertions (CSP meta placed **after** the existing `<meta charset>` per audit I5, `<base href>`, nonce'd shim script) plus a `nonce` attribute added to every inline `<script>` opening tag and the removal of any pre-existing CSP meta; no restyling, no injected UI, no theme override
**Estimated Steps:** 10

- [x] 6.0 Complete the panel core
  - [x] 6.1 Write 8 focused tests
    - `messages/unit: every type in the A2 table validates with a well-formed payload; an unlisted type, a wrong primitive type, a missing key and a > 200-char text patch are each dropped and logged` (success criterion 4)
    - `messages/unit: path containment — an artifactRelPath escaping the task folder, a folderUri absent from the index, an anchor failing /^[-\w.]{1,128}$/ and an openExternal url whose scheme is not http(s) are all refused`
    - `messages/unit: A2.1 — a navigate href resolving to another task's dashboard.html is out-of-folder and is ignored and logged`
    - `hostDashboard/unit: the output carries exactly the three insertions with a fresh 32-byte nonce, the CSP meta sits immediately AFTER the existing <meta charset>, every inline <script> gains the nonce, and any pre-existing CSP meta is removed` (AC3 integration half, audit I5)
    - `hostDashboard/unit: recognize() requires dashboard-data.js, MAISTER_DATA, at least one inline <script> and no <iframe>; each missing condition yields 'unrecognized' with a stated reason, and the result is cached per (mtime,size)`
    - `panel/integration: a dashboard-data.js change posts refresh to the shim within 1.5 s` (AC3 integration half)
    - `panel/integration: a navigate message resolving to an in-task .md sets the panel location to { mode:'artifact' } and opens no editor tab and no external browser` (AC4 integration half)
    - `trust/integration: in an untrusted workspace no hosted HTML executes, Task mode uses the fallback view, startWorkflow / runNextAction / openInBrowser are dropped and logged, and the fallback banner's "Open dashboard in browser" button is not rendered at all` (AC15, A2.2)
  - [x] 6.2 Write `src/panel/messages.ts`: one `validate(raw): Message | null` implementing the A2 table as the security allowlist, with path-containment and index-membership helpers. Used by the panel **and** by `overviewView.ts`
  - [x] 6.3 Write `src/panel/panel.ts`: the `maister.panel` singleton with the four `PanelLocation` shapes keyed on `folderUri` (A1), the § 5.1 options and `localResourceRoots`, own history stack (max 50), the § 1.6 context keys, native editor-title actions and the `WebviewPanelSerializer` restore with a dashboard fallback
  - [x] 6.4 Write `src/panel/hostDashboard.ts`: `recognize()` per § 5.2 and the three insertions per § 5.3 **with the audit-I5 placement**, a fresh 32-byte nonce per render
  - [x] 6.5 Complete `src/webview/shim.ts` from the group 1 probe: the `appendChild`/`insertBefore` nonce patch, the `refresh` → `window.loadData?.(false)` bridge, capturing `click`/`auxclick` link interception with in-page `#` fragments allowed and everything else posted as `navigate`, `window.open` override, and `acquireVsCodeApi()` claimed first
  - [x] 6.6 Implement the § 5.3 `navigate` target routing **as narrowed by A2.1** — in-task `.md` → artifact `md`, in-task companion `.html` → artifact `html`, this task's `dashboard.html` → Task mode, any other in-task file → `vscode.open`, anything out-of-folder → ignored and logged
  - [x] 6.7 Apply the A18 outcome recorded in group 1 — if a contingency was taken, implement it here and record the loss in the README's known limitations
  - [x] 6.8 **Resolve audit I8**: write `test/helpers/untrustedHost.ts` launching `@vscode/test-electron` with a fresh `--user-data-dir` and trust unset, plus host-side assertions on the `when`-clause context values. Group 10 reuses it
  - [x] 6.9 Add every panel and banner string to `src/strings.ts`
  - [x] 6.10 Ensure panel-core tests pass
    - Run ONLY the 8 tests written in 6.1

**Acceptance Criteria:**
- The 8 tests pass; **AC3 (integration half), AC4 (integration half) and AC15 are satisfied**
- Implementation matches the `acceptance` criterion in the Visual Reference above
- The extension host never parses or evaluates `dashboard-data.js`
- Every message not in the A2 table is dropped and logged to the Maister Lens output channel
- `test/helpers/untrustedHost.ts` exists and is reusable by group 10

---

### Task Group 7: Panel modes — Task fallback view & Artifact reader
**Dependencies:** 6
**Implements:** R19, R22, R23, A2, § 5.4, § 6.1–6.6
**Files to Modify:** `src/webview/fallbackTask.ts`, `src/panel/render.ts`, `src/webview/reader.ts`, `src/strings.ts`, `media/webview.css`, `test/unit/render.test.ts`, `test/integration/fallbackTask.test.ts`, `test/integration/reader.test.ts`
**Visual References:**
- mockup: `analysis/design-context/mockups/task-fallback-view.html`
  element: `screen:task-fallback-view`
  locator: lines 296–332 — the banner, the header row at line 298 (`<h1>` + trailing `▶ Resume` button), `Phases` (300), `Key artifacts` (311–315), `Decisions` (316–320), `Risks` (321), `Raw state` (327)
  acceptance: the eight § 5.4 sections render in exactly this order — banner, header (title, type badge, status, created/updated, author, verdict, parse-issues link, trailing primary next-action button), Phases, Hero artifacts, Decisions grouped by `source`, Risks (open first, resolved struck through with a visible "Resolved" label), All artifacts, Raw state in a collapsed `<details>` with an **Open state file** button. Phase glyphs are text-bearing: `✓ Completed`, `● Current — {activeForm}`, `◌ Not recorded`, `○ Upcoming`. The next-action button is hidden in untrusted workspaces, and the "Open dashboard in browser" button is not rendered there at all (A2.2)
- mockup: `analysis/design-context/mockups/artifact-reader-implementation-plan.html`
  element: `screen:artifact-reader`
  locator: lines 286–320 — the breadcrumb and hero chips above the summary card, the `<aside class="card" aria-label="Summary">` at line 289, then the rendered body headings from line 299
  acceptance: order is breadcrumb (task link) → hero chips (current one pressed) → summary `<aside aria-label="Summary">` → `<main>` body; the card holds TL;DR, Key decisions with ` — rationale`, Open questions & risks, and the `Checklist: {done} of {total} done · {skipped} skipped` line when the document has checklist items; the card is omitted entirely when `summary` is null; a "Skip to document" link is first in tab order
**Estimated Steps:** 9

- [x] 7.0 Complete the fallback view and the artifact reader
  - [x] 7.1 Write 7 focused tests
    - `render/unit: markdown-it configured { html:false, linkify:true, typographer:false } escapes raw HTML; GFM tables render; no sanitizer is used`
    - `render/unit: link rewriting — #fragment unchanged; in-task .md/.html → data-artifact; elsewhere-in-workspace → data-file; http(s) → data-external; file:, command:, javascript: and workspace-escaping paths lose the link and keep the text`
    - `render/unit: checklist rule renders ☐/☑/⊘ with aria-labels "not done"/"done"/"skipped" and produces the {done, total, skipped} counts`
    - `render/unit: the detected leading summary region is removed from the body so the TL;DR is not shown twice; relative images inside .maister/tasks are rewritten with asWebviewUri and every other src is dropped for its alt text + "(image not loaded)"; files over 2 MB are refused with the too-large notice`
    - `reader/integration: every extension navigation to an artifact routes through render.ts, and vscode.open is reached only via openSource` (AC5 integration half)
    - `fallbackTask/integration: the task payload for the html_output:false fixture carries the banner reason, phases, decisions and risks` (AC6 integration half)
    - `reader/integration: a watcher change to the open artifact re-renders and re-posts it, and the reader restores scrollY when the incoming location equals the current one`
  - [x] 7.2 Write `src/panel/render.ts` — the full § 6.2 pipeline with the LRU(30) cache keyed on `(path, mtime, size)` and the § 6.2 `render` payload
  - [x] 7.3 Implement § 6.4 HTML-companion re-hosting through `hostDashboard.ts`'s same three insertions with `<base href>` at the artifact's own directory; refuse `<iframe>` or > 2 MB and fall back to the `md` variant with a one-line notice
  - [x] 7.4 Write `src/webview/fallbackTask.ts` per § 5.4 in mockup section order, with `collectRisks` as the risk source (A5)
  - [x] 7.5 Write `src/webview/reader.ts` per § 6.3 with the delegated `data-artifact` / `data-file` / `data-external` click handler and `setState` scroll persistence
  - [x] 7.6 Implement § 6.1 variants and defaults plus the `maister.panel.toggleVariant` editor-title action and the `maister.panel.variantAvailable` context key
  - [x] 7.7 Implement § 6.6 accessibility — skip link, focus moved to the artifact heading after navigation, `(opens in browser)` / `(opens in editor)` visually hidden suffixes
  - [x] 7.8 Add every fallback and reader string to `src/strings.ts`
  - [x] 7.9 Ensure fallback and reader tests pass
    - Run ONLY the 7 tests written in 7.1

**Acceptance Criteria:**
- The 7 tests pass; **AC5 (integration half) and AC6 (integration half) are satisfied**
- Implementation matches each `acceptance` criterion in the two Visual References above
- No `.md` or `.html` artifact is ever shown as source through extension navigation except via **Open source file**
- Runtime dependency count is still exactly two

---

### Task Group 8: Panel modes — Dashboard & Risks
**Dependencies:** 6, 5
**Implements:** R20, R21, A2, A3, A5, § 5.5, § 5.7
**Files to Modify:** `src/webview/dashboardMode.ts`, `src/webview/risksMode.ts`, `src/panel/panel.ts`, `src/strings.ts`, `media/webview.css`, `test/integration/dashboardMode.test.ts`, `test/integration/risksMode.test.ts`
**Visual References:**
- mockup: `analysis/design-context/mockups/dashboard-mode.html`
  element: `screen:dashboard-mode`
  locator: lines 322–340 — the header at 322, the KPI tile row, the filter chip bar, the 2×2 chart grid at lines 331–334 (Status, Verification, Workflow type, Tasks created per week), and the task table heading at 336
  acceptance: four KPI tiles in order Tasks · Failed verification · Quiet ≥ {quietDays} days · Open risks, each with an icon on a colour disc, a value, a label and a one-line context — never colour alone; the 2×2 chart grid keeps that chart order, each card carrying a title, a scope line and a **Table** link; bars are `<button aria-pressed>` rows that filter only the table while charts keep all-task counts; week columns are not filters; neutral values are hatched; task-table columns in exactly this order — Title · Type · Status / current phase · Verdict · Author · Created · Last activity · **Next**. Colours come from `--vscode-charts-*`; the mockup's Dark+ hex literals are a rendering of those variables, not values to copy. Charts are hand-written SVG — no charting dependency
- mockup: `analysis/design-context/mockups/open-risks.html`
  element: `screen:open-risks`
  locator: lines 323–365 — the breadcrumb and heading at 323, the KPI tile row, the filter bar, and the group cards at 341–365 (`<section class="rg card">` per task)
  acceptance: order is breadcrumb `← Dashboard` → heading `Open risks` → four KPI tiles (Open risks · In unfinished tasks · In completed tasks · In failed-verification tasks) → filter bar (risk-text search, shared type chips, Unfinished/Completed toggles, **Show resolved** off by default, Group by Task/Workflow type/Source) → group cards ordered by the owning task's `activityMtime`, first 10 expanded. Group header fields in order: task title · type badge · status/current phase/verdict · relative activity · author · `{n} open` · next-action button. Risk rows are ⚠ text + a source line (`from {artifact path}` link, or `recorded in {phase_summaries key}`). **No severity and no age anywhere.** The mockup's defect is not reproduced: the default heading is `{open} open across {k} tasks`, and resolved rows plus the `· {n} resolved` clause appear **only** while Show resolved is on
**Estimated Steps:** 9

- [x] 8.0 Complete Dashboard and Risks modes
  - [x] 8.1 Write 7 focused tests
    - `dashboardMode/integration: the dashboard payload carries pre-aggregated charts over the whole index and rows capped at 1,000, and charts stay unfiltered while rows follow the TaskQuery` (AC8 integration half)
    - `dashboardMode/integration: the Open risks KPI value equals the sum of openRiskCount over the index and its context line names the same k tasks` (A5, AC18)
    - `dashboardMode/integration: runNextAction dispatched from the Next cell executes the composed command, and activating a row title launches nothing` (AC17 integration half)
    - `risksMode/integration: the risks payload lists each risk once per task, groups ordered by activityMtime, with no severity and no age field` (AC18 integration half)
    - `risksMode/integration: the payload carries the full resolved-and-unresolved set for the scope, so text search, status toggles, show-resolved and group-by need no round-trip; only the type facet round-trips through setFilter` (A2)
    - `risksMode/integration: openRisks with a folderUri scopes the mode to that task, and openRiskCount(task) equals the rows shown for it` (success criterion 6)
    - `panel/integration: runNextAction dispatched from each of the four surfaces (Now row, Overview row, fallback header, Dashboard Next cell) executes the composed command` (AC17 integration half)
  - [x] 8.2 Write `src/webview/dashboardMode.ts`: the four § 5.5 KPI tiles, the filter chip bar with **Clear all** and the "Charts show all tasks · click a bar to filter the table" note
  - [x] 8.3 Hand-write the four SVG charts of § 5.5 — three labelled horizontal bar charts and the 12-week column chart with the current week dashed and the missing-`created` footnote. No chart library
  - [x] 8.4 Make each bar row a `<button aria-pressed>` that toggles its facet through `setFilter`; keep week columns non-interactive; give each card a **Table** link swapping the chart for an accessible data table whose numbers equal the chart's
  - [x] 8.5 Build the § 5.5 task table with `aria-sort` header buttons, `setState`-persisted sort, `quiet {n}d` as text in Last activity, and a Next cell holding the task's next-action button or nothing
  - [x] 8.6 Write `src/webview/risksMode.ts` per § 5.7 with `collectRisks` as its only data source (A5), local filtering over the full payload, and the § 5.7 group and row layout
  - [x] 8.7 Wire the `{ mode: 'risks'; folderUri? }` panel location and the `maister.openRisks` entry points of A3 (Overview title bar `navigation@2`, editor title, palette-visible bare invocation, Now "N open risks" child, fallback Risks heading)
  - [x] 8.8 Add every Dashboard and Risks string to `src/strings.ts`
  - [x] 8.9 Ensure Dashboard and Risks tests pass
    - Run ONLY the 7 tests written in 8.1

**Acceptance Criteria:**
- The 7 tests pass; **AC17 (integration half) and AC18 (integration half) are satisfied**
- Implementation matches each `acceptance` criterion in the two Visual References above
- No severity, age, duration or throughput is displayed anywhere
- Runtime dependency count is still exactly two

---

### Task Group 9: Launch layer — target chain, next actions, Start Workflow
**Dependencies:** 4, 2
**Implements:** R24, A4, A7, § 7.1–7.7
**Files to Modify:** `src/launch/launch.ts`, `src/extension.ts`, `src/strings.ts`, `test/unit/nextAction.test.ts`, `test/unit/targetOrder.test.ts`, `test/unit/quote.test.ts`
**Visual References:**
- mockup: `analysis/design-context/mockups/start-workflow-flow.html`
  element: `screen:start-workflow-flow`
  locator: lines 321–345 — step 1 (type prompt) at 321, step 2 (description input) at 333, step 3 (first available target: Claude Code panel) at 338
  acceptance: the flow is exactly three steps in this order — a single-pick type prompt with `Let Maister decide` → `work` first, then Development, Product design, Research, Migration, Performance, each with a one-sentence description; a description input box *"What should this workflow do?"* accepting 1–2,000 non-whitespace characters with line breaks collapsed to spaces; dispatch to the first available target with a 5 s status-bar outcome message naming the destination. The mockup's "from the Now or Browse title bar" wording is stale — Browse was merged into Overview, and the spec's wording wins
**Estimated Steps:** 8

- [x] 9.0 Complete the launch layer
  - [x] 9.1 Write 6 focused tests
    - `nextAction/unit: § 7.2 table for every state — unfinished of any type → resume; completed product-design with outputs/product-brief.md → startDevelopment; completed research → fromResearch with both --research={relPath} continuations; completed development/migration/performance and status unknown → none` (AC12)
    - `nextAction/unit: Resume composes /maister:work {relPath} for all five types including migrations/, never /maister:{type}` (AC12, A7)
    - `targetOrder/unit: with mocked availability the chain walks targetOrder and uses the first available target; a throwing target is logged and the chain advances; clipboard always succeeds; an empty or invalid array falls back to the default with a warning`
    - `targetOrder/unit: claudeCode — absent extension skips to the next target; present extension with a missing or throwing claude-vscode.editor.open takes the env.uriScheme URI fallback and ends the chain as success; present and working calls executeCommand('claude-vscode.editor.open', undefined, prompt)` (AC11 unit half, A7)
    - `targetOrder/unit: copilotChat dispatches workbench.action.chat.open with { query, isPartialQuery: !autoSubmit } and shows the one-time caveat notice with its Adjust launch order button, tracked in globalState`
    - `quote/unit: shell quoting per env.shell — POSIX single quotes with '\'' escaping, PowerShell single quotes with doubled ', cmd.exe double quotes with doubled "`
  - [x] 9.2 Write `src/launch/launch.ts` with the § 7.1 command composition and the § 7.2 next-action dispatch that **recomputes the action from the index** — the webview never supplies command text (A2)
  - [x] 9.3 Implement the A7 claudeCode chain in order: installed check → `activate()` → `claude-vscode.editor.open(undefined, prompt)` → `env.uriScheme`-built URI fallback treated as success → advance only when the extension is absent
  - [x] 9.4 Implement copilotChat with its weak availability check and the one-time caveat notice; document in README that the URI fallback reaches Claude Code's **primary editor**, not a new tab (audit I4)
  - [x] 9.5 Implement the § 7.5 terminal target — the three-step terminal selection, `workspaceState` memory, `sendText(command, autoSubmit)` for an existing terminal and `sendText('claude ' + quote(command), autoSubmit)` for a new one — and the clipboard target
  - [x] 9.6 Implement the § 7.3 Start Workflow flow and the 5 s status-bar outcome message for every dispatch
  - [x] 9.7 Register the launch commands with their `isWorkspaceTrusted` gating, and add every launch string to `src/strings.ts`. Do **not** attempt a `test:min` verification of the claudeCode branch — it cannot load at the 1.90.0 floor (audit I6)
  - [x] 9.8 Ensure launch tests pass
    - Run ONLY the 6 tests written in 9.1

**Acceptance Criteria:**
- The 6 tests pass; **AC11 (unit half) and AC12 are satisfied**
- Implementation matches the `acceptance` criterion in the Visual Reference above
- The extension writes no Maister file and adds no flags to the composed command
- Every target is wrapped in try/catch; a launch never fails silently

---

### Task Group 10: DOM harness, benchmark & fixture generators
**Dependencies:** 5, 7, 8, 9
**Implements:** R26, A10, A16 (DOM column), AC7/AC9 benchmark
**Files to Modify:** `test/dom/harness.ts`, `test/dom/surfaces.spec.ts`, `test/helpers/generateTasks.ts`, `scripts/bench.mjs`, `package.json` *(scripts only — coordinate with group 2)*, `playwright.config.ts`
**Visual References:**
- mockup: `analysis/design-context/mockups/sidebar-now-overview.html`, `mockups/task-fallback-view.html`, `mockups/artifact-reader-implementation-plan.html`, `mockups/dashboard-mode.html`, `mockups/open-risks.html`
  element: `screen:sidebar-now-overview`, `screen:task-fallback-view`, `screen:artifact-reader`, `screen:dashboard-mode`, `screen:open-risks`
  locator: the same regions cited in groups 5, 7 and 8 — this group asserts them structurally rather than implementing them
  acceptance: assertions are **structural only, never pixel comparison** — named selectors exist, section and field order match the cited mockup regions, exact copy strings match `src/strings.ts`, every interactive element is a `<button>`/`<a>` with an accessible name in a tab-reachable order, and a simulated activation posts the expected message payload through the stubbed `acquireVsCodeApi`. Visual comparison against the mockups belongs to group 11
**Estimated Steps:** 8

- [x] 10.0 Build the DOM harness, the benchmark and the run-time fixture generators
  - [x] 10.1 Write 6 focused DOM/benchmark tests
    - `dom: the shim's capture listener turns a click on the real dashboard's a[target="_blank"] into a navigate post carrying that href` (AC4 DOM half)
    - `dom: reader HTML contains the summary card whenever summary is non-null, and omits it when null` (AC5 DOM half)
    - `dom: generated fallback HTML renders all four § 5.4 sections in order` (AC6 DOM half)
    - `dom: a Dashboard bar activation posts setFilter with the right patch; charts keep all-task counts while table rows are filtered; each Table link's numbers equal its chart's` (AC8 DOM half)
    - `dom: every interactive element in all five generated surfaces is a <button>/<a> with an accessible name in a tab-reachable order; each surface renders exactly one next-action control per row, distinct from the title control; Show resolved reveals resolved rows struck through with a visible "Resolved" label` (AC14, AC17, AC18 DOM halves)
    - `bench: cold index of 300 generated tasks < 5 s, warm cached snapshot < 300 ms, decision-text query < 100 ms over 300 tasks` (AC7, AC9 — reported, **non-gating**)
  - [x] 10.2 Write `test/dom/harness.ts`: loads each bundle's **generated HTML** with fixture data in a plain Playwright browser page, with `acquireVsCodeApi` stubbed so posted messages are captured
  - [x] 10.3 Write `test/dom/surfaces.spec.ts` covering all five bundles with the structural assertion vocabulary above
  - [x] 10.4 Write `test/helpers/generateTasks.ts` — 300 realistic task folders (mixed types, statuses and vintages) generated into a temp dir at run time, never committed
  - [x] 10.5 Write `scripts/bench.mjs` reporting cold index, warm snapshot and query timings; wire `npm run bench`. It reports, it does not gate
  - [x] 10.6 Wire `npm run test:dom` and confirm `npm run test:min` runs against VS Code 1.90.0 to validate the engine claim only
  - [x] 10.7 Reuse `test/helpers/untrustedHost.ts` (group 6) and `test/helpers/gitRepo.ts` (group 4) rather than duplicating them
  - [x] 10.8 Ensure DOM and benchmark tests pass
    - Run ONLY the 6 tests written in 10.1

**Acceptance Criteria:**
- The 6 tests pass; the **DOM halves of AC4, AC5, AC6, AC8, AC14, AC17 and AC18** are satisfied, and AC7/AC9 have reported benchmark numbers
- Playwright is a dev dependency only; `npm ls --prod --depth=0` still lists exactly two packages
- The 300-task set and the two-author repository exist only in temp dirs at run time

---

### Task Group 11: Documentation, manual verification checklist & finalization
**Dependencies:** 10
**Implements:** R27, A7 (README caveat), A10 (manual checklist), A11, A16 (Manual column)
**Files to Modify:** `README.md`, `CHANGELOG.md`, `.maister/docs/project/tech-stack.md`, `.maister/docs/project/vision.md`, `verification/manual-checklist.md`
**Automated tests:** **none.** This group's deliverable is a signed checklist. A16 assigns these criteria to a human; writing tests for them would claim automation the spec explicitly refuses.
**Estimated Steps:** 7

- [x] 11.0 Ship the documentation and sign off the manual criteria
  - [x] 11.1 Write `verification/manual-checklist.md` with 7 signed items, each naming the AC it discharges and leaving a signature and date field:
    - [ ] **AC3 (manual remainder)** — the hosted dashboard renders **with its data**, with **no CSP violations in the webview developer tools**, and re-renders within 1.5 s of a `dashboard-data.js` change, against both real task folders
    - [ ] **AC4 (manual remainder)** — one real click on an artifact link inside the live hosted dashboard opens that artifact in the same panel: no browser, no new editor tab, no source view
    - [ ] **AC11 (manual remainder)** — with Claude Code 2.1.278 installed, **Start Workflow** opens a conversation with the command pre-filled; with `targetOrder: ["terminal"]` it reaches the terminal unsubmitted; with nothing else available it lands on the clipboard
    - [ ] **AC14 (manual remainder)** — a screen-reader pass through Now, the Overview list and the reader
    - [ ] **Themes** — every extension-built surface verified in Light, Dark, High Contrast and High Contrast Light
    - [ ] **Mockup comparison** — each of the six approved mockups compared by eye against its rendered surface, with the three not-to-be-reproduced defects confirmed absent (`/screen/*` links, "Browse" wording, `open-risks.html`'s resolved rows shown while Show resolved is off)
    - [ ] **Hosted-dashboard fidelity** — Maister's own `dashboard.html` renders unrestyled, exactly as the browser shows it
  - [x] 11.2 Rewrite `README.md`: what the extension does, the two views and four panel modes, the five settings, the launch targets and their caveats, why each of the two runtime dependencies exists, and the § 8.5 known limitations plus the A7 URI caveat worded as **primary editor** (audit I4) and the A18 outcome if a contingency was taken
  - [x] 11.3 Create `CHANGELOG.md` with a `0.1.0` entry
  - [x] 11.4 Correct `.maister/docs/project/tech-stack.md` — webviews, workspace-storage persistence, `yaml` + `markdown-it`, esbuild, mocha / `@vscode/test-electron`, Playwright for the DOM suite
  - [x] 11.5 Amend `.maister/docs/project/vision.md`'s "and repository changes" line — git is used for attribution only
  - [~] 11.6 DEFERRED (needs user approval): Propose the § 8.6 / A10 testing standards via `/maister:standards-update`
  - [~] 11.7 DEFERRED (needs a human at a live VS Code host): Execute the checklist against a real host and record each signature. Any failed item is a defect, not a waiver

**Acceptance Criteria:**
- All 7 checklist items are executed and signed, with failures recorded as defects
- README, CHANGELOG, `tech-stack.md` and `vision.md` describe the shipped extension with no contradictions (success criterion 9)
- No criterion A16 marks **Manual** is claimed anywhere as automated

---

### Task Group 12: Test Review & Gap Analysis
**Dependencies:** All previous groups
**Files to Modify:** `test/unit/**`, `test/integration/**`, `test/dom/**`

- [x] 12.0 Review and fill critical gaps
  - [x] 12.1 Review the 63 tests written in groups 1–10 and confirm every AC1–AC18 half is claimed by the harness the spec's **Verified by** column assigns to it, and only by that harness
  - [x] 12.2 Analyze gaps for this feature only — priority order: the A2 negative-path sweep of success criterion 4 (unlisted, malformed, out-of-index, path-escaping, trust-gated-while-untrusted), the `openRiskCount` ↔ Risks-mode-row equality of success criterion 6 across every fixture, and any A8 drift row without a passing assertion
  - [x] 12.3 Write up to 10 additional strategic tests
  - [x] 12.4 Run feature-specific tests only — expect 63–73 total
  - [x] 12.5 Confirm the nine success criteria of `spec.md` § Success Criteria, including `npm ls --prod --depth=0` showing exactly two packages and a clean `git status`

**Acceptance Criteria:**
- All feature tests pass (~63–73 total)
- No more than 10 additional tests added
- Every AC has a passing assertion or a signed checklist item, and none has both claimed as automation

---

## Execution Order

1. **Group 1** — De-risking scaffold & A18 probe (8 steps)
2. **Group 2** — Manifest, packaging & hygiene (8 steps, depends on 1) ‖ **Group 3** — Model layer (10 steps, depends on 1)
3. **Group 4** — Index layer (10 steps, depends on 3)
4. **Group 5** — Sidebar views (9 steps, depends on 4, 2) ‖ **Group 6** — Panel core (10 steps, depends on 4, 2) ‖ **Group 9** — Launch layer (8 steps, depends on 4, 2)
   *All three touch `src/strings.ts` and `src/extension.ts` — the executor serializes them on those files.*
5. **Group 7** — Fallback view & reader (9 steps, depends on 6) ‖ **Group 8** — Dashboard & Risks (9 steps, depends on 6, 5)
6. **Group 10** — DOM harness, benchmark & generators (8 steps, depends on 5, 7, 8, 9)
7. **Group 11** — Docs, manual checklist & finalization (7 steps, depends on 10)
8. **Group 12** — Test Review & Gap Analysis (5 steps, depends on all)

**Hard gate:** group 1 must report its A18 outcome before group 6 begins. If contingency (2) is taken, group 6's hosted-dashboard scope collapses to the fallback path and group 11's AC3/AC4 checklist items change accordingly.

---

## Visual Coverage

See `visual-coverage.md` — all six screens and the one component in `analysis/design-context/INDEX.md` are covered by at least one task group.

---

## Standards Compliance

Follow standards from `.maister/docs/standards/`:
- `global/minimal-implementation.md` — every module in this plan has an immediate caller; the spec's "Deliberately not built" list is the guard (no chart library, no sanitizer, no status-bar item, no Quick Pick, no write path, no VS Code API abstraction layer)
- `global/coding-style.md`, `global/commenting.md` — camelCase modules grouped by domain, no dead code, comments only for the shim's patch and the undocumented Claude command
- `global/conventions.md` — predictable `src/<domain>/` layout, exactly two documented runtime dependencies, README and CHANGELOG, testing standards proposed at finalization
- `global/error-handling.md` — the parser never throws, per-task isolation, one output-channel sink, notifications only for the three actionable cases, disposal via `context.subscriptions`
- `global/validation.md` — host-side validation of every webview message (A2) as the "server-side always" analogue; allowlists over blocklists for message types, link schemes and path containment
- `frontend/components.md` — shared tile/chip/row/summary-card primitives in `webview/components.ts`, minimal props, composed across the five bundles
- `frontend/css.md` — VS Code theme variables as the only design tokens, minimal custom CSS
- `frontend/accessibility.md` — semantic HTML, keyboard operability, `aria-pressed`/`aria-sort`/`role="status"`, focus visible via `--vscode-focusBorder`, never colour alone, full spoken labels on tree items. The hosted dashboard and companions are the recorded exception
- `frontend/responsive.md` — Overview fluid across 250–400 px sidebar widths; panel surfaces reflow at full width
- No backend or testing standards exist for this project; group 11 proposes the testing ones

## Notes

- **Test-Driven:** each group starts with 2–8 named tests mapped to the ACs the spec's **Verified by** column assigns to a harness that can run them
- **Run Incrementally:** run only that group's new tests after each group, never the whole suite
- **Mark Progress:** check off steps here and flip the matching `data-step` marker in `implementation-plan.html`
- **Reuse First:** Maister's `dashboard.html` hosted verbatim, `HERO_MAP` transcribed, the two real task folders as committed fixture snapshots, shared webview primitives across the five bundles, VS Code theme variables as the only tokens
- **Never assign an AC to a harness the spec says cannot run it** — the extension host cannot assert inside a webview DOM
