# Specification: Lens nav fixes + Follow-ups view

## TL;DR
Fix three Lens defects from `test/bugs.md`: the shim back button gets its own label, companion `../dashboard.html` navigation works, and expanders collapse again. Replace the Risks view with a Follow-ups view:
- It is built only from tasks with `status === 'completed'`, grouped by task, with a verdict breakdown taken from `Task.verdict` at the top.
- Every per-task Risks link opens Follow-ups scoped to that task.
- The Now-tree risks node is removed.

The existing risksMode, risks aggregation and containment helpers are reused. The new Follow-ups model includes a shape-validated `dashboard-data.js` reader: JSON.parse first, then `yaml`, never executed.

## Key Decisions
- New string for the shim button ("← Lens Dashboard"). `FALLBACK.breadcrumb` stays unchanged: nothing competes with it in the fallback view.
- Navigate hrefs resolve against the companion's folder (`MessageContext.hostBaseRelDir`), and containment is still checked against the task root. This keeps the security boundary.
- A refused navigate shows a VS Code warning (error-handling standard: clear user messages) and is also logged.
- A global `[hidden]{display:none !important}` rule fixes the expanders, and any other flex/grid element hidden with `hidden`.
- Risks is removed entirely: command `maister.openRisks` → `maister.openFollowUps`, panel mode `risks` → `followUps`, message `openRisks` → `openFollowUps`, Dashboard KPI, Now tree node and strings. No aliases are kept, following the no-backward-compat standard.
- `dashboard-data.js` reader:
  - Strip `window.MAISTER_DATA =` and the trailing `;`.
  - Try `JSON.parse` first, then `yaml`.
  - Keep an issue only if it has a string `description`, `severity` in `critical|warning|info`, and a boolean `fixed`. Any other shape skips the whole file silently.
  - The file is never executed.
- "Completed" means `task.status === 'completed'`. There is no dismissal: every follow-up of a completed task always shows. Artifact §7 risk blocks, `residual_issues` and `fixes_applied` are excluded.
- The Now-tree risks node is dropped with no replacement, because the Now tree lists unfinished tasks only.
- Per-task Risks links (fallback view, overview) become "Follow-ups" links that open the view scoped to that task.
- No count cache. Counts are recomputed on an index refresh and on a `dashboard-data.js` watcher change.
- Row click: Issue and E2E rows open the task dashboard. Risk and Deferred rows open the task.

## Open Questions / Risks
- The working tree has uncommitted project-docs changes in panel.ts, messages.ts, render.ts, strings.ts, reader.ts and navTree.ts. Edits must be layered on top of them, not on HEAD.
- The deferred-decision regex is a heuristic. It may miss deferrals worded differently. This is accepted.
- `dashboard-data.js` files that use unquoted keys or JS expressions are skipped by design, so they contribute no Issue rows. Tasks are still listed through their other sources. This is accepted rather than adding a JSON5 dependency.
- The shape of `verification_context` and `dashboard-data.js` varies between Maister versions. Every field must be read defensively.
- Navigate containment is security-relevant. Tests must cover both the accept case and the escape/refuse case.

## Goal
Make the companion navigation in Maister Lens unambiguous and working, make collapsible lists actually collapse, and replace the Risks view with a Follow-ups view. Follow-ups lists what is still left to do after completed tasks.

## User Stories
- As a Lens user on a companion page, I want the two back controls clearly labelled so that I know which dashboard each one opens.
- As a Lens user, I want Maister's native "Dashboard" link on a companion to open that task's dashboard.
- As a Lens user, I want the group arrows to collapse and expand their lists.
- As a Lens user, I want one Follow-ups view listing the outstanding actions from completed tasks, with a verdict breakdown, so that I can plan follow-up work.

