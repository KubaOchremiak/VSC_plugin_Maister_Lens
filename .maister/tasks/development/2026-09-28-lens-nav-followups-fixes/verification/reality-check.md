# Reality Check: Lens nav + Follow-ups fixes

## TL;DR
Bugs 1, 2, 4 are fixed and tested (82 unit passing, 4/4 Follow-ups DOM tests passing). Bug 3 (Follow-ups) works in code but loses most of its real data on this repo: of 4 completed tasks, only 1 dashboard-data.js yields issues. The 2026-09-23-dashboard-nav-buttons task (12 unfixed issues, verdict passed_with_issues) is silently dropped because its `key:"value"` object-literal syntax (no space after colon) parses as YAML *successfully* into garbage keys, then fails `isIssue`. Status: Issues Found.

## Key Decisions
- Assessed parser against every real `.maister/tasks/**/dashboard-data.js` instead of fixtures.

## Open Questions / Risks
- The `fu-unquoted` fixture uses `key: value` (with spaces), so it does not represent the real Maister emitter output; tests give false confidence.

## Real-data results (readDashboardData)
| Task | Status | Result |
|---|---|---|
| 2026-09-22-maister-lens-vscode-extension | completed | OK, 15 issues, 8 unfixed |
| 2026-09-22-maister-viewer-vscode-plugin | completed | OK, 0 issues |
| 2026-09-23-dashboard-nav-buttons | completed | NULL - 12 unfixed issues lost (`{severity:"warning",...}` -> YAML keys like `severity:"warning"`: null) |
| 2026-09-24-project-docs-page | completed | NULL - JS `.map(...)` expression; issues:[] anyway, no loss |

## Bugs
1. Lens back label: `strings.ts:231 lensBack: '← Lens Dashboard'` - fixed.
2. Native Dashboard link: `messages.ts` resolves via `hostBaseRelDir`, refuses outside folder - fixed (unit tests pass; not exercised in live VS Code by me).
3. Follow-ups: implemented; real-data coverage gap above.
4. Expanders: global `[hidden]{display:none !important}` in webview.css + DOM test passes - fixed.

## Action plan
- (High, ~1h) Make the parser tolerate JS-literal `key:"v"`: e.g. pre-normalise `([{,]\s*)([A-Za-z_]\w*):` to `$1"$2":` before JSON.parse, or use a JSON5-lite approach without executing code. Success: nav-buttons task yields 12 unfixed issues.
- (Medium) Replace/extend fu-unquoted fixture with a no-space `key:"v"` sample copied from the real file.
- (Low) Surface a count of skipped/unparseable dashboard-data files so absence of issues is not mistaken for "none" (honest-state criterion in vision.md).
