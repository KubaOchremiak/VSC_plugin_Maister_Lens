# Gap Analysis: Lens nav + Follow-ups fixes

## TL;DR
Three defects (shim back-button label, refused companion `../dashboard.html` navigate, Risks toggles broken by `.risks{display:flex}` vs `[hidden]`) plus one modificative feature: replace the Risks view with Follow-ups (+ verdict breakdown).
New finding: the extension never parses `dashboard-data.js` today (it only triggers shim refresh), so "unfixed verification issues" requires a new, non-eval parser of a JS object literal.
Replacing Risks ripples beyond the view: `maister.openRisks` command (package.json:139/251/330), Now tree risks node (nowTree.ts:190), strings, README, tests.
Risk: medium. Effort: medium.

## Key Decisions
- Characteristics: defect + modifies existing code + data read ops + UI heavy; no new persisted entities (Follow-ups is a derived read-only view).
- Bug 2 fix = resolve href against artifact dir, contain within task root; keeps security boundary.
- Bug 4 fix = global `[hidden]{display:none !important}`; also fixes any other flex-overridden hidden elements.

## Open Questions / Risks
- `dashboard-data.js` parsing: must not eval; schema is Maister-owned and may vary.
- "Deferred decision" detection is heuristic (phrase matching).
- Working tree has uncommitted project-docs changes in panel.ts, messages.ts, render.ts, strings.ts, reader.ts, navTree.ts — merge conflicts likely.

## Summary
- **Risk Level**: Medium
- **Estimated Effort**: Medium
- **Detected Characteristics**: has_reproducible_defect, modifies_existing_code, involves_data_operations, ui_heavy

## Task Characteristics
- Has reproducible defect: yes (bugs 1, 2, 4)
- Modifies existing code: yes
- Creates new entities: no (derived view model only)
- Involves data operations: yes (READ-only aggregation)
- UI heavy: yes

## Gaps Identified
### Missing Features
- Follow-ups aggregation model (new `collectFollowUps`), payload, webview mode, strings.
- Parser for `verification.issues` in dashboard-data.js (not read anywhere in src/).
- Parser for `verification_context.e2e_followup` and deferred decisions (verification_context unparsed in parseState.ts).
- Verdict breakdown stat (verdict exists at parseState.ts:566; no aggregation).
### Incomplete Features
- Companion navigation: shim posts `navigate`, panel refuses (`hosting:false` panel.ts:1140; validateNavigate messages.ts:246-251), silently (output channel only).
### Behavioral Changes Needed
- Shim back button: `FALLBACK.breadcrumb` -> new string "← Lens Dashboard" (shim.ts:225-256).
- Dashboard KPI "Open risks" (dashboardMode.ts:500-504, strings.ts:298) -> "Follow-ups".
- Risks mode/command/Now-tree node -> Follow-ups equivalents.

## User Journey Impact Assessment
| Dimension | Current | After | Assessment |
|-----------|---------|-------|------------|
| Reachability (companion -> task dashboard) | Broken (native link dead) | Works via native link + Lens button | + |
| Discoverability (back controls) | Two ambiguous "Dashboard" buttons, 4/10 | Distinct labels, 8/10 | + |
| Follow-ups | n/a (Risks view, broken collapse) | KPI tile on Dashboard, 8/10 | + if command/Now tree also renamed |

## Data Lifecycle Analysis
### Entity: Follow-up (derived, read-only)
| Operation | Backend | UI | Access | Status |
|-----------|---------|-----|--------|--------|
| CREATE | Written by Maister (out of scope) | n/a | n/a | N/A by design |
| READ | Missing (new parsers) | Missing (replace risksMode) | Dashboard KPI + command (to rename) | Gap -> task scope |
| UPDATE/DELETE | n/a (read-only extension per vision) | n/a | n/a | N/A |
**Completeness**: 100% of intended scope once READ built (extension is read-only by vision).
**Orphaned Operations**: none after change, provided `maister.openRisks` and Now tree risks node are not left pointing at a removed mode.
**Missing Touchpoints**: Now tree "open risks" child; Tasks search over risks (query.ts:43) — keep risks searchable?; fallback task view risks section (unaffected, keep).

## Defect Analysis
### Reproduction Data
1. Open any companion (e.g. Specification) -> two back links stacked; Lens one says "← Dashboard". Expected distinct "← Lens Dashboard".
2. Click native "../dashboard.html" -> nothing. Expected: task dashboard opens.
3. Risks view -> click group arrow -> nothing collapses.
### Root Cause Hypothesis
- 1: shim reuses `FALLBACK.breadcrumb`.
- 2: no hostFolderUri in mode 'artifact' + href resolved against task root not `dirname(artifactRelPath)`.
- 4: `.risks{display:flex}` (webview.css:874-879) overrides UA `[hidden]`.
### Regression Risk Areas
- shim.spec.ts button text assertions; messages.test.ts containment tests; any element relying on `hidden` + display rule; tests referencing risks mode (risksMode.test.ts, dashboardMode.test.ts, nowTree.test.ts, surfaces/themes specs, fallbackTask).

## Issues Requiring Decisions
### Critical
1. **Fate of Risks entry points** — `maister.openRisks` command, Now tree "N open risks" node, `risks` panel mode.
   - Options: A) rename all to Follow-ups (command `maister.openFollowUps`); B) Follow-ups replaces view only, Now tree keeps risk count linking to fallback; C) keep old command id aliasing to Follow-ups.
   - Recommendation: A (no backward compat per standards; avoids orphaned command).
2. **Parsing dashboard-data.js** — required for unfixed verification issues.
   - Options: A) tolerant non-eval parse (strip `window.MAISTER_DATA =`, parse as YAML/JSON5-ish via existing `yaml` dep); B) drop this source, use orchestrator-state only.
   - Recommendation: A with `yaml` (JS object literal with quoted strings is valid YAML flow) and graceful skip on failure; no new dependency.
### Important
1. **Task scope for Follow-ups** — Options: completed tasks only / all tasks. Default: completed only ("final outcomes").
2. **Deferred-decision detection** — Options: explicit field only / phrase heuristic ("defer", "later", "follow-up"). Default: explicit fields + narrow heuristic, documented.
3. **Refusal feedback for navigate** — Options: show warning to user / output channel only. Default: user-visible message (error-handling standard).
4. **Risks in Tasks search** — keep searchable? Default: keep (unchanged).
5. **Follow-up grouping** — by task (default, mirrors Risks groups, reuse fixed expander) vs by source type.

## Recommendations
- Implement bugs 1, 2, 4 first with tests (shim.spec, messages.test accept/refuse, Playwright collapse).
- Build Follow-ups by refactoring risksMode.ts rather than a parallel file; delete Risks code.
- Add fixture with populated verification issues/e2e_followup/deferred decision.
- Coordinate with uncommitted project-docs changes before editing shared files.

## Risk Assessment
- **Complexity Risk**: Medium (new parser, view replacement).
- **Integration Risk**: Medium (command/tree/strings/README ripple; working-tree overlap).
- **Regression Risk**: Medium (navigate containment is a security boundary; global `[hidden]` rule).
