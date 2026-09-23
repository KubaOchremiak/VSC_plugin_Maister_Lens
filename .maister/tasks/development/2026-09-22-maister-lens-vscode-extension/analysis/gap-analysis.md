# Gap Analysis: Maister Lens — VS Code extension

## TL;DR
The current state is nothing: no package.json, no src, no tests. The target is feature-spec.md in full (AC1–AC18). Every capability is a "missing feature", so the useful gaps are the places where the spec is silent, contradictory, or conflicts with the binding mockups or project docs.
Eleven such gaps need a decision before specification. Two shape the core data model and the webview security allowlist: task identity in multi-root workspaces, and the message protocol. The others have safe defaults.
The data lifecycle is complete for a read-only viewer. The extension never writes task files (§ 7 boundary), so a missing UPDATE/DELETE is intentional, not an orphan.
Risk stays **medium**; effort is **high** (~25 source modules, 5 webview bundles, ~20 fixtures, 2 test harnesses).

## Key Decisions
- Characteristics: creates_new_entities, involves_data_operations and ui_heavy are true; has_reproducible_defect and modifies_existing_code are false — greenfield, read-only data viewer with 2 views and 4 panel modes. The only existing files touched are README.md, .gitignore and .maister/docs.
- Change type is additive, compatibility "flexible" — there are no consumers. The external contracts (Maister formats, Claude Code/Copilot commands) are handled by tolerance, not compatibility.
- Spec over design-resources.md on charts; spec over the codebase-analysis note on the Resume command. § 7.1/§ 7.2/AC12 consistently use `/maister:work {relPath}`, so `/maister:<type>` is not used.
- The mockups' "Browse" and "from the Now or Browse title bar" copy is stale (Browse was merged into Overview in Phase 7); the spec wording wins.
- dashboard.html is confirmed hostable under the planned CSP. The real product-design dashboard has no inline `on*=` handlers (only addEventListener), a global `function loadData`, a single inline script, and no fetch/eval/iframe. The shim plan in § 5.3 holds.

## Open Questions / Risks
- **Multi-root identity bug in the spec.** `TaskRef.folderUri` is declared "the task's identity", but the index, `PersistedIndex.entries`, `PanelLocation` and every webview message key on `relPath`. Two workspace folders with the same `.maister/tasks/x/y` collide.
- **AC13 conflicts with the registry.** Development phase 12's activeForm is "Running E2E tests" (spec line 309). It is user-facing (Now description, fallback phases, tooltips), so it fails the string lint and breaks the honesty rule.
- **Test-instance coverage of AC11.** The @vscode/test-electron instance has no Claude Code, so AC11's pre-fill path is manual-only. Copilot Chat is built into 1.138, but a downloaded test build may lack it or the sign-in.
- **Copilot availability check is weak.** In VS Code 1.138, `workbench.action.chat.open` exists whether or not Copilot is set up, so the § 7.4 check can pass while chat cannot answer. The one-time caveat notice is the only mitigation.
- **URI fallback swallows failure.** `env.openExternal(vscode://anthropic.claude-code/open?prompt=…)` resolves `true` even when nothing handles it, so the chain rarely advances past it. It must also use `env.uriScheme`, not a hard-coded `vscode`, so Insiders and VSCodium work.
- **Orchestrator flag conflict.** `orchestrator.options.skip_test_suite: true` in this task's state contradicts the clarified test strategy.
- **Node 26 toolchain** (esbuild, mocha, test-electron) is still unverified. Scaffold and smoke-test first.

---

## Summary
- **Risk Level**: Medium
- **Estimated Effort**: High
- **Detected Characteristics**: creates_new_entities, involves_data_operations, ui_heavy

