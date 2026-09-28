# Implementation Plan: Lens nav fixes + Follow-ups view

## TL;DR
There are 4 task groups and 30 steps, with about 22-34 tests expected. Group 1 (navigation and label fixes) and Group 2 (Follow-ups model) can run in parallel. Group 3 (Follow-ups view, entry points, removing Risks, and the CSS expander fix) depends on both. Group 4 (docs, the checklist grep and test review) runs last. The three red-gate tests must go green, and the bug-4 expander test moves to the Follow-ups view in Group 3.

## Key Decisions
- The CSS `[hidden]` fix goes in Group 3, not Group 1. The bug-4 red test is rewritten against the Follow-ups view, so the fix and its test land together.
- Group 1 owns the shared files for the navigation changes (`messages.ts`, `panel.ts`, `strings.ts`). Group 3 touches the same files again, so Group 3 depends on Group 1, and the executor runs them one after the other.
- Group 2 is kept pure model: `followUps.ts`, the `dashboard-data.js` reader, `parseState` `e2eFollowUp`, and fixtures. It has no UI or panel wiring, so it can run in parallel with Group 1.
- `risks.ts` and `risksMode.ts` are deleted in the same group that introduces their replacements (2 and 3). No Risks and Follow-ups code exists side by side after a group is finished.

## Open Questions / Risks
- The working tree has uncommitted project-docs changes in `panel.ts`, `messages.ts`, `render.ts`, `strings.ts`, `reader.ts`, `navTree.ts` and several tests. Edit on top of them, and never checkout or reset.
- `panel.ts` is edited by two groups (1 and 3). The line numbers in the spec will drift, so locate code by symbol, not by line number.
- Navigate containment is security-relevant. The full FR2 accept/refuse matrix must pass before Group 3 starts.
- `dashboard-data.js` in the real repo tasks is often non-JSON. Those files are skipped by design, so real tasks may show fewer Issue rows than a user expects.

## Overview
Total Steps: 30
Task Groups: 4
Expected Tests: ~22-34 (3 red-gate tests turned green + 5-8 per group + up to 10 in the review)

## Implementation Steps

### Task Group 1: Companion navigation fixes (bugs 1, 2 + FR3)
**Dependencies:** None
**Files to Modify:** src/webview/shim.ts, src/strings.ts, src/panel/messages.ts, src/panel/panel.ts, test/dom/shim.spec.ts, test/unit/messages.test.ts, test/unit/strings.test.ts, test/integration/panel.test.ts
**Estimated Steps:** 7

- [x] 1.0 Complete the companion navigation fixes
  - [x] 1.1 Write or confirm 4-8 focused tests
    - The red tests already exist: `test/dom/shim.spec.ts` (label '← Lens Dashboard') and `test/unit/messages.test.ts` "a companion page navigates relative to its own folder…".
    - Add the FR2 matrix to messages.test.ts:
      - accepted: `../dashboard.html` from base `implementation`, which resolves to `dashboard.html`;
      - refused: `../../x`, `%2e%2e/%2e%2e/x`, `https://…`, `/abs`, `..\x`;
      - with an empty base (task mode), behaviour is unchanged.
    - Add an integration test: a refused navigate triggers `showWarningMessage` (stub `vscode.window.showWarningMessage`).
  - [x] 1.2 Add the `SHIM.lensBack` string ("← Lens Dashboard"). In `shim.ts` `backLink()`, use it for both the text and the aria-label. The link still posts `openDashboard`. Leave `FALLBACK.breadcrumb` untouched.
  - [x] 1.3 Add `hostBaseRelDir?: string` to `MessageContext` in messages.ts. It is set by the panel only and never read from the message.
  - [x] 1.4 Extend `validateNavigate`/`resolveInside` to follow the FR2 order: strip `#`/`?`, decode, refuse a scheme, absolute path or backslash (checked on the decoded href), join with `hostBaseRelDir`, normalize, then apply `containedRelPath` against the task root. Refusals return a reason string.
    - Reuse: `resolveInside`, `containedRelPath` (src/model/relPath.ts).
  - [x] 1.5 In panel.ts, set `hostBaseRelDir = dirname(artifactRelPath)` when building the artifact context (`buildArtifact`/`hostCompanion`). In task mode, set it to `''`. Accepted paths go through the existing `route()`, so `dashboard.html` routes to mode `task`.
  - [x] 1.6 On refusal, call `vscode.window.showWarningMessage(reason)` in addition to the existing output-channel log. The user-facing text lives in strings.ts.
  - [x] 1.7 Ensure the Group 1 tests pass
    - Run only: `npm test -- --grep "navigat|companion"`, the shim DOM spec (`npx playwright test test/dom/shim.spec.ts` after build), and the panel warning integration test.

**Acceptance Criteria:**
- The red tests for bugs 1 and 2 are green, and the FR2 matrix passes.
- A refused navigate shows a warning, and `../dashboard.html` from a companion opens the task dashboard.
- `npm run typecheck` and `npm run lint` are clean for the touched files.

