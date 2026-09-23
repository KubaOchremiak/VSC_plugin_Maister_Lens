# Implementation Verification — Dashboard Navigation Affordances

**Date**: 2026-09-23T17:20:00Z · **Revised post-fix**: 2026-09-23T17:48:46Z (re-verify cycles 1–2)
**Task**: `.maister/tasks/development/2026-09-23-dashboard-nav-buttons`
**Verifications run**: completeness check · code review · production readiness
**Declined by operator at the Phase 10 gate**: pragmatic review, reality check
**Test suite**: skipped as a separate step (`skip_test_suite: true`) — the full three-runner pass went green during implementation and was independently re-run by two verifiers

## TL;DR
**⚠️ Passed with Issues — post-fix.** 38/38 plan steps verified against real code (not checkboxes), all five FRs traced, all three spec-audit findings closed, and every hard constraint held — including the two zero-line-diff invariants on `hostDashboard.ts` and `messages.ts`. Two warnings were fixed and one documented in this cycle; suites re-ran at identical counts with no regressions.
**Remaining: 0 critical, 2 warning, 10 info** (down from 0 / 5 / 10). The two remaining warnings are C1 (CHANGELOG rewording, declined by the operator) and C3 (stage this feature's files by explicit path so the out-of-scope `panel.ts:1342` edit does not ride along — an action at commit time, not a code defect). No finding blocks the feature.

## Open Questions / Risks
- **The uncommitted, out-of-scope edit at `src/panel/panel.ts:1342` is still in the working tree.** A `git commit -a` sweeps it into this feature's commit, invisible in review and mis-attributed on a later bisect. Stage this feature's files by explicit path. Flagged independently by all three verifiers.
- Two pre-existing release blockers gate any Marketplace publish and are unrelated to this feature: placeholder `"publisher": "maister"`, and `[Unreleased]` CHANGELOG against `package.json` 0.1.0.
- Sidebar copy needs an operator decision: a one-row tree titled **Overview** now sits beside the renamed **Tasks** webview. Both the code reviewer and the readiness checker asked for confirmation that this is final.

---

## Fix & Re-Verification History

**Cycle 1 — 2026-09-23T17:27:04Z.** Operator selected W2 and W3 for fixing at the Phase 11 gate, chose documentation for W1/C2, and declined C1 and all info items.

| Issue | Fix applied | Re-check outcome |
|---|---|---|
| **W2** — inert `z-index`, no `!important`, so the defensive style block did not resist page CSS | Replaced the two straight-line property runs in `src/webview/shim.ts` with `BUTTON_STYLE`/`NAV_STYLE` declaration tables applied by a shared `applyStyle()`. Visibility-critical properties (`display`, `visibility`, `opacity`, `max-height`, `overflow`, `float`) now carry `important` priority; cosmetic ones stay normal. The inert `z-index` line deleted. | **Resolved.** The three shim DOM tests still pass, including the computed-`display`/`visibility` assertion against the real hosted fixture. |
| **W3** — process-wide global stubbing after module-scope `acquireVsCodeApi()`; import-order hazard | Stub installation moved to `installDomStubs()`, called from a `before()` hook that asserts the stub exists then imports the bundle exactly once into a suite-scoped binding. `renderFallback()` is now synchronous; four call sites dropped `await`. | **Resolved.** `fallbackTask/breadcrumb` still 4 passing within the 39-test trusted suite; the failure mode now names its own cause. |
| **W1 / C2** — back link injected once, never re-asserted | Documented in `README.md` ("The four panel modes") as unsupported, noting the `editor/title` **Open Dashboard** button is always present so the dashboard stays reachable. No `MutationObserver` added — operator chose documentation over code. | **Resolved by decision.** Behaviour unchanged and now stated honestly in user-facing docs. |
| **C1** — CHANGELOG rename wording | Not applied — operator declined. | **Residual**, carried to commit time. |
| **C3** — out-of-scope `panel.ts:1342` edit in the working tree | Not a code change; requires explicit-path staging at commit. | **Residual**, actionable at commit. |
| **I1–I7, C4** | Not applied — operator declined. | **Residual**, all informational. |

**Cycle 1 suite run** (identical counts to pre-fix — no regressions): lint clean · build clean · `tsc --noEmit` exit 0 · `npm test` **54 passing** · integration **39 + 1 passing** · DOM **13 passed**.

### Cycle 2 — 2026-09-23T17:48:46Z (triggered by Phase 12 E2E)

E2E runtime verification found the cycle-1 W2 fix was **narrower than claimed**: 8 of 9 hostile-CSS vectors still neutralised the hosted link. Root cause — the `important` set was copied from the review note rather than derived from what can actually suppress an element, leaving `width`/`height` at *normal* priority immediately beside `overflow` at `important`, so `width:0!important` won while `overflow:hidden!important` lost. Operator chose to widen the set and add the missing test.

| Issue | Fix applied | Re-check outcome |
|---|---|---|
| **W2 (reopened)** — defence covered only six properties | Both style tables now mark every suppressing property `important`: visibility (`display`, `visibility`, `opacity`, `content-visibility`), box collapse (`width`, `height`, `min-*`, `max-*`, `font-size`, `line-height`), displacement (`position`, inset longhands, `float`, `text-indent`), clipping (`clip-path`, `transform`, `overflow`) and interaction (`pointer-events`). `z-index` restored, correctly paired with `position: relative`. | **Resolved.** New hostile-CSS test passes; it went **red first** against the real defect. |
| **Missing test** — nothing asserted hostile-CSS survival | Added `test/dom/shim.spec.ts` › "the hosted back link stays visible and clickable under hostile page CSS": injects 21 hostile `!important` declarations, then asserts visibility, a non-zero box, that the link is the **topmost element at its own centre** (`elementFromPoint`), and that a real click still posts exactly one `openDashboard`. | **Resolved.** DOM suite 19 → 20. |

**Three further defects surfaced only by running that new test**, each fixed: `BUTTON_STYLE` pinned no `position`/inset so the button was still moved off-screen; `inset: auto` as a *shorthand* did not carry `important` through to longhands in Chromium (replaced with explicit `left`/`right`/`top`/`bottom`); and `text-indent:-9999px` on the **nav** still displaced its inline child, having been pinned on the button only.

**Accepted limitation** (stated in the code comment): a page can still cover the link with its own stacked overlay — unwinnable from inside the page. The `editor/title` Open Dashboard button is the guaranteed route back, and the test deliberately omits that vector.

**Cycle 2 suite run**: lint clean · `tsc --noEmit` exit 0 · `npm test` **54 passing** · integration **39 + 1 passing** · DOM **20 passed**. `hostDashboard.ts` and `messages.ts` zero-line diffs both re-confirmed. Files changed: `src/webview/shim.ts`, `test/dom/shim.spec.ts`.

> **Working-tree note:** `media/webview.css`, `.vscodeignore`, `LICENSE`, `media/maister.svg`, `test/integration/a18-resolution.test.ts`, `test/dom/surfaces.spec.ts` and a new `SUPPORT.md` changed during this session from work **outside this task** (theme/contrast and packaging). The DOM baseline rose 13 → 19 for that reason, independently of this feature. This task touched none of them — which makes explicit-path staging (C3) more important, not less.

---

## Executive Summary

All five task groups completed across three waves, with Groups 2–4 running in parallel. Verification confirms the implementation is complete, standards-compliant and secure: the change reuses existing host plumbing end to end (no new command, message type, webview bundle or CSP surface), and the two security-critical files it was forbidden to touch have literal zero-line diffs. Production readiness returns **GO WITH MITIGATIONS** at 88%, with zero blockers attributable to this feature.

The warnings are quality and robustness issues in otherwise-working code, not defects in delivered behaviour. Every acceptance criterion across FR1–FR5 was verified against the real code and diff.

---

## Implementation Plan Verification

| Dimension | Result |
|---|---|
| Plan completion | **38/38 steps (100%)** — spot-checked across all five groups against real code |
| FR traceability | All five FRs trace to shipped code |
| Missing steps | None |

**Audit closures verified at specific lines:**
- **W3** (silent-green suite) — `'navTree'` present in `SUITES.trusted`, `test/integration/index.ts:11`. `navTree.test.ts` holds exactly 4 tests, matching the 31→35 proof-of-execution.
- **W2** (untested rename) — `test/unit/manifest.test.ts:147-151` asserts `overview.name === OVERVIEW.title`, plus a literal pin at `:144`. Both present, intentionally redundant.
- **W4** (unassertable runtime order) — manifest order asserted at `:140` only; no runtime-order assertion exists. Correct.

**Hard constraints — all held:**

| Constraint | Result |
|---|---|
| `src/panel/hostDashboard.ts` zero-line diff | ✅ empty (`git diff --numstat` returns nothing) |
| `src/panel/messages.ts` zero-line diff | ✅ empty |
| `media/webview.css` zero-line diff | ✅ empty |
| Nine palette-visible commands | ✅ 9 |
| Five DOM surfaces | ✅ 5 |
| No `"Project"` entry anywhere | ✅ none |
| No inline `style` on CSP-restricted surfaces | ✅ none |
| One `acquireVsCodeApi()` per webview file | ✅ confirmed |
| No change introduced at `src/panel/panel.ts` | ✅ only the pre-existing D6 hunk |

---

## Test Suite Results

Not run as a separate verification step (`skip_test_suite: true`), but independently re-executed by two verifiers:

| Runner | Result |
|---|---|
| `npm test` (unit) | **54 passing, 0 failing** |
| `npm run test:integration` (trusted) | **39 passing, 0 failing** |
| `npm run test:integration` (untrusted) | **1 passing** |
| `npm run test:dom` | **13 passing**, incl. 3 new shim tests and the Chromium-enforced CSP test |
| `npm run lint` | clean |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run build` | 7 webview bundles — set unchanged |
| `npx vsce ls` | 14 files, no source/test/map leakage |
| `npm audit --omit=dev` | 0 vulnerabilities |

**19 new tests** delivered (3 + 6 + 4 + 3 + 3), inside the plan's 19–25 band.

---

## Standards Compliance

**Status: mostly compliant** — 11 standards checked, 9 applicable, 9 followed.

`global/validation.md` and `frontend/responsive.md` were assessed as not applicable with stated reasoning (no user input or external data; VS Code chrome with no viewport work) rather than silently skipped.

One gap, and it is an accounting error rather than a code defect: the plan claimed the `shim.ts` header correction would be "the only comment added by the whole feature", but three convention-conforming purpose doc comments also landed (`src/strings.ts:112`, `src/views/navTree.ts:11` and `:29`). Every `strings.ts` block carries such a comment and `nowTree.ts` doc-comments its exports, so `global/commenting.md` itself is satisfied — the plan's arithmetic was wrong, not the code. No change-log comments anywhere, and no comment repeats the false `interceptLink` rationale (verified: `src/webview/shim.ts:162-165` has `stopPropagation()` bare).

---

## Documentation Completeness

**Status: complete.** `work-log.md` carries seven dated entries with per-group standards trails (plan-declared, INDEX-derived, and three discovered during execution), file-modification records and a final completion entry. `README.md` documents the three sidebar views and the first-install-only ordering limitation, naming **Views: Reset View Locations**. `CHANGELOG.md` has an Added/Changed entry with zero links, satisfying the Marketplace guard at `manifest.test.ts:205`.

---

## Code Review

**Status: issues found — 0 critical, 3 warning, 7 info.** Full report: `verification/code-review-report.md`.

All four security invariants verified true. Three decisions were validated as correct rather than merely plan-compliant — notably `NavTreeProvider`'s missing `dispose()` is genuinely leak-free (no emitter, no subscription, no captured disposables), and the asymmetry between `class` in the native fallback and `element.style` in the shim correctly tracks each surface's own CSP.

| ID | Severity | Issue | Location | Fixable |
|---|---|---|---|---|
| W1 | ~~warning~~ **resolved (documented)** | Injected back link is never re-asserted; a body re-render by the hosted page removes it silently | `src/webview/shim.ts:191` | no (design decision) |
| W2 | ~~warning~~ **fixed** | Defensive style block: `z-index` inert on a `position: static` element; no `!important`, so page CSS can still hide the node | `src/webview/shim.ts:142-188` | yes |
| W3 | ~~warning~~ **fixed** | Process-wide global stubbing after module-scope `acquireVsCodeApi()`; import-order hazard in the shared mocha run | `test/integration/fallbackTask.test.ts:212` | yes |
| I1 | info | `StubNode` cannot observe inline `style`; add an assertion to pin the CSP-critical property | `test/integration/fallbackTask.test.ts:100` | yes |
| I2 | info | `registerNavTree` returns unused `provider`/`view`; `NAV_VIEW_ID` exported but unreferenced | `src/views/navTree.ts:29` | yes |
| I3 | info | No `isTrusted` check on the injected button; impact nil (parameterless allowlisted message) | `src/webview/shim.ts:164` | no |
| I4 | info | `stopPropagation()` cannot affect the document capture listener that already ran | `src/webview/shim.ts:165` | yes |
| I5 | info | Shim borrows `FALLBACK` strings; extract a shared `BREADCRUMB` group (DRY) | `src/webview/shim.ts:9` | yes |
| I6 | info | Magic command count `9` is brittle and adds no coverage over the adjacent prefix assertion | `test/unit/manifest.test.ts:159` | yes |
| I7 | info | Sidebar naming: one-row tree titled Overview beside a webview titled Tasks; confirm final copy | `package.json:48` | no |

---

## Production Readiness

**Recommendation: GO WITH MITIGATIONS** — 88% overall, Low deployment risk for the feature. Full report: `verification/production-readiness-report.md`.

Monitoring/observability was correctly assessed **not applicable** (no server, no runtime infrastructure) rather than reported as a manufactured gap. Rollback is a genuine strength: no new command id, no new message type, no new bundle, no persisted state — a single `git revert` plus one file deletion.

| ID | Severity | Issue | Location | Fixable |
|---|---|---|---|---|
| B1 | warning | **Pre-existing, not this task**: `"publisher": "maister"` is still the placeholder; `vsce publish` would fail or publish under the wrong identity | `package.json` | yes |
| B2 | warning | **Pre-existing, not this task**: version not bumped; changes sit under `[Unreleased]` while `package.json` says 0.1.0 | `package.json`, `CHANGELOG.md` | yes |
| C1 | warning | CHANGELOG rename entry does not name the old location the way a confused user will search for it; "Overview" is simultaneously vacated and reused | `CHANGELOG.md` | yes |
| C2 | ~~warning~~ **resolved (documented)** | Duplicate of code review W1 — single injection with no re-check. Mitigated by the always-present `editor/title` Open Dashboard button, so a user can never be stranded | `src/webview/shim.ts` | no |
| C3 | warning | Release hygiene: the uncommitted out-of-scope `panel.ts:1342` edit would be swept by `git commit -a` | `src/panel/panel.ts:1342` | yes (staging discipline) |
| C4 | info | `view/title` Open Dashboard button still bound to `maister.overview` (now "Tasks") — redundant chrome beside the new nav row | `package.json` menus | yes |

---

## Overall Assessment

| Dimension | Status | Detail |
|---|---|---|
| Implementation plan | ✅ Complete | 38/38 steps (100%), spot-checked against real code |
| Test suite | ✅ Passing | 54 unit + 40 integration + 13 DOM, 0 failures; lint and `tsc` clean |
| Standards compliance | ⚠️ Mostly compliant | 9/9 applicable followed; one plan-arithmetic error on the comment budget |
| Documentation | ✅ Complete | work-log, README, CHANGELOG all current |
| Code review | ⚠️ Issues found | 0 critical, 3 warning, 7 info |
| Production readiness | ⚠️ GO with mitigations | 0 blockers from this feature; 2 pre-existing release blockers |
| **Overall** | **⚠️ Passed with Issues** | No critical findings; nothing blocks the feature |

**Issue counts (deduplicated — code review W1 and readiness C2 are the same finding).**
At verification: 0 critical · 5 warning · 10 info. **After the fix cycle: 0 critical · 2 warning · 10 info** — W2 and W3 fixed, W1/C2 resolved by documentation.

---

## Issues Requiring Attention

**Before committing:**
1. **C3** — Stage this feature's files by explicit path. The out-of-scope `panel.ts:1342` edit must not ride along.

**Fixed in cycle 1 (see Fix & Re-Verification History):**
2. ~~**W2**~~ — ✅ Fixed. Inert `z-index` deleted; visibility-critical properties now carry `important` priority via declaration tables.
3. ~~**W3**~~ — ✅ Fixed. Stubbing moved into a `before()` hook; the bundle is imported once into a suite-scoped binding.
4. ~~**W1 / C2**~~ — ✅ Resolved by decision. Documented in `README.md` as an unsupported case; the `editor/title` button keeps the dashboard reachable.

**Still open (operator declined in cycle 1):**
5. **C1** — One-line CHANGELOG rewording so users who go looking for "Overview" find their task list.
6. **I7 / C4** — Confirm the Overview/Tasks sidebar copy and whether the now-redundant `view/title` button stays.
7. **I1–I6** — Remaining informational cleanups.

**Out of scope for this task:** B1, B2 (pre-existing release blockers).

---

## Verification Checklist

- [x] Completeness check — 38/38 steps verified against real code
- [x] Test suite — inherited from implementation, independently re-run by two verifiers
- [x] Standards compliance — 11 checked, 9 applicable, 9 followed
- [x] Documentation completeness — work-log, README, CHANGELOG
- [x] Code review — 0 critical
- [ ] Pragmatic review — declined by operator at the Phase 10 gate
- [x] Production readiness — GO with mitigations
- [ ] Reality check — declined by operator at the Phase 10 gate
- [x] Audit findings W2/W3/W4 closure verified
- [x] All hard constraints verified against the real diff