## Core Requirements
1. **FR1**: The shim-injected button (`nav.maister-lens-back`) reads "← Lens Dashboard", taken from a new dedicated string that is also used for the aria-label. It still posts `openDashboard`. `FALLBACK.breadcrumb` is unchanged.
2. **FR2**: `navigate` from a hosted companion (mode `artifact`) resolves the href relative to `hostBaseRelDir`, which is `dirname(artifactRelPath)`.
   - `hostBaseRelDir` is set by the panel only, never read from the message.
   - Processing order:
     1. Strip `#`/`?`.
     2. Decode.
     3. Refuse a scheme, an absolute path or a backslash, checked on the decoded href alone.
     4. Join with `hostBaseRelDir`.
     5. Normalize and apply `containedRelPath` against the task root.
   - `../dashboard.html` from `implementation/spec.html` resolves to `dashboard.html` and routes to mode `task`.
   - Test matrix:
     - accepted: `../dashboard.html`;
     - refused: `../../x`, `%2e%2e/%2e%2e/x`, `https://…`, `/abs`, `..\x`.
3. **FR3**: A refused `navigate` shows a `vscode.window.showWarningMessage` in addition to the output-channel log.
4. **FR4**: `media/webview.css` gets a global `[hidden]{display:none !important}` rule. Group expanders then hide and reveal their lists.
5. **FR5**: The Follow-ups view replaces the Risks view:
   - It covers tasks with `status === 'completed'` only, and can be scoped to one task through `folderUri`.
   - A scoped view of a task that is not completed shows an empty-state message: "Follow-ups appear once this task is completed."
   - A verdict breakdown at the top shows passed, passed with issues and failed, computed from `Task.verdict`.
   - Follow-ups are grouped by task in collapsible groups, using the fixed expander.
   - There is no dismissal.
6. **FR6**: Each row shows:
   - the follow-up text;
   - a source chip (Issue / Risk / Deferred / E2E);
   - a severity chip, for Issues only.

   Clicking a row opens:
   - the task dashboard (mode `task`) for Issue and E2E rows;
   - the task (the same `openTask` path) for Risk and Deferred rows.

   There is no "show resolved" toggle.
7. **FR7**: Follow-ups come from four sources:
   - (a) `verification.issues[]` in the task's `dashboard-data.js` where `fixed === false`. The file must pass the shape check in Key Decisions, otherwise it is skipped.
   - (b) unresolved `phase_summaries.*.risks` from `orchestrator-state.yml`.
   - (c) `verification_context.e2e_followup`. A string is a single item, and a list gives one item per string entry. Long text wraps in the row and is not split.
   - (d) recorded decisions matching `/\bdefer\w*\b.*\bfollow[- ]?up\b/i`.
8. **FR8**: Entry points change as follows. All Risks-only strings and code are removed; see the consumer checklist below.
   - Dashboard KPI tile "Follow-ups" with the open count and a "across {k} tasks" context line.
   - The Now-tree risks node is removed, with no replacement.
   - Command `maister.openFollowUps`.
   - Panel mode `followUps` and message `openFollowUps`.
   - The per-task links in the fallback view and the overview become "Follow-ups" and open the view scoped to that task.
9. **FR9**: Tasks search still matches risk text (query.ts unchanged). The fallback task view keeps its risks section content. Only its heading link changes (FR8).

### Risks consumer checklist (all must be converted or removed)
- `package.json`: description (line 4), command `maister.openRisks` (~139-140), menus (~251, ~330).
- `src/panel/panel.ts`:
  - `Location` union (57);
  - mode checks (466, 646, 714, 1571, 1638, 1660);
  - `openRisks` handler (553);
  - dashboard KPI key `openRisks` (785-822);
  - `risksPayload` (955) and its KPI (1020);
  - command registration (1726);
  - deserializer (1761-1764).
