# Test Suite Results

**TL;DR**
- Status: PASSED, all 144 tests pass (100%), with 0 failures, 0 errors and 0 skipped.
- `npm run check` (lint, typecheck and unit tests): 67 passing.
- `npm run test:dom` (Playwright): 29 passed.
- `npm run test:integration` (`@vscode/test-electron`): 47 passing in the trusted run, plus 1 passing in the untrusted run.
- No regressions were found.

## Metrics
| Suite | Command | Total | Pass | Fail | Skip |
|---|---|---|---|---|---|
| Unit + lint/typecheck | npm run check | 67 | 67 | 0 | 0 |
| DOM | npm run test:dom | 29 | 29 | 0 | 0 |
| Integration (trusted) | npm run test:integration | 47 | 47 | 0 | 0 |
| Integration (untrusted) | npm run test:integration | 1 | 1 | 0 | 0 |
| **Total** | | **144** | **144** | **0** | **0** |

Pass rate: 100%

## Feature coverage exercised
- DOM: projectMode.spec.ts (4 tests) and readerDoc.spec.ts (3 tests) all pass, including row and TL;DR openDoc, multi-root, the empty state, collapse, doc-mode links, no Source button, and the refused-doc notice.
- Integration: Project root row (R1), project payload (R2-R4, R6), openDoc (R7), doc-mode resource roots (R7), and republish and folder isolation (R11) all pass.

## Failures
None.

## Regressions
None. Every existing dashboard, reader, fallback, risks, theme, security and navTree test still passes.

## Notes (info only)
- The integration logs contain VS Code host noise (AgentHost GitHub session and ChatModelSelection messages) and a Node DEP0169 `url.parse()` deprecation warning that comes from a dependency. Neither affects the results.
