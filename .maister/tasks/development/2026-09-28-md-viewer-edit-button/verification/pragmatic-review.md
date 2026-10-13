# Pragmatic Review: Edit button on markdown reader pages

## TL;DR
- Status: **Appropriate.** This is re-verification cycle 3. Source changes come to +92/-21 lines and tests to +239/-1, which fits a single-developer VS Code extension.
- There are 0 critical, 0 warning and 2 info findings. None of them blocks the commit.
- I1 (the duplicated `openSource` literal) and I3 (the overlapping integration test) are resolved. I2 and I4 are still open as accepted info findings.
- There are still no new dependencies, commands, manifest entries or CSP changes.

## Key Decisions
- `editDoc` remains its own message type. Reusing `openFile` would widen the allowlist, and `openSource` needs an indexed task folder, which docs don't have.
- Artifact Edit reuses `openSource` through the new `openSourceMessage(payload)` helper, and is shown only for `.md` paths.
- `docTarget` returns a data-or-reason union, so `openDoc` keeps its anchor check while sharing the path rules with `editDoc`.
- `docsRootUri()` replaces three spelled-out `joinPath(parse(...), ...DOCS_ROOT)` sites with one helper.

## Re-verification
This is cycle 3. The previous review had 0 critical, 0 warning and 4 info findings.

**I1 is resolved.** `src/webview/reader.ts` L175-181 adds `openSourceMessage(payload)`. Both callers use it:
- `sourceButton` at L185
- the artifact header Edit button at L233

The helper is 7 lines, has exactly 2 callers and returns `unknown`, which matches `post(message: unknown)`. It is proportional and is not speculative.

**I3 is resolved.** `test/integration/projectMode.test.ts` now contains only two new tests:
- the round-trip test (Project page → `openDoc` → render payload → `editDoc` → `vscode.open` path)
- the refused-`editDoc` test

The direct `editDoc` test that the round-trip test subsumed is gone.

**I2 and I4 are unchanged.** Both remain info findings with no action recommended. See below.

No new code was introduced beyond the I1 helper. No regressions in proportionality were found.

## Complexity Assessment
- **Project scale:** an early-stage, single-author extension with 2 runtime dependencies. `minimal-implementation.md` applies.
- **Complexity of this change:** Low.

| Area | +/- | Assessment |
|---|---|---|
| `src/panel/messages.ts` | +28/-6 | One shared `docTarget`, one validator, one switch case. |
| `src/panel/panel.ts` | +10/-5 | One dispatch arm. `docsRootUri` deduplicates 3 sites. |
| `src/webview/reader.ts` | +36/-10 | `openSourceMessage`, `editButton`, the `MARKDOWN_FILE` gate and the header row. |
| `media/webview.css` | +16 | 3 small rules with no new tokens. |
| `src/strings.ts` | +2 | Label and tooltip. |
| Tests | +239/-1 | 5 unit, 3 doc DOM, 6 artifact DOM and 2 integration tests. |

## Key Issues Found

### Critical
None.

### Warning
None.

### Info

**I2. The header-row DOM differs by mode.**
- **Location:** `src/webview/reader.ts`, `render()` (around L221-236). Doc mode wraps the lead in `div.rd-head-lead`, while artifact mode puts the breadcrumb directly in `.rd-head`.
- **Impact:** Negligible. `docHeader` returns two stacked elements that need a wrapper, while the breadcrumb is a single element.
- **Fixable:** no action recommended.

**I4. The `.md` check is expressed twice, once in each bundle.**
- **Location:** `src/webview/reader.ts` L32 (`MARKDOWN_FILE`) and `src/panel/messages.ts` (`docTarget`, `/\.md$/i`).
- **Impact:** Negligible. The webview check controls whether the button is shown, and the validator enforces the rule. They are separate bundles with separate roles, so sharing a constant is not worth the coupling.
- **Fixable:** no action recommended.

## Developer Experience
- The flow is still linear: click → `post` → `validate` → `dispatch` → `openInEditor`, with no new indirection.
- Refusal reasons are interpolated with the message type (`editDoc carries ...`), which helps debugging. The unit tests assert this.
- The tests reuse the existing harness helpers (`spyOnCommand`, `projectHarness`, `last`, `folderUriOf`), so there is no new test infrastructure.

## Requirements Alignment
- The diff covers the Edit button for both doc mode and markdown artifacts, the validated `editDoc` path and the header layout that wraps at narrow widths.
- There is no scope creep: no title-bar command, no trust gate and no split-editor option.
- The README and CHANGELOG are updated.

## Context Consistency
- There is no dead code and there are no unused imports. `hidden` is imported and used, and `openSourceMessage` has 2 callers.
- All string-URI `DOCS_ROOT` join sites now go through `docsRootUri`.
- The module docblock describes the new behaviour, including the `.html` exception, without change comments.

## Recommended Simplifications
None. The optional tidy-ups from the earlier cycles have been applied.

## Summary Statistics
| Metric | Cycle 2 | Cycle 3 |
|---|---|---|
| Source lines (+/-) | ~+92 | +92/-21 |
| Test lines added | ~260 | 239 |
| New dependencies | 0 | 0 |
| New helpers | 3 | 4 (`docTarget`, `docsRootUri`, `editButton`, `openSourceMessage`) |
| New message types | 1 | 1 |
| Info findings | 4 | 2 (both no-action) |

## Conclusion
The implementation is proportional and consistent with `minimal-implementation.md` and `coding-style.md`. The cycle-3 fixes removed duplication and a redundant test without adding structure. No action is required before commit.
