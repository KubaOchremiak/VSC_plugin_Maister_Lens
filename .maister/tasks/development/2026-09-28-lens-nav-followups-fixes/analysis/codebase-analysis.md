# Codebase Analysis Report

**Date**: 2026-09-28 · **Task**: Fix 4 Lens bugs from test/bugs.md · **Analyzer**: codebase-analyzer (2 Explore agents)

## TL;DR
- Bug 1: shim injects a back button labelled `FALLBACK.breadcrumb` ('← Dashboard') on every hosted companion; needs a dedicated shim string "← Lens Dashboard".
- Bug 2: `navigate` from a companion (mode 'artifact') is refused — `hosting:false` means no hostFolderUri, and hrefs resolve against the task root instead of the artifact folder.
- Bug 4: risksMode toggles `list.hidden`, but `.risks{display:flex}` in media/webview.css overrides `[hidden]`.
- Bug 3: the "issue list" is most likely Risks mode (Dashboard "Open risks" KPI); Follow-ups needs new parsed fields from `verification_context`.

## Key Decisions
- New string key for the shim button; leave `FALLBACK.breadcrumb` for the fallback view — no competing native link there.
- Resolve navigate hrefs against `dirname(artifactRelPath)`, keep containment against task root.
- Global `[hidden]{display:none !important}` in webview.css.
- Follow-ups only from final-outcome sources (residual_issues, e2e_followup, unresolved fixes, unresolved final risks, deferred decisions, unfixed verification issues) on completed tasks.

## Open Questions / Risks
- Which list is "the issue list"? Evidence → Risks mode; Maister's hosted dashboard.html also has a verification issues list (not Lens-owned).
- Replace Risks view entirely or keep alongside Follow-ups?
- Which "other valuable stats"? (verdict distribution, fixes resolved, reverify count, e2e status)
- `verification_context` schema varies across tasks — parser must be tolerant.
- Uncommitted changes from the project-docs task overlap messages.ts, panel.ts, render.ts, reader.ts, strings.ts.
- Detecting deferred decisions by phrase matching is heuristic.

---

## Files Identified

### Primary
- **src/webview/shim.ts** — 225-256 `backLink()`/`injectBackLink()` inject `nav.maister-lens-back`, posting `{type:'openDashboard'}` (Lens dashboard); 117-135 capture link clicks → `{type:'navigate', href}`.
- **src/strings.ts** — `FALLBACK.breadcrumb` :253, `RISKS.breadcrumb` :357, `dashboard` :114, `DASHBOARD` :289, `READER` :399+.
- **src/panel/panel.ts** — `handleMessage` ~488-500; hostFolderUri getter 658-663 (only mode 'task' && hosting); `route()` 587-607 maps `DASHBOARD_FILE` (:70) → `show({mode:'task'})`; `buildArtifact` 1125-1149 (`hosting:false` at 1140); `hostCompanion` 1152-1177; `risksPayload` ~947; risks mode 714-719.
- **src/panel/messages.ts** — `resolveInside` 113-127; `validateNavigate` 246-251 refuses without host folder (logged only to output channel).
- **src/model/relPath.ts** — `containedRelPath` 16-35.
- **src/webview/risksMode.ts** — `groupHeader` 333-393 (expander 337-345), `groupCard` 395-407 (initial hidden 403).
- **media/webview.css** — 874-879 `.risks{display:flex}`.
- **src/model/parseState.ts** — risks 187-260, 531-599; verdict at 566.
- **src/model/types.ts** — Task model.
- **src/webview/dashboardMode.ts** — "Open risks" KPI 500-504.

### Related
- src/panel/render.ts `companionHtml` ~383-397; src/panel/hostDashboard.ts `hostDashboardHtml` 90-96 (CSP, `<base href>`, shim).
- src/model/risks.ts (`collectRisks`, `openRiskCount`), src/model/parseSummary.ts (§7 blocks).
- src/webview/components.ts `row()` 137-190 — working expander pattern.
- Example data: `.maister/tasks/development/2026-09-23-dashboard-nav-buttons/orchestrator-state.yml:150-167`; native back link at `.../implementation/spec.html:63`.

## Data Flow
Bug 2: spec.html click → shim posts `navigate('../dashboard.html')` → `validate(hostFolderUri=undefined)` refused. Even with a folder, `resolveInside(taskRoot,'../dashboard.html')` → null. Intended: resolve against `implementation/` → `dashboard.html` → `route()` → `show({mode:'task'})`.

Risks: parseState + parseSummary → collectRisks → risksPayload → risksMode.

## Follow-ups Data Sources
Task model today: `verdict`, `risks[]`, `decisions[]`, `artifacts[].summary`, `status`, `phases`, `nextAction`, `parseIssues`.
Unparsed `verification_context`: `residual_issues[]`, `fixes_applied[] {issue,fix,file,outcome}`, `decisions_made[]`, `issues_found`, `post_fix_counts`, `e2e_status`, `e2e_followup`, `reverify_count`. `phase_summaries.<phase>.summary` also unparsed. dashboard-data.js `verification.issues[{severity,category,description,fixed,fixable}]`.

## Test Coverage
- test/dom/shim.spec.ts ~60-99 (button text = `FALLBACK.breadcrumb`, posts openDashboard), ~121-166 hostile CSS.
- test/dom/surfaces.spec.ts 262-279, 36-48, 79-130; test/integration/fallbackTask.test.ts 227-261.
- test/unit/messages.test.ts ~218-231, ~80-146; test/integration/panel.test.ts :100/:127/:157; reader.test.ts; trust.test.ts:71; hostDashboard.test.ts:237.
- parseState.test.ts, index.test.ts:338-355. Fixtures `test/fixtures/tasks/*` (dev-real, pd-real have empty verification issues).
- Commands: `npm test`, `npm run test:integration`, `npm run test:min`, `npm run test:dom`.
- Gaps: no companion→dashboard.html navigate test; no DOM test of companion back control; no risksMode collapse test; no fixture with populated verification_context.

## Complexity & Risk
Moderate complexity, medium risk (navigate touches security containment; replacing Risks changes a visible surface). Bugs 1, 2, 4 small; bug 3 is a small feature (model + parser + payload + UI + fixture).

## Recommendations
1. Dedicated shim string "← Lens Dashboard" (+ aria-label); update shim.spec.ts.
2. Expose task folder + artifact dir for mode 'artifact'; resolve relative to artifact dir, contain within task root; surface refusals to user; tests for accept/refuse.
3. Global `[hidden]` rule; Playwright collapse test.
4. Parse `verification_context` tolerantly; aggregate follow-ups for completed tasks; replace "Open risks" KPI/view with Follow-ups + stat tiles; new fixture.