- `src/panel/messages.ts`: `openRisks` message type (62) and validation (345-352), renamed to `openFollowUps`.
- `src/strings.ts`:
  - `NOW.openRisks`/`openRisksOne` (130-131), removed;
  - `FALLBACK.openRisksLabel` (274) and `DASHBOARD.openRisksContext`/`openRisksLabel` (299-300), converted;
  - `titleRisks` (201);
  - the whole `RISKS` block (354-395), replaced by a `FOLLOW_UPS` block.
- `src/views/nowTree.ts`: the `risks` node kind, child and `risksItem` (26, 131, 190-195, 353-359), removed.
- `src/webview/fallbackTask.ts` 82-90 and `src/views/overviewView.ts` 127, 490-494: converted to Follow-ups.
- `src/webview/risksMode.ts` and `src/model/risks.ts`: replaced by the Follow-ups view and model. The `src/index/taskIndex.ts` 479 comment is updated.
- README: lines 5, 47, 61 (Now node), 81 (Risks row), 141.
- Tests:
  - `test/unit/risks.test.ts`, `test/integration/risksMode.test.ts`, `test/dom/themes.spec.ts`, `test/dom/harness.ts`, `test/unit/strings.test.ts`;
  - `test/integration/dashboardMode.test.ts`, `test/integration/fallbackTask.test.ts`, `test/integration/nowTree.test.ts`;
  - `test/unit/manifest.test.ts`, `test/dom/surfaces.spec.ts`.
- Acceptance: `grep -rnE "openRisks|mode: 'risks'|RISKS\\.|risksMode|collectRisks" src package.json test` returns nothing.
10. README and CHANGELOG describe Follow-ups instead of Risks and mention the navigation fixes.

## Reusable Components

### Existing Code to Leverage
- `src/webview/risksMode.ts`: the group header and expander (`groupHeader` ~333-393, `groupCard` ~395-407), the KPI strip and the empty states. This file is refactored into the Follow-ups view rather than duplicated.
- `src/model/risks.ts` (`collectRisks`, `openRiskCount`): the aggregation and resolution pattern for source (b). It is replaced by, or folded into, the Follow-ups model.
- `src/webview/components.ts` `row()` 137-190 and its chip helpers, for rows and chips.
- `src/panel/messages.ts` `resolveInside` 113-127 and `validateNavigate` 246-251, extended to accept the `hostBaseRelDir` base. `src/model/relPath.ts` `containedRelPath` 16-35 handles containment.
- `src/panel/panel.ts`:
  - `route()` 587-607, which already maps `DASHBOARD_FILE` to `show({mode:'task'})`;
  - `buildArtifact`/`hostCompanion` 1125-1177, which will supply the task folder and artifact dir;
  - `risksPayload` ~947 and the dashboard KPI build ~785-822, both renamed and repointed.
- `src/model/parseState.ts`: its tolerant parsing style and the existing risks (187-260, 531-599) and verdict (566) extraction. It is extended with `e2e_followup`.
- The `yaml` runtime dependency is the fallback parser for `dashboard-data.js`, after `JSON.parse`. No new dependency is needed.
- `src/webview/dashboardMode.ts` "Open risks" KPI (500-504) becomes the Follow-ups tile.

### New Components Required
- **Follow-ups model** (`src/model/followUps.ts`). It replaces `risks.ts`. Nothing today combines several sources with completed-only filtering and a verdict breakdown.
- **dashboard-data.js reader**, a small function in the model layer. The extension never reads this file today (it only watches it to refresh the shim).
- **Test fixtures**:
  - a completed task with a JSON-style `dashboard-data.js` holding unfixed issues, an `e2e_followup`, a deferred decision and an unresolved risk;
  - `dashboard-data.js` variants with unquoted keys and with JS expressions, both expected to be skipped;
  - a non-completed task, for the scoped empty state.

  The existing fixtures have empty verification data.

