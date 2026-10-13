# Test Suite Results — Edit button on Maister Lens markdown viewer (re-verification cycle 3)

## TL;DR
- Status: **passed**. All four commands exit 0; 236/236 tests pass, 0 failing, 0 skipped.
- `npm run check`: lint clean, typecheck clean, mocha 91/91. `npm run test:dom`: Playwright 43/43.
- `npm run test:integration` (VS Code 1.138.0): 50/50 + 1/1 untrusted-host. `npm run test:min` (VS Code 1.90.0): 50/50 + 1/1.
- Counts match the expected baseline. Integration and min dropped from 51 to 50 only because the direct editDoc test ("opens the doc source in the editor from an editDoc message") was removed on purpose. The round-trip and refused-editDoc tests still pass.
- No regressions.

## Open Questions / Risks
- (Existing, not caused by this task) `test:min` runs the untrusted-host (`trust/integration`) suite on VS Code 1.138.0, not 1.90.0, because `test/runIntegration.ts` does not pass the `--vscode-version` override to `runUntrustedHost()`. AC15 is never run against the minimum VS Code version.
- The `test:min` log has one `ENOENT` line. It is expected noise from the "no .maister/docs" scenario (R6), and the test passes.

## Commands and Metrics

| Command | Scope | Total | Pass | Fail | Skip | Exit |
|---|---|---|---|---|---|---|
| `npm run lint` (in check) | ESLint `src test` | n/a | clean | 0 | n/a | 0 |
| `npm run typecheck` (in check) | `tsc --noEmit` | n/a | clean | 0 | n/a | 0 |
| `npm test` (in check) | mocha unit | 91 | 91 | 0 | 0 | 0 |
| `npm run test:dom` | build + Playwright DOM | 43 | 43 | 0 | 0 | 0 |
| `npm run test:integration` | @vscode/test-electron, VS Code 1.138.0 | 50 + 1 | 51 | 0 | 0 | 0 |
| `npm run test:min` | @vscode/test-electron, VS Code 1.90.0 (trust suite on 1.138.0) | 50 + 1 | 51 | 0 | 0 | 0 |
| **Total** | | **236** | **236** | **0** | **0** | |

Pass rate: 100%.

## Change in Count Since the Last Cycle
- The last cycle had 238 tests. This cycle has 236: one fewer in integration and one fewer in min.
- The missing test is "opens the doc source in the editor from an editDoc message" in `test/integration/projectMode.test.ts`. It was removed on purpose.
- What it covered is still tested by "opens the shown doc from an editDoc built from the Project page and render payloads" (round trip) and "opens nothing for a refused editDoc". Both pass on 1.138.0 and on 1.90.0.

## Tests Covering the Feature and the Fixes (all passing)

DOM (`test/dom/readerDoc.spec.ts`, `test/dom/surfaces.spec.ts`). These exercise the `openSourceMessage` helper in `src/webview/reader.ts`:
- doc mode has no Source button and never posts task-scoped messages
- doc mode shows one Edit button outside any nav, right after the back control and breadcrumb
- the doc Edit button posts editDoc for the shown document
- a refused doc still shows Edit and no Source button
- the artifact reader shows Edit outside the breadcrumb, between it and the hero chips in tab order
- the artifact Edit button posts openSource for the shown artifact
- a refused artifact shows both the header Edit button and the in-body Source button
- a refused .html artifact has no Edit button, only the in-body Source button
- a refused artifact reaches the header Edit button before the in-body Source button
- the reader header row wraps at a narrow panel width without horizontal scroll
- the six-surface a11y sweep (every interactive element is a `<button>`/`<a>` with an accessible name)

Integration (`test/integration/projectMode.test.ts`), on both 1.138.0 and 1.90.0:
- opens the shown doc from an editDoc built from the Project page and render payloads (round trip)
- opens nothing for a refused editDoc
- routes every artifact navigation through render.ts and reaches vscode.open only via openSource (AC5)
- limits doc-mode resource roots to media, bundles and `<folder>/.maister/docs` (R7)

## Failures
None.

## Regressions
None. Every unrelated suite passes: index, persistence, attribution, navTree, nowTree, overview, panel, fallbackTask, reader, dashboardMode, followUpsMode, trust, themes, security and shim.

## Issue Summary
- critical: 0
- warning: 0
- info: 1 (the untrusted-host suite is not pinned to the minimum VS Code version in `test:min`; this existed before this task)
