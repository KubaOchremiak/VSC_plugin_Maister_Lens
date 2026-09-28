# E2E Verification Report

## TL;DR
Verdict **GO**. 4/4 scenarios passed, 0 failures. The shim button reads "← Lens Dashboard" and the native companion link posts `navigate '../dashboard.html'`. The Follow-ups view shows its breakdown, groups, chips and unreadable notice, and the group expanders collapse and re-expand. The scoped empty state and the Dashboard tile both match the spec. One Cosmetic note: the shim button has no `aria-label` of its own (it takes its accessible name from its text).

## Key Decisions
- The webviews were run in the DOM harness style: stub `acquireVsCodeApi` + posted payloads, served over `http://localhost:8765` because Playwright MCP blocks `file:`. The hosted companion page is built with the real `hostDashboardHtml`. Its CSP source was rewritten to the http origin, and the stub script was given the page nonce.

## Open Questions / Risks
- FR1 says the new string "is also used for the aria-label". The `<button>` has no aria-label (the `<nav>` keeps `aria-label="Breadcrumb"`). The accessible name still comes out as "← Lens Dashboard" from the text. Confirm this was the intent (Cosmetic).

## 1. Identifier
- **Task**: 2026-09-28-lens-nav-followups-fixes
- **Task path**: /Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/.maister/tasks/development/2026-09-28-lens-nav-followups-fixes
- **Spec**: implementation/spec.md
- **Date**: 2026-09-28
- **Git ref**: 2f9fbb3 main (uncommitted working tree)
- **Tester**: e2e-test-verifier (maister)

## 2. Test Environment
| Field | Value |
|---|---|
| Base URL | http://localhost:8765 (python http.server over repo root; pages in `verification/e2e-pages/`) |
| Browser | Playwright MCP Chromium |
| Viewport | default (~1500×750) |
| Auth context | anonymous (stubbed `acquireVsCodeApi`) |
| Test data | synthetic payloads (harness `dashboardPayload()`; Follow-ups payload with 2 groups, unreadable=2) |

## 3. Executive Summary
**Verdict**: ✅ GO

| Metric | Count |
|---|---|
| Scenarios planned | 4 |
| Scenarios executed | 4 |
| Passed | 4 |
| Failed | 0 |
| Blocked | 0 |
| Pass rate | 100% |
| Critical issues | 0 |
| Major issues | 0 |
| Minor issues | 0 |
| Cosmetic issues | 1 |

Every checked behaviour works as the spec describes. The shim relabel works, and a native companion link is routed through `navigate` with its raw relative href. The Follow-ups view shows the verdict breakdown, per-task groups, source chips, a severity chip on issues only and the unreadable notice. Its expanders now toggle the item lists both ways, both visually and in `aria-expanded`. The only note is an a11y nuance on the shim button's aria-label.

## 4. Verification Scenarios

### 4.1 Hosted companion shim button + native link — ✅ Passed
- **User story / acceptance criterion**: FR1, FR2
- **Preconditions**: spec.html with `<a href="../dashboard.html">← Dashboard</a>` hosted through `hostDashboardHtml` + shim.js

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Load hosted page | `nav.maister-lens-back` button reads "← Lens Dashboard" | Button text "← Lens Dashboard" | ✅ |
| 2 | Click shim button | posts `openDashboard` | `{type:'openDashboard'}` | ✅ |
| 3 | Click native link | posts `navigate` href `../dashboard.html` | `{type:'navigate', href:'../dashboard.html'}` | ✅ |
| 4 | Inspect aria-label | new string used as aria-label | button has no aria-label; nav = "Breadcrumb" | ⚠️ |

- **Issues observed**: §5.4 C1
- **Evidence**: `screenshots/01-hosted-shim-button.png`
- **Acceptance criteria checklist**:
  - [x] Button reads "← Lens Dashboard"
  - [x] Posts openDashboard
  - [x] Native link posts navigate with relative href