## Task Characteristics
- Has reproducible defect: no
- Modifies existing code: no (only docs and hygiene files: README.md, .gitignore, .maister/docs/project/*)
- Creates new entities: yes
- Involves data operations: yes (READ of Maister task data; C/R/U/D of the extension's own persisted index)
- UI heavy: yes (TreeView, WebviewView, 4-mode WebviewPanel, hand-written SVG charts)

## Gaps Identified

### Missing Features (all, since this is greenfield)
| Area | Spec § | Evidence of absence |
|---|---|---|
| Scaffold: package.json (contributions § 1.3 + § 1.6), tsconfig strict, esbuild with 2 targets, eslint/prettier, .vscodeignore, .vscode/launch.json, LICENSE (MIT), media/maister.svg | 1 | `ls` of the repo root: none exist |
| model/: types, workflows registry (5 types, pinned 2.2.3), parseState (N1–N15), parseSummary | 2 | — |
| index/: two-tier index with persistence, watcher, git attribution, query engine | 3 | — |
| views/: Now tree, Overview webview view | 4 | — |
| panel/: singleton panel with history; Task (hosted and fallback), Artifact (md/html), Dashboard, Risks modes; shim | 5, 6 | — |
| launch/: start workflow, next actions, 4-target resolution, terminal targeting and quoting | 7 | — |
| Trust gating, degraded modes, output channel | 8 | — |
| test/fixtures (≥ 13 hazard fixtures + 2 real task copies), unit, integration, perf generator and benchmark | 2.6, 8.6 | — |
| README (currently 1 line), CHANGELOG | conventions standard | README.md is 1 line; no CHANGELOG |

### Incomplete Features (spec gaps: specified but not implementable as written)
1. **Task identity**: keyed by `relPath`, which is not unique across workspace folders (§ 2.1 vs § 3.3/§ 3.6/§ 5.1/§ 5.6).
2. **Message protocol**: § 4.2 posts `{type:'overview'}` while § 5.6 lists `stats`. Several messages that surfaces need have no definition:

   | Message needed | Sender (spec §) |
   |---|---|
   | `setGroupBy`, or a group-collapse state channel | Overview group-by and collapse (§ 4.2) |
   | `openDashboard` | Overview "Show all", Risks breadcrumb (§ 4.2, § 5.7) |
   | `openRisks` | Dashboard KPI tile, fallback Risks heading (§ 5.5, § 5.7) |
   | `startWorkflow` | Overview empty state (§ 1.3) |
   | `clearFilter` | Overview/Dashboard "Clear filters" (§ 4.2, § 5.5) |
   | `openArtifact` | Overview hero-artifact expander (§ 4.2 rows carry only hero labels, no artifactRelPath) |
   | Risks-mode local filter (text, status toggles, show resolved, group by) | Risks mode (§ 5.7) |
   | `openExternalFile` ("Open dashboard in browser") | Fallback banner (§ 5.4) |
   | `openTask` | Reader breadcrumb and hero chips |

3. **risksMode.ts** is missing from the § 1.4 layout. `maister.openRisks` is in the § 1.3 table and the § 4.2 view/title menu, but missing from the § 1.6 menu addenda and palette `when` list.
4. **Palette invocation of task-argument commands** (`openTask`, `openArtifact`, `runNextAction`, `resumeTask`, `startDevelopmentFromDesign`, `design/developFromResearch`, `revealInExplorer`, `openArtifactSource`). § 1.3 says "Palette … when next action is Resume", but the palette has no task context and Quick Picks were declined (design-decisions D7).
5. **"Open risks" counting** is defined three ways: Now row "{n} open risks" (§ 4.1, unspecified source), Dashboard KPI "unresolved risks across all tasks" (§ 5.5), and Risks mode (state plus artifact § 7 blocks, deduplicated; § 5.7/AC18).
6. **AC13 lint mechanism**: there is no string table in § 1.4, and the registry text "Running E2E tests" violates the rule.
7. **Status-bar item** "◈ Maister: 2 unfinished" appears in the binding sidebar mockup (line 377) but in no spec contribution.
8. **Now tree "Recent artifacts"**: the mockup renders a collapsible group node, while § 4.1 lists up to 5 artifacts directly as task children.
9. **Section numbering**: § 5.7 appears before § 5.6. This is cosmetic; the spec step should renumber it.

### Behavioral Changes Needed (to existing non-code assets)
- `.maister/docs/project/tech-stack.md` says "Frontend: not applicable", "no persistence" and "no dependencies". After the build it should list webviews, the workspace-storage index, yaml and markdown-it, esbuild and mocha/test-electron.
- `.maister/docs/project/vision.md` has the key feature "Top layer view over all maister **and repository changes**". The design limits git to attribution only, so this contradicts the design.
- `.gitignore` is missing, and `.playwright-mcp/console-*.log` is tracked and modified (see git status).
- `orchestrator-state.yml` has `skip_test_suite: true`, which contradicts the clarifications.

## User Journey Impact Assessment

| Dimension | Current | After | Assessment |
|---|---|---|---|
| Reachability | None; the user opens raw files in .maister/tasks | Activity-bar container → Now/Overview; panel from any task, artifact or link | ✅ |
| Discoverability: live tasks | 1/10 (file tree) | 9/10 (activity-bar icon + view badge) | +8 |
| Discoverability: next action | n/a | 8/10 (inline ▶ on Now and Overview rows, fallback header, Dashboard Next column, editor-title) | ✅ |
| Discoverability: Dashboard/Risks | n/a | 6–7/10 (Overview title-bar icons, KPI tile, "N open risks" rows) | ⚠️ Risks icon-only in the title bar; palette entry helps |
| Discoverability: palette | n/a | 3/10 if task-argument commands are hidden; 7/10 if they bind to the panel's current task (Decision I-1) | ⚠️ |
| Flow integration | Context switch to browser or source view | Rendered reading in one panel with history; launches pre-filled in Claude Code | ✅ |
| Multi-persona | — | Marek: Now. Ada: Overview groups plus reader. Irena: Dashboard plus Risks. Untrusted workspace: read-only | ✅ |

## Data Lifecycle Analysis

### Entity: Maister task (orchestrator-state.yml + artifacts), external and read-only by design

| Operation | Backend | UI | Access | Status |
|---|---|---|---|---|
| CREATE | none in the extension; Maister creates it | Start Workflow flow (§ 7.3) composes the command | Now/Overview title bars, welcome views | ✅ indirect, by design |
| READ | parseState/parseSummary/index (§ 2–3) | Now, Overview, Task (hosted/fallback), Reader, Dashboard, Risks | Activity bar → views → panel | ✅ planned |
| UPDATE | none; Maister updates via Resume/next action | Next-action buttons | 1 click on every surface (AC17) | ✅ indirect, by design |
| DELETE | not in scope | — | Reveal in Explorer as the escape hatch | ✅ intentionally absent (§ 7 boundary) |

### Entity: Persisted index (`storageUri/index-v1.json`)
CREATE/UPDATE: atomic debounced write. READ: warm start. DELETE: on corruption or version mismatch. It is internal and has no user-facing surface, which is correct.

**Completeness**: 100% of the operations the spec requires (it is a read-only viewer).
**Orphaned Operations**: none. Risks and decisions are READ-only views of data Maister writes, and are reachable from Now, Overview (search), fallback, reader and Risks mode.
**Missing Touchpoints**:
- The palette as a touchpoint for task commands (I-1).
- A status-bar count (I-4).

Neither is safety-critical.

## Issues Requiring Decisions

### Critical (Must Decide Before Proceeding)
1. **C-1 Task identity in multi-root workspaces.** The spec keys everything on `relPath`, which collides across workspace folders.
   - Options:
     - A. Key on `folderUri` (string) everywhere: index map, persisted entries, PanelLocation, messages. Keep `relPath` for display and composed commands.
     - B. Key on `{workspaceFolderIndex}:{relPath}`.
     - C. Support a single root only in v1 (first folder containing .maister) and document it.
   - Recommendation: **A**. It matches § 2.1's own statement, costs nothing now, and index membership validation stays a single map lookup.
2. **C-2 Consolidated webview message protocol.** § 4.2 and § 5.6 disagree, and 9 needed messages are undefined (see Incomplete Features 2). Because it is also the security allowlist, the spec must list it exactly.
   - Options:
     - A. One consolidated table in the spec: rename `stats` to `overview`, and add setGroupBy, setGroupCollapsed (or keep collapse webview-local via setState as § 4.2 says), openDashboard, openRisks{relPath?}, clearFilter, startWorkflow, openArtifact from Overview (with artifactRelPath in row payloads), and openDashboardExternal{relPath}. Risks-mode filters stay webview-local over a full `risks` payload.
     - B. Same as A, but Risks-mode filtering is host-side via `setRisksFilter`.
   - Recommendation: **A**. Risk volume is small (hundreds), local filtering keeps the protocol minimal, and it matches "filter local to Risks mode". Only the type facet goes through `setFilter`.

### Important (Should Decide)
1. **I-1 Palette behaviour for task-argument commands.**
   - Options:
     - A. Show them in the palette only while the panel displays a task, acting on that task. Add context key `maister.panel.nextActionId` for the Resume/Start development/research variants, and hide them otherwise.
     - B. Hide every task-argument command from the palette (`commandPalette: when false`). Keep openRisks, openDashboard, refresh, startWorkflow and clearFilter.
     - C. Show a task Quick Pick when invoked without arguments.
   - Default: **A**
   - Rationale: it honours § 1.3 "Palette … when next action is Resume" without the Quick Pick the design declined (C contradicts D7). B is the fallback if A is judged scope creep.
2. **I-2 One definition of "open risks".**
   - Options:
     - A. Use the Risks-mode definition everywhere: state risks plus artifact § 7 risks, deduplicated per task, unresolved. It applies to Now rows, the Dashboard KPI and Risks KPIs, in one shared function.
     - B. Now and KPIs count state risks only.
   - Default: **A**
   - Rationale: counts must match what the click opens (Now row → Risks mode, AC18).
3. **I-3 AC13 versus registry wording, and the lint mechanism.**
   - Options for wording:
     - A. Reword the registry activeForm "Running E2E tests" to "Executing E2E tests", matching "Executing implementation".
     - B. Exempt Maister-sourced text from AC13.
   - Options for the lint:
     - (i) A central `src/strings.ts` catalogue that is linted.
     - (ii) A unit test that scans string literals in src/**/*.ts and media/** (the registry included), excluding comments and log calls.
   - Default: **A + (ii)**
   - Rationale: honesty intent over verbatim transcription. A scan needs no new module (minimal implementation) and also catches webview-side literals. Task data (titles, decisions) is user content and out of scope for the lint.
4. **I-4 Status-bar item from the sidebar mockup.**
   - Options:
     - A. Omit it; the view badge already carries the count and § 1.6 claims to be the complete manifest.
     - B. Add a status-bar item "Maister: N unfinished" that focuses the Now view.
   - Default: **A**
   - Rationale: it is not in the spec or the ACs. If kept, it needs honest wording only ("unfinished" is fine).
5. **I-5 Now tree "Recent artifacts" structure.**
   - Options:
     - A. Follow the mockup: a collapsible "Recent artifacts" group node with up to 5 children.
     - B. Follow the spec text: artifacts as direct task children.
   - Default: **A**
   - Rationale: mockups are binding for layout, and a group keeps the task node compact.
6. **I-6 Integration-test VS Code build.**
   - Options:
     - A. Let test-electron download pinned `stable` (cached in .vscode-test/), plus an optional run on the 1.90.0 engine floor.
     - B. Point at the installed `/Applications/Visual Studio Code.app` (1.138).
   - Default: **A**, stable only in the default script, with 1.90.0 as a separate `test:min` script.
   - Rationale: reproducible runs, and it checks the declared engine. In both cases the AC11 Claude Code pre-fill is verified manually and by a mocked executeCommand in unit tests.
7. **I-7 `skip_test_suite: true` in this task's orchestrator options.**
   - Options:
     - A. Set it to false so the verification phase runs the new unit and integration suites.
     - B. Keep it true and run only targeted tests.
   - Default: **A**
   - Rationale: the clarifications chose unit plus integration suites. Skipping them at verification would leave AC coverage unproven.
8. **I-8 Project-doc and standards follow-ups.**
   - Options:
     - A. In this task's finalization, update tech-stack.md (webviews, persistence, deps, toolchain), fix the vision.md "repository changes" line, write README and CHANGELOG, and propose testing standards from § 8.6 via /maister:standards-update.
     - B. Do README/CHANGELOG only and leave the docs and standards for later.
   - Default: **A**
   - Rationale: the conventions standard requires up-to-date docs and a changelog, and the docs currently contradict the shipped design.
9. **I-9 Repo hygiene.**
   - Options:
     - A. Add a .gitignore (node_modules, dist, out, *.vsix, .vscode-test/, .playwright-mcp/) and untrack the tracked .playwright-mcp log with `git rm --cached`.
     - B. Only add the .gitignore.
   - Default: **A**
   - Rationale: the log is tool noise that is already showing as modified.
10. **I-10 Claude Code URI fallback semantics.**
    - Options:
      - A. Treat the URI as the claudeCode target's last attempt. Build it with `env.uriScheme`, and treat it as terminal success (openExternal cannot report "unhandled"). Only use it when the extension is installed but the command is missing or throws.
      - B. Skip the URI and go straight to the next target.
    - Default: **A**
    - Rationale: this is the clarified choice. The note makes explicit that a URI "success" ends the chain, and gating on the extension being installed avoids opening a dead link.
11. **I-11 Fixture tooling.**
    - Options:
      - A. Copy the two real task folders into test/fixtures, hand-write hazard fixtures, generate the 300-task set at benchmark time (not committed), and create the two-author git repo in a temp dir during the integration test.
      - B. Commit the generated fixtures.
    - Default: **A**
    - Rationale: a small repo and deterministic generation. The real copies must be snapshots, so the live tasks can keep changing.

## Recommendations
- Resolve C-1 and C-2 in the spec step first; both ripple into types.ts, taskIndex.ts, panel.ts and every webview.
- Scaffold and smoke-test the toolchain on Node 26 (esbuild bundle, one mocha test, one test-electron launch) before any feature group.
- Plan task groups bottom-up: scaffold → model + fixtures → index/watcher/attribution → Now + Overview → panel (Task-fallback, Reader, hosted Dashboard/companion + shim, Dashboard mode, Risks) → launch → trust, degraded modes and docs. Only pure modules (model, query, recognize/insert, link rewrite, quoting, target order, next-action derivation) are unit-tested without the host.
- Put message validation, path containment and the risk-count function in single shared modules, reused by all modes.
- Share webview components (tile, chip, row, summary card) across the overview, dashboardMode and risksMode bundles via esbuild imports; do not duplicate them per bundle.

## Risk Assessment
- **Complexity Risk**: High breadth (4 panel modes, persisted index, CSP hosting, launch chain) with moderate depth per module. The spec is detailed enough to limit design churn.
- **Integration Risk**: Medium. Undocumented Claude Code command, a weak Copilot availability check, dashboard-data.js loading via script injection, and Maister schema drift.
- **Regression Risk**: Low. There is no existing code or consumers. The only edits outside src touch docs, README and .gitignore.
