# Requirements

## TL;DR
Fix three navigation/UI defects and replace the Lens Risks view with a Follow-ups view. Follow-ups is built only from the final outcomes of completed tasks, grouped by task, with a verdict breakdown at the top.

## Key Decisions
- Every Risks entry point becomes Follow-ups: the command, the Now tree node, the panel mode, the Dashboard tile and strings. No backward compatibility.
- Sources: unfixed verification issues (dashboard-data.js), unresolved state risks, deferred decisions, and `e2e_followup`.
- Artifact §7 risk blocks are excluded because they are intermediate products.

## Initial description (test/bugs.md)
1. Two stacked "← Dashboard" buttons on content preview pages. Rename the plugin one to "← Lens Dashboard".
2. On a page opened from the dashboard (e.g. Specification), the native Maister "Dashboard" back link does nothing. It should go back to Maister's dashboard.
3. Replace the issue list on the dashboard with "Follow-ups": actions aggregated from task summaries, plus other valuable stats. Count only final task outcomes, not intermediate products.
4. The small arrows on the issue list don't open or close content.

## Functional requirements
- FR1: The shim-injected back button reads "← Lens Dashboard" and gets a new dedicated string. `FALLBACK.breadcrumb` is unchanged.
- FR2: `navigate` from a hosted companion resolves the href relative to the companion's folder (`hostBaseRelDir`) and stays contained within the task folder. `../dashboard.html` opens the task's Maister dashboard (mode 'task').
- FR3: A refused navigation shows the user a VS Code warning message, not just a log line.
- FR4: A global `[hidden]{display:none !important}` rule, so expanders actually collapse.
- FR5: A Follow-ups view replaces Risks. It covers completed tasks only and is grouped by task with collapsible groups. The verdict breakdown sits at the top (passed / passed with issues / failed).
- FR6: Each row shows its text, a source chip (Issue / Risk / Deferred / E2E) and severity for issues. Clicking a row opens the source artifact or task. There is no resolved toggle.
- FR7: Sources are:
  - unfixed `verification.issues` from dashboard-data.js (strip the `window.MAISTER_DATA =` prefix, parse with yaml, skip on failure, never execute);
  - unresolved `phase_summaries.*.risks` from orchestrator-state.yml;
  - `verification_context.e2e_followup`;
  - decisions matching the narrow phrase "defer…follow-up".
- FR8: Entry points are renamed: Dashboard tile "Follow-ups" with the open count, the Now tree node, the command (maister.openFollowUps) and the panel mode.
- FR9: Risks stay searchable in Tasks search (unchanged).

## User journey
Users reach Follow-ups from the Lens Dashboard tile, the Now tree node or the command palette. From there they review what still needs doing after completed tasks and click through to the source.

## Reuse
- risksMode.ts: grouping, group header and expander, KPI structure.
- model/risks.ts: aggregation pattern.
- components.ts: chip and row.
- messages.ts `resolveInside` and relPath `containedRelPath` for containment.
- parseState.ts: tolerant parsing.

## Visual assets
None. Mockups were skipped by the user. Follow the existing risksMode look.

## Scope boundaries
- In scope: the four bugs, renaming the Risks entry points, a dashboard-data.js parser, fixtures and tests, README/CHANGELOG updates.
- Out of scope: residual_issues/fixes_applied as sources, other stats, changes to Maister's own dashboard.html.

## Technical considerations
- The working tree has uncommitted project-docs changes in the same files. Build on top of them.
- Navigate containment is security-relevant.
- The `verification_context` schema varies between tasks, so the parser must be tolerant.
- The red tests from Phase 3 must pass. The bug 4 test moves to the Follow-ups view.