### Task Group 2: Follow-ups model + dashboard-data.js reader
**Dependencies:** None
**Files to Modify:** src/model/followUps.ts (new), src/model/risks.ts (delete), src/model/parseState.ts, src/model/types.ts, src/index/taskIndex.ts (comment only), test/unit/followUps.test.ts (new), test/unit/risks.test.ts (delete), test/unit/parseState.test.ts, test/fixtures/tasks/fu-completed/**, test/fixtures/tasks/fu-unquoted/**, test/fixtures/tasks/fu-expr/**, test/fixtures/tasks/fu-inprogress/**
**Estimated Steps:** 8

- [x] 2.0 Complete the Follow-ups model
  - [x] 2.1 Write 6-8 focused unit tests in `test/unit/followUps.test.ts`:
    - reader: a JSON-style file is accepted; unquoted-key, expression and bad-shape files are skipped (null) without throwing; the file is never evaluated (a file containing `throw`/side-effect code is only parsed as text);
    - `collectFollowUps`: completed-only, all four sources on the fixture, the deferral regex match and non-match, a string `e2e_followup` gives 1 item and a list gives N, and the verdict counts.
  - [x] 2.2 Create the fixtures:
    - `fu-completed`: `status: completed`, a verdict, an unresolved phase risk, `verification_context.e2e_followup`, a "deferred … follow-up" decision, and a JSON-style `dashboard-data.js` holding fixed and unfixed issues;
    - `fu-unquoted` and `fu-expr`: `dashboard-data.js` variants;
    - `fu-inprogress`: a non-completed task.
  - [x] 2.3 In parseState.ts, read `verification_context.e2e_followup` defensively (string or string[]) into `Task.e2eFollowUp: string[]`. Update types.ts. Keep the tolerant style.
  - [x] 2.4 Implement `readDashboardData(text)`: strip `window.MAISTER_DATA =` and the trailing `;`, try `JSON.parse`, fall back to `yaml`. Then apply the shape check: `verification` must be an object and `issues` an array, and every issue needs a string `description`, a `severity` in critical|warning|info and a boolean `fixed`. Any failure skips the whole file. Never eval.
  - [x] 2.5 Implement `collectFollowUps(tasks, dataByFolder, scope?)`. It returns groups per completed task with rows `{text, source: 'issue'|'risk'|'deferred'|'e2e', severity?}` plus verdict counts (passed / passed_with_issues / failed) taken from `Task.verdict`.
    - Reuse: the unresolved-risk logic from `collectRisks` (source b). Deferred decisions match `/\bdefer\w*\b.*\bfollow[- ]?up\b/i`.
  - [x] 2.6 Add a count helper (replacing `openRiskCount`) that returns `{count, tasks}` for the KPI.
  - [x] 2.7 Delete `src/model/risks.ts` and `test/unit/risks.test.ts`. Update the taskIndex.ts:479 comment. Callers in panel.ts are switched in Group 3; until then, keep the build compiling by moving the imports in the same change if needed.
  - [x] 2.8 Ensure the Group 2 tests pass: `npm test -- --grep "followUps|dashboard-data|parseState"`.

**Acceptance Criteria:**
- 6-8 new unit tests pass, and non-JSON variants are skipped without error.
- The persisted index schema is unchanged (dashboard-data is not stored).

### Task Group 3: Follow-ups view, entry points, Risks removal, expander CSS (bugs 3, 4)
**Dependencies:** 1, 2
**Files to Modify:** src/webview/followUpsMode.ts (new, refactored from risksMode.ts), src/webview/risksMode.ts (delete), src/webview/dashboardMode.ts, src/webview/fallbackTask.ts, src/views/overviewView.ts, src/views/nowTree.ts, src/panel/panel.ts, src/panel/messages.ts, src/strings.ts, media/webview.css, package.json, test/dom/surfaces.spec.ts, test/dom/harness.ts, test/dom/themes.spec.ts, test/unit/manifest.test.ts, test/unit/messages.test.ts, test/unit/strings.test.ts, test/integration/followUpsMode.test.ts (new, replaces risksMode.test.ts), test/integration/risksMode.test.ts (delete), test/integration/dashboardMode.test.ts, test/integration/fallbackTask.test.ts, test/integration/nowTree.test.ts
**Estimated Steps:** 10

- [x] 3.0 Complete the Follow-ups view and replace Risks
  - [x] 3.1 Write or migrate 6-8 focused tests:
    - move the bug-4 red test in surfaces.spec.ts to "a Follow-ups group expander hides and reveals its list", and update harness.ts to the followUps mode;
    - a DOM test for the verdict breakdown and the source/severity chips;
    - integration tests: the scoped empty state for `fu-inprogress`; fallback/overview "Follow-ups" links open the scoped view; the Now tree has no risks node; the Dashboard KPI shows the Follow-ups count and "across {k} tasks";
    - the manifest test covers `maister.openFollowUps`.
  - [x] 3.2 Add the global `[hidden]{display:none !important}` rule to media/webview.css. Rename the `.risks*` classes to follow-ups equivalents using the existing tokens.
  - [x] 3.3 Refactor risksMode.ts into followUpsMode.ts. It renders the verdict breakdown at the top, then groups per task using the existing `groupHeader`/`groupCard` expanders (keep `aria-expanded` in sync). Rows are built with `components.row()`, with a text source chip and a severity chip for Issues only. The scoped non-completed task shows the empty state "Follow-ups appear once this task is completed.". Delete risksMode.ts.
  - [x] 3.4 Row click: Issue and E2E rows post an open-task-dashboard message (mode `task`); Risk and Deferred rows use the existing `openTask` path.
  - [x] 3.5 Messages: rename `openRisks` to `openFollowUps` (type plus validation, optional `folderUri`).
  - [x] 3.6 Panel:
    - `Location` mode `risks` becomes `followUps`, in every mode check, the handler, the deserializer and the command registration `maister.openFollowUps`;
    - `risksPayload` becomes `followUpsPayload`. It reads `dashboard-data.js` asynchronously for completed tasks and calls `collectFollowUps`;
    - the KPI is recomputed on an index refresh and on the `dashboard-data.js` watcher, with no cache.
  - [x] 3.7 Strings: replace the `RISKS` block with `FOLLOW_UPS`; remove `NOW.openRisks*`; convert `FALLBACK.openRisksLabel`, `DASHBOARD.openRisks*` and `titleRisks`.
  - [x] 3.8 Entry points:
    - dashboardMode "Open risks" tile becomes a "Follow-ups" tile;
    - the fallbackTask.ts heading link and the overviewView.ts handler (and its line-127 comment) post or execute `openFollowUps` with the task folderUri;
    - remove the `risks` node kind, child and `risksItem` from nowTree.ts;
    - package.json: description, command and menus.
  - [x] 3.9 Update or remove the remaining Risks tests (themes.spec.ts, strings.test.ts, dashboardMode/fallbackTask/nowTree integration).
  - [x] 3.10 Ensure the Group 3 tests pass. Run only the migrated and new specs: `npm test -- --grep "manifest|messages|strings"`, `npx playwright test test/dom/surfaces.spec.ts test/dom/themes.spec.ts` (after `npm run build`), and the affected integration suites.

**Acceptance Criteria:**
- The bug-4 test (now on Follow-ups) is green, and every group arrow collapses and expands its list.
- The Dashboard tile, the command and the per-task links all open Follow-ups. The Now tree has no risks node.
- `grep -rnE "openRisks|mode: 'risks'|RISKS\.|risksMode|collectRisks" src package.json test` returns nothing.

### Task Group 4: Docs + Test Review & Gap Analysis
**Dependencies:** 1, 2, 3
**Files to Modify:** README.md, CHANGELOG.md, test/**/*.test.ts, test/dom/*.spec.ts
**Estimated Steps:** 5

- [x] 4.0 Review, document and fill critical gaps
  - [x] 4.1 Review the tests from Groups 1-3 (about 16-24 tests) against FR1-FR10.
  - [x] 4.2 Analyze the gaps for this feature only. Likely candidates: the Follow-ups watcher refresh, a bad-shape issue item mid-list, a scoped view of a completed task with zero follow-ups.
  - [x] 4.3 Write up to 10 additional strategic tests.
  - [x] 4.4 Update README (lines ~5, 47, 61, 81, 141: Follow-ups replaces Risks, and the Now node is removed) and CHANGELOG (the navigation fixes, the expander fix, Follow-ups).
  - [x] 4.5 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration` and `npm run test:dom`. Run the checklist grep.

**Acceptance Criteria:**
- All feature tests pass (~22-34 total), with no more than 10 added in this group.
- All three suites plus lint and typecheck pass, and the checklist grep is empty.

## Execution Order

1. Group 1: Companion navigation fixes (7 steps). Runs in parallel with Group 2.
2. Group 2: Follow-ups model (8 steps). Runs in parallel with Group 1.
3. Group 3: Follow-ups view, entry points, Risks removal (10 steps). Depends on 1 and 2.
4. Group 4: Docs + Test Review (5 steps). Depends on 1, 2 and 3.

## Standards Compliance

Follow the standards in `.maister/docs/standards/`:
- global/: minimal-implementation (delete Risks code, no aliases), coding-style, error-handling (warning on refusal, graceful skip on parse failure), validation (allowlist containment, shape checks), conventions (README/CHANGELOG, no new dependencies).
- frontend/: accessibility (`aria-expanded`, a labelled back button, text chips), css (existing tokens), components.

## Notes

- Test-driven: each group starts with its tests, including the red-gate tests.
- Run incrementally: after each group, run only the new and affected tests.
- Mark progress: check off steps as they are completed.
- Reuse first: risksMode expanders, `components.row()`, `resolveInside`/`containedRelPath`, `route()`, the parseState risk extraction.
- The tree is dirty: layer every edit on the current uncommitted state.
