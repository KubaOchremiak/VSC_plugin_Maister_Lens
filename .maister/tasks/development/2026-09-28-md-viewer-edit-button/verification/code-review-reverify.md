# Code Review Re-verification Report (cycle 3)

## TL;DR
- Status: Clean. 0 critical, 0 warning, 3 info, the same as cycle 2. The changes since then add no new issues.
- The new `openSourceMessage(payload)` helper (src/webview/reader.ts:175-181) removes the duplicated `openSource` literal. `sourceButton` (reader.ts:185) and the artifact Edit button (reader.ts:233) now build the message the same way.
- After the direct `editDoc` integration test was removed, the round-trip test still covers the success path and the refused test still covers both refusal paths.
- `tsc --noEmit` and `eslint` on the changed files both pass with no output.

## Key Decisions
- **`openSourceMessage` returns `unknown`.** This matches the existing `post(message: unknown)` convention (reader.ts:37) and the `editButton(relPath, message: unknown)` signature. The host validates every message, so the loose type adds no risk.
- **Removing the direct `editDoc` test is acceptable.** The round-trip test (test/integration/projectMode.test.ts:140-169) checks that the `editDoc` fields taken from the posted `render` payload resolve to the expected `fsPath`. That covers everything the direct test checked, and also checks that the payload and the host agree. The refused test (projectMode.test.ts:171-191) still covers both the non-`.md` path and the folder outside the workspace.

## Open Questions / Risks
- None new. The residual Info items below were already open in earlier cycles.

**Date**: 2026-10-13
**Path**: the uncommitted `git diff` (11 files). This cycle focused on src/webview/reader.ts and test/integration/projectMode.test.ts.
**Scope**: all (quality, security, performance, best practices)
**Status**: Clean

## Summary
- Critical: 0
- Warnings: 0
- Info: 3

## Changes since cycle 2
| Change | Assessment |
|---|---|
| `openSourceMessage(payload)` at reader.ts:175-181, used at reader.ts:185 and 233 | Correct. It removes the duplication, keeps the message shape unchanged and introduces no behavior change. |
| Direct `editDoc` integration test removed | Coverage is kept by the round-trip test and the refused test. The unit tests in test/unit/messages.test.ts still cover `editDoc` validation. |

## Informational (residual, carried over)
1. **The project docs still use the "read-only view layer" wording** (.maister/docs/project/tech-stack.md:5, .maister/docs/INDEX.md:20). The README now says "never writes files itself". The claim is still true, but the wording should be aligned at finalization. Fixable: true.
2. **Refused `.md` artifacts show two buttons that both post `openSource`** (src/webview/reader.ts:229-238). The header Edit button and the in-body Source button do the same thing. This was a user decision and is tested. Fixable: true.
3. **One raw docs-root join remains** (src/panel/panel.ts:1328). It starts from a `folder.uri` (`Uri`), so `docsRootUri(string)` does not apply as written. This is acceptable. Fixable: true.

## Checks on the new code
- XSS: unchanged. No `innerHTML` is used, and the file name goes in only as a text node and a `title` attribute.
- Path security: unchanged. `docTarget` and `resolveInside` still check the workspace folder and require `.md`.
- Performance: no new I/O, watchers or loops.

## Metrics
- Max new function length: about 25 lines (`render`)
- Max nesting depth: 2
- Potential vulnerabilities: 0
- N+1 query risks: 0

## Prioritized Recommendations
1. Optional: align the "read-only view layer" wording in tech-stack.md and INDEX.md (Info 1).
2. No other action is needed.