### 4.2 Follow-ups view structure + expanders — ✅ Passed
- **User story / acceptance criterion**: Follow-ups view requirements (verdict breakdown, groups, chips, unreadable, expander)
- **Preconditions**: payload with verdicts 3/1/1, 2 groups (4 + 1 items), unreadable=2

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Load | Verdict breakdown at top | Passed 3 / Passed with issues 1 / Failed 1 | ✅ |
| 2 | Inspect groups | One group per task with meta + count | "Auth token rotation … 4 follow-ups", "Pricing page research … 1 follow-up" | ✅ |
| 3 | Inspect chips | Issue/Risk/Deferred/E2E source chips; severity only on issues | Issue+Critical, Risk, Deferred, E2E, Issue+Warning | ✅ |
| 4 | Unreadable notice | Shown when >0 | "2 task data files could not be read" | ✅ |
| 5 | Click first expander | List hidden, aria-expanded=false | expanded=false; only 1 of 5 items visible | ✅ |
| 6 | Click again | List shown, aria-expanded=true | expanded=true; 5 of 5 items visible | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/02-followups-expanded.png`, `screenshots/03-followups-collapsed.png`, `screenshots/04-followups-reexpanded.png`
- **Acceptance criteria checklist**:
  - [x] Verdict breakdown
  - [x] Groups per task
  - [x] Source chips, severity on issues only
  - [x] Unreadable notice
  - [x] Expander collapses and expands

### 4.3 Scoped non-completed empty state — ✅ Passed
- **User story / acceptance criterion**: "Follow-ups appear once this task is completed."
- **Preconditions**: scopedTitle set, scopedNotCompleted=true, no groups

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Load | Empty-state message | "Scoped to Auth token rotation" + "Follow-ups appear once this task is completed." | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/05-scoped-not-completed.png`
- **Acceptance criteria checklist**:
  - [x] Exact message shown

### 4.4 Dashboard Follow-ups tile — ✅ Passed
- **User story / acceptance criterion**: Dashboard KPI tile "Follow-ups" with count and "across {k} tasks"
- **Preconditions**: harness `dashboardPayload()` (followUps value 3, k=2)

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Load | Tile: 3 / Follow-ups / across 2 tasks | "☑ 3 Follow-ups across 2 tasks" | ✅ |
| 2 | Click tile | Opens Follow-ups | posts `{type:'openFollowUps'}` | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/06-dashboard-followups-tile.png`
- **Acceptance criteria checklist**:
  - [x] Label, count, context line
  - [x] Tile opens Follow-ups

## 5. Discrepancies

### 5.1 Critical
_None observed._

### 5.2 Major
_None observed._

### 5.3 Minor
_None observed._

### 5.4 Cosmetic
**C1: Shim button has no explicit aria-label**
- **Spec requirement**: FR1: "a new dedicated string that is also used for the aria-label"
- **Expected**: The button (or its nav) carries aria-label "← Lens Dashboard"
- **Actual**: The `<button>` has no aria-label, and `<nav>` has `aria-label="Breadcrumb"` (src/webview/shim.ts:238). The accessible name comes from the text content, "← Lens Dashboard".
- **Evidence**: `screenshots/01-hosted-shim-button.png`
- **Root cause hypothesis**: The label is set only as text. The nav landmark label was kept as FALLBACK.breadcrumbLabel.
- **User impact**: None in practice, because screen readers announce the same name.
- **Recommended fix**: Either set aria-label on the button, or relax the spec wording.
- **Workaround**: None needed.

## 6. Console & Network Errors
| Source (file:line) | Message | Frequency | Severity | Impact |
|---|---|---|---|---|
| http://localhost:8765/favicon.ico | 404 File not found | 1 | Cosmetic | Test-server artefact only; none |

## 7. Spec Alignment
- **Fully implemented**: FR1 label + openDashboard; native link → navigate; Follow-ups breakdown/groups/chips/unreadable/expander; scoped not-completed empty state; Dashboard Follow-ups tile
- **Partially implemented**: FR1 aria-label wording (see C1)
- **Not implemented**: _None._
- **Extra (unspecified) behavior**: _None._

## 8. Variances from Plan
The pages were served over HTTP rather than `file://`, because the MCP browser blocks `file:`. The hosted page's CSP source was rewritten to the HTTP origin, and the stub script was given the page nonce. FR2's host-side href resolution against `hostBaseRelDir` was not exercised, because it happens in the extension host and not in the browser. It is covered by the integration tests.

## 9. Evaluation Against Exit Criteria
| Criterion (from spec) | Status | Evidence |
|---|---|---|
| Shim button reads "← Lens Dashboard", posts openDashboard | ✅ | 4.1 |
| Native companion link posts navigate | ✅ | 4.1 |
| Follow-ups: breakdown, groups, chips, severity on issues only, unreadable notice | ✅ | 4.2 |
| Expanders collapse and expand | ✅ | 4.2 |
| "Follow-ups appear once this task is completed." | ✅ | 4.3 |
| Dashboard tile opens Follow-ups | ✅ | 4.4 |

## 10. Recommendations
- **Must fix before merge**: _None._
- **Should fix soon**: _None._
- **Nice-to-have**: §5.4 C1

## 11. Artifacts
- **Screenshots**: `verification/screenshots/` (6 files)
- **Visual-fidelity report**: _Not generated (no design_context_path)._
- **Console log dump**: inline in §6

## 12. Conclusion
Verdict: ✅ GO. All four browser scenarios passed, with evidence for each. The only deviation is a Cosmetic aria-label wording nuance. Recommended next step: merge. C1 can optionally be handled by setting an explicit aria-label or by relaxing the spec wording.
