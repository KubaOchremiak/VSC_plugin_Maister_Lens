# Production Readiness Report

## TL;DR
- **GO**: the Edit-button diff is small and validated, and adds no dependencies, permissions, settings or CSP changes.
- 0 blockers, 0 warnings, 3 info. Nothing changed from cycle 2.
- The `openSourceMessage` refactor in `src/webview/reader.ts` changes no behaviour. The Source and Edit buttons now build the same `openSource` message from one helper.
- All tests pass: 236/236, including `test:min` on VS Code 1.90.0 (50+1). One overlapping integration test was removed, and the remaining tests still cover what it checked.

## Key Decisions
- Server-style checks (health endpoints, rate limiting, pooling, HTTPS, error tracking service, graceful shutdown) do not apply to a local VS Code webview extension. They are marked N/A and are not blockers.
- The user deferred the version bump (0.1.1 → next) and the CHANGELOG release heading to the release step. This report counts it as an info item, not a warning.
- The artifact Edit button reuses the existing `openSource` message, which already checks containment, and now builds it through the shared `openSourceMessage()` helper. Only doc pages add a new message (`editDoc`), and it shares validation with `openDoc` through `docTarget`.
- `editDoc` is accepted in untrusted workspaces, the same as `openDoc`. It only opens a file in VS Code's editor and the extension writes nothing.

## Open Questions / Risks
- `test:min` runs the untrusted-host suite on VS Code 1.138.0, not 1.90.0, because `test/runIntegration.ts` does not pass the version override to `runUntrustedHost()`. This existed before this task and the file is unchanged.
- `resolveInside` checks containment on the path text and does not resolve symlinks. `openDoc` already behaves this way, and the only effect is that a file opens in the editor, so the impact is low.

## Re-verification (2026-10-13, cycle 3)
| Prior item | Severity then | Now |
|---|---|---|
| `test:min` (VS Code 1.90.0) | warning (cycle 1) | **Closed.** Still passing: 50/50 + 1/1. Total 236/236. |
| Version not bumped; entry under `[Unreleased]` | warning (cycle 1) | **Deferred by the user** to the release step. Info. `package.json` is still at 0.1.1 and is unchanged in the diff. |
| `package.json` description vs README wording | info | Closed in cycle 2. |
| Symlink-unaware containment | info | Unchanged. Same as `openDoc`. |
| Prettier drift / `.prettierrc` | info | Unchanged. Existed before this task. |

Changes since cycle 2:
- `src/webview/reader.ts`: `openSourceMessage(payload)` builds `{ type: 'openSource', folderUri, artifactRelPath }` for both `sourceButton` and the artifact `editButton`. The message shape is the same as before, and the host still validates it with `validate()`. No regression.
- One overlapping integration test was removed (238 → 236, one in `test:integration` and one in `test:min`). "opens the shown doc from an editDoc built from the Project page and render payloads" (round trip) and "opens nothing for a refused editDoc" still cover what it checked, and both pass on 1.138.0 and 1.90.0.

**Date**: 2026-10-13
**Path**: uncommitted `git diff` (11 files: src/panel/messages.ts, src/panel/panel.ts, src/webview/reader.ts, src/strings.ts, media/webview.css, README.md, CHANGELOG.md, 4 test files)
**Target**: production (VS Code Marketplace / Open VSX)
**Status**: Ready

## Executive Summary
- **Recommendation**: GO
- **Overall Readiness**: 97%
- **Deployment Risk**: Low
- **Blockers**: 0  Concerns: 0  Recommendations: 3

## Category Breakdown
| Category | Score | Status |
|----------|-------|--------|
| Configuration | 100% | No new settings, environment variables or secrets. Labels are in `src/strings.ts` (`READER.edit`, `READER.editTitle`) |
| Monitoring | 95% | Failures are logged through the existing `run()` / `PANEL.commandFailed` path. Refused messages carry a reason naming the message type |
| Resilience | 100% | `openInEditor` → `run()` catches and logs errors and never throws. A malformed `editDoc` is refused before it reaches the handler |
| Performance | 100% | Adds one button per render and no I/O on the render path |
| Security | 95% | Message type is allowlisted. Root must exactly match a workspace folder. Path must be a contained `.md` file, and extra fields are dropped. CSP is unchanged and uses no inline handlers. Containment does not resolve symlinks (info) |
| Deployment | 90% | The full matrix passes, including `test:min`. The version bump and CHANGELOG heading are deferred to release |

## Blockers (Must Fix)
None.

## Concerns (Should Fix)
None.

## Recommendations (Nice to Have)
1. **Release metadata** (`package.json:5`, `CHANGELOG.md` `## [Unreleased]`): at release, bump to 0.2.0 (this is a new feature) and add a dated heading. The user has already deferred this, and `verify:release` runs before publishing.
2. **Trust suite on the minimum version** (`test/runIntegration.ts`): pass `--vscode-version` to `runUntrustedHost()` so Restricted Mode is also tested on 1.90.0. This existed before this task.
3. **Symlink-aware containment** (`src/panel/messages.ts` `resolveInside`): optionally add a `realpath` check that `openDoc` and `editDoc` both use. This existed before this task.

## Verified
- `src/panel/messages.ts`: `editDoc` is in the `Message` union and the `validate` switch. `docTarget` holds the root, path and `.md` checks that `openDoc` and `editDoc` share, and `editDoc` drops extra fields such as `anchor`.
- `src/panel/panel.ts`: `editDoc` → `openInEditor(joinPath(docsRootUri(folder), docRelPath))`. The `docsRootUri` helper replaces two duplicate expressions and does not change the resource roots for doc mode (R7).
- `src/webview/reader.ts`: the Edit button is a `<button type="button">` with a visible label, a hidden file name (`hidden()` from `components.ts`) and a `title`. It posts through `api.postMessage`. For artifacts it appears only on `.md` files (`MARKDOWN_FILE`), and `openSourceMessage()` is shared with the Source button.
- `media/webview.css`: the header row wraps, with a DOM test at 250px width.
- `package.json` and `package-lock.json` are unchanged, so there are no new dependencies or contributions.
- README and CHANGELOG describe the feature accurately.
- Tests (`verification/test-suite-results.md`): 236/236. Integration 50+1 on 1.138.0, and `test:min` 50+1 on 1.90.0.

## Next Steps
1. At release: bump the version, add the CHANGELOG release heading, then run `npm run verify:release`, which builds the package with `vsce package`.
2. Optional: pin the trust suite to the minimum version, and add symlink-aware containment.
