# Production Readiness Report

## TL;DR
- **GO with mitigations**: no blockers found for a Marketplace release of the Project docs page.
- Typecheck, lint, unit tests (62 passing), build and `npm audit --omit=dev` (0 vulnerabilities) all pass.
- The new `openDoc` message is allowlist-validated: the root must be a workspace folder, the path must stay inside it and end in `.md`, and the anchor must match a pattern.
- Fix before release: CHANGELOG/README do not mention the feature, and the docs watcher ignores workspace folders added after start.

**Date**: 2026-09-24
**Path**: uncommitted changes in /Users/jakub/dev_WORKSPACE/VSC_Maister_plugin
**Target**: production (VS Code Marketplace)
**Status**: With Concerns

## Executive Summary
- **Recommendation**: GO with mitigations
- **Overall Readiness**: 88%
- **Deployment Risk**: Low
- **Blockers**: 0  Concerns: 2  Recommendations: 3

Most server-oriented checks (health endpoints, connection pools, rate limiting, CORS, HTTPS, migrations) do not apply to a client-side VS Code extension. They were scored as not applicable. The equivalent extension concerns were checked instead: webview message validation, CSP/bundles, resource cleanup, error handling and the release pipeline.

## Category Breakdown
| Category | Score | Status |
|----------|-------|--------|
| Configuration | 95% | Ready (command hidden from palette, `when` clauses updated) |
| Monitoring | 85% | Ready (failures logged through `options.log`) |
| Resilience | 90% | Ready (reads wrapped in try/catch, honest "unreadable" notice, debounced watcher) |
| Performance | 85% | Ready (size cap via `oversizeNotice`, render cache, 200 ms debounce) |
| Security | 95% | Ready (validated `openDoc`, localResourceRoots limited to `.maister/docs`, markdown-it `html: false`) |
| Deployment | 75% | Concerns (CHANGELOG/README not updated) |

## Blockers (Must Fix)
None.

## Concerns (Should Fix)
1. **The feature is not documented for release.** `CHANGELOG.md` `[Unreleased]` has no entry for the Project page, and README does not mention it. The project conventions require changelog updates. Fixable: add an "Added" entry and a README line.
2. **The docs watcher ignores folders added later.** `src/panel/panel.ts` `watchDocs()` runs once in the constructor over `this.folders`. A folder added through `onDidChangeWorkspaceFolders` never gets a watcher, so its Project page will not live-refresh until the extension reloads. Fixable: re-run the watcher setup when workspace folders change, disposing the old watchers.

## Recommendations (Nice to Have)
1. `src/panel/panel.ts` `markdownUnder()` walks the whole docs tree with no depth or count limit. Add a cap to protect against unusually large `.maister/docs` trees. Fixable.
2. `src/panel/panel.ts` `watchDocs()` skips watching when any enabled `files.watcherExclude` pattern contains `.maister`, which is a coarse substring match. Accepted as a reasonable heuristic, but worth a comment in the docs. Fixable.
3. `src/panel/panel.ts` `buildDoc()` logs failures with `PANEL.commandFailed` and passes the doc path as the "command", so the log line reads oddly. Use a dedicated string. Fixable.

## Next Steps
1. Add the CHANGELOG `[Unreleased] > Added` entry and a README mention.
2. Rebuild the docs watchers when workspace folders change.
3. Run `npm run verify:release` (DOM, integration, min-VS Code 1.90 and package). Only unit tests, lint, typecheck and build were run for this review.