## Technical Approach
- **Bug 1**: `shim.ts` `backLink()` uses the new string, for example `SHIM.lensBack`.
- **Bug 2**:
  - `MessageContext` gains `hostBaseRelDir`, set by the panel only.
  - In mode `artifact`, the panel provides the task folder as the host folder plus `dirname(artifactRelPath)` as the base.
  - `validateNavigate` follows the FR2 processing order.
  - The accepted relative path goes through the existing `route()`.
  - Refusals return a reason, which the panel shows with `showWarningMessage`.
  - Task-mode (dashboard.html) behaviour is unchanged: its base is empty.
- **Bug 4**: CSS rule only. No JS change is needed in the expander.
- **Follow-ups data flow**:
  1. The index builds the Task, and parseState adds `e2eFollowUp`.
  2. The panel builds the payload for completed tasks. It reads `dashboard-data.js` asynchronously and does not store it in the persisted index, which keeps the index schema unchanged.
  3. `collectFollowUps` returns rows grouped by task, each row with `{text, source, severity?}`, plus verdict counts from `Task.verdict`.
  4. The rows are posted to the followUps webview mode.
- The Dashboard KPI count reuses `collectFollowUps`. It is recomputed on an index refresh and when the existing `dashboard-data.js` watcher fires (taskIndex.ts:572). There is no cache.

## Implementation Guidance

### Testing Approach
- Write 2-8 focused tests per implementation step group. Test verification runs only the new and affected tests, not the entire suite.
- The red tests from `implementation/tdd-red-gate.md` must go green:
  - `test/dom/shim.spec.ts` (label);
  - `test/unit/messages.test.ts` "a companion page navigates relative to its own folder…";
  - `test/dom/surfaces.spec.ts` expander test, moved to the Follow-ups view.
- Add these tests:
  - the FR2 navigate test matrix;
  - a warning is shown on refusal (integration);
  - unit tests for the `dashboard-data.js` reader: JSON accepted; unquoted-key, expression and bad-shape files skipped; never evaluated;
  - unit tests for `collectFollowUps`: completed-only, the four sources, the regex match and non-match, a string `e2e_followup` as one item, verdict counts;
  - the scoped empty state for a non-completed task;
  - the manifest test for `maister.openFollowUps`;
  - the Now tree no longer shows a risks node;
  - the fallback and overview Follow-ups link opens the scoped view.
- Update or remove tests that reference the Risks mode, command or strings.

### Standards Compliance
- `global/minimal-implementation.md`, `global/coding-style.md`: no parallel Risks and Follow-ups code, delete Risks code, no aliases.
- `global/error-handling.md`: a user-visible message on refused navigation, and graceful degradation when `dashboard-data.js` fails to parse.
- `global/validation.md`: allowlist containment for navigate, and type checks on every parsed field.
- `global/conventions.md`: README and CHANGELOG updates, no new dependencies.
- `frontend/accessibility.md`: expander `aria-expanded` stays in sync, the back button has an accessible label, and chips carry text rather than relying on colour alone.
- `frontend/css.md`: use existing tokens and classes from the risks styles, renamed as needed.

## Out of Scope
- `residual_issues` and `fixes_applied` as sources, and artifact §7 risk blocks.
- Stats beyond the verdict breakdown.
- Any change to Maister's own `dashboard.html` or companion HTML.
- A resolved/unresolved toggle in Follow-ups.
- Changes to Tasks search or to the fallback task view's risks section.

## Success Criteria
- Companion pages show "← Lens Dashboard" (Lens) and Maister's own "← Dashboard". Clicking the native link opens the task dashboard.
- An href that escapes the task folder is refused, and the user sees a warning.
- Every Follow-ups group arrow collapses and expands its list.
- The Dashboard tile, the command and the per-task links all open Follow-ups. The Now tree has no risks node. The checklist grep returns nothing.
- Follow-ups shows only completed tasks and the correct counts for the four sources in the new fixture, plus the verdict breakdown. Non-JSON `dashboard-data.js` variants are skipped without error.
- `npm test`, `npm run test:integration` and `npm run test:dom` all pass.
