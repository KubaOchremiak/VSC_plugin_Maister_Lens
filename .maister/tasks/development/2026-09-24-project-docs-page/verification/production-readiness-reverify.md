# Production Readiness Re-verification

## TL;DR
- **GO**: no blockers or concerns remain for the Marketplace release of the Project docs page.
- Both earlier concerns are fixed: the CHANGELOG/README entries exist, and the docs watchers are rebuilt on `onDidChangeWorkspaceFolders`.
- Two of the three recommendations are resolved (exclude check removed, dedicated `docUnreadable` log string). The `markdownUnder` cap is still open (info).
- Typecheck, lint, unit tests (67 passing), build and `npm audit --omit=dev` (0 vulnerabilities) pass. `verify:release` was not run.

**Date**: 2026-09-24
**Path**: uncommitted changes in /Users/jakub/dev_WORKSPACE/VSC_Maister_plugin
**Target**: production (VS Code Marketplace)
**Status**: Ready

## Executive Summary
- **Recommendation**: GO
- **Overall Readiness**: 95%
- **Deployment Risk**: Low
- **Blockers**: 0  Concerns: 0  Recommendations: 2

## Status of Previous Findings
| # | Previous finding | Status | Evidence |
|---|------------------|--------|----------|
| C1 | CHANGELOG/README do not mention the feature | Resolved | `CHANGELOG.md` `[Unreleased] > Added` has a "Project page" entry. README renames the section to "The panel modes" and adds a **Project** row. |
| C2 | Docs watcher ignores workspace folders added later | Resolved | `src/panel/panel.ts:355` subscribes `watchDocs()` to `onDidChangeWorkspaceFolders`. `watchDocs()` (around line 1589) keeps one watcher per folder, adds watchers for new folders, and disposes watchers and clears debounce timers for removed ones. Panel dispose (lines 509-516) clears both maps. No integration test covers adding a folder. |
| R1 | `markdownUnder()` has no depth/count cap | Open | `src/panel/panel.ts:1302` still recurses with no limit. |
| R2 | Coarse `files.watcherExclude` substring check | Resolved (removed) | The docs watcher no longer reads `watcherExclude`. The index watcher (`src/index/watcher.ts`) still warns the user when `.maister` is excluded, which covers the same case. |
| R3 | `buildDoc()` logs through `PANEL.commandFailed` | Resolved | `buildDoc()` now logs `PANEL.docUnreadable` (`src/strings.ts:224`: "panel: project doc {docRelPath} could not be read ({detail})"). |

## Category Breakdown
| Category | Score | Status |
|----------|-------|--------|
| Configuration | 95% | Ready |
| Monitoring | 95% | Ready (dedicated doc log string) |
| Resilience | 95% | Ready (watchers follow workspace folder changes) |
| Performance | 85% | Ready (docs tree walk still uncapped) |
| Security | 95% | Ready (unchanged from previous review) |
| Deployment | 95% | Ready (CHANGELOG/README updated; release suite not run) |

## Blockers (Must Fix)
None.

## Concerns (Should Fix)
None.

## Recommendations (Nice to Have)
1. `src/panel/panel.ts` `markdownUnder()`: add a depth or file-count cap for unusually large `.maister/docs` trees. Carried over from the previous review.
2. Add an integration test that adds a workspace folder and checks that its Project page refreshes live. The fix for C2 has no test.

## Next Steps
1. Run `npm run verify:release` (DOM, integration, minimum VS Code 1.90, package) before publishing.
2. Optionally apply the two recommendations above.
