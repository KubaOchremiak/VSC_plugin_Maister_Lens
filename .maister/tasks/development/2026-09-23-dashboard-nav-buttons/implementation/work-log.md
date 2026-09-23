# Work Log

## 2026-09-23T14:23:36Z - Implementation Started

**Total Steps**: 38
**Task Groups**: 1 Strings Foundation, 2 Sidebar Nav View, 3 Native Task Back Link, 4 Hosted Task Back Link, 5 Test Review / Rename Coverage / Docs
**Waves**: 1 → [G1] · 2 → [G2, G3, G4] parallel · 3 → [G5]
**Plan validation**: all 5 groups declare both `Dependencies:` and `Files to Modify:`. Wave 2 file sets verified pairwise disjoint. Parallel execution enabled.

## Standards Reading Log

### Loaded Per Group
(Entries added as groups execute)

### Group 1: Strings Foundation
**From Implementation Plan**:
- [x] .maister/docs/standards/global/minimal-implementation.md — exactly two NAV keys; no "Project" entry, no placeholder keys
- [x] .maister/docs/standards/global/coding-style.md — NAV follows the one-block-per-surface shape, `Label` suffix convention
- [x] .maister/docs/standards/global/commenting.md — one purpose doc-comment, no change-log comments
- [x] .maister/docs/standards/frontend/accessibility.md — `dashboardLabel` is a real action-phrase accessible name, not a duplicate of the visible label

**From INDEX.md**:
- [x] .maister/docs/standards/global/validation.md — reviewed, no bearing on a literal-only module
- [x] .maister/docs/standards/global/error-handling.md — reviewed, no bearing on a literal-only module

**Discovered During Execution**:
- None. The file-level doc comment already states the "single home for every user-facing string" convention.

## 2026-09-23T14:26:00Z - Group 1 Complete

**Steps**: 1.1 through 1.7 completed
**Tests**: 51 passing, 0 failing (4 strings tests, all 3 new ones verified RED before implementation)
**Files Modified**: src/strings.ts, test/unit/strings.test.ts
**Keys landed for downstream groups**:
- `OVERVIEW.title = 'Tasks'` (key name and view id `maister.overview` unchanged)
- `FALLBACK.breadcrumb = '← Dashboard'`, `FALLBACK.breadcrumbLabel = 'Breadcrumb'` (top of the FALLBACK block)
- new `NAV` block above `NOW`: `NAV.dashboard = 'Dashboard'`, `NAV.dashboardLabel = 'Open the Maister dashboard'`
**Constraint verified**: `src/strings.ts` still has ZERO imports — Group 4's bundle-safe import remains tree-shakeable.
**Notes**:
- `FALLBACK.breadcrumb`/`breadcrumbLabel` deliberately duplicate `RISKS.breadcrumb`/`breadcrumbLabel`; the one-block-per-surface convention is explicit, and the new test asserts the two stay equal so drift is caught.
- The `.mocharc` `spec` glob makes a single-file mocha invocation run the whole unit suite; step 1.7's isolation intent was unachievable as written. Harmless (all pass), but later groups scoping tests should account for it.
- `package.json` still declares `"name": "Overview"` for `maister.overview`; that retitle is Group 2's step 2.7.

### Group 2: Sidebar Nav View
**From Implementation Plan**:
- [x] .maister/docs/standards/global/minimal-implementation.md — no new command/bundle/viewsWelcome/badge; no empty stub methods
- [x] .maister/docs/standards/global/coding-style.md — NAV_VIEW_ID / NavTreeProvider / registerNavTree mirror the NOW_* conventions
- [x] .maister/docs/standards/global/commenting.md — one timeless doc line per export, no change-log comments
- [x] .maister/docs/standards/frontend/components.md — single responsibility, no TaskIndex dependency, no state
- [x] .maister/docs/standards/frontend/accessibility.md — accessibilityInformation.label = NAV.dashboardLabel

**From INDEX.md**:
- [x] .maister/docs/standards/global/validation.md — reviewed, no user input in this group
- [x] .maister/docs/standards/global/error-handling.md — reviewed, no failure path (the provider is a constant)
- [x] .maister/docs/project/tech-stack.md — confirmed no new dependency, no new esbuild entry

**Discovered During Execution**:
- None; the plan's list covered the group's surface.

## 2026-09-23T17:03:17Z - Group 2 Complete

**Steps**: 2.1 through 2.10 completed
**Tests**: integration 31 → 35 passing (+4 exactly, step 2.3 proof-of-execution satisfied, all four navTree tests named in reporter output); `npx mocha test/unit/manifest.test.ts` → 53 passing, 0 failing. Lint, build and `tsc -p tsconfig.json` all clean; bundle list unchanged.
**Files Modified**: src/views/navTree.ts (created), test/integration/navTree.test.ts (created), package.json, src/extension.ts, test/integration/index.ts, test/unit/manifest.test.ts
**Notes**:
- Intentional deviation from step 2.5: `NavTreeProvider` holds no resources (no emitter, no subscription), so it has no `dispose()`. Adding an empty one would be a stub forbidden by minimal-implementation.md — `registerNavTree().dispose()` disposes only the view.
- `createTreeView` called without `showCollapseAll`; a single-row tree has nothing collapsible.
- Manifest order asserted only; runtime sidebar order deliberately unasserted (audit W4).
- Same integration run reported 4 failures in `fallbackTask/breadcrumb` (`TypeError: document.createTextNode is not a function`) — sibling Group 3's in-flight work, outside Group 2's file set, absent at the 31-test baseline. Flagged for Group 3 to resolve before Group 5.

### Group 4: Hosted Task Back Link (shim injection)
**From Implementation Plan**:
- [x] .maister/docs/standards/global/error-handling.md — injectBackLink() returns early when document.body is unavailable; rest of the shim still initialises
- [x] .maister/docs/standards/frontend/css.md — no new CSS rule; inline properties are the minimum needed; theme variables with literal fallbacks
- [x] .maister/docs/standards/frontend/accessibility.md — semantic nav[aria-label] + button[type=button], name from text content, no tabindex
- [x] .maister/docs/standards/global/commenting.md — exactly ONE comment feature-wide (the header correction); a second one-line comment was added then removed to honour the constraint
- [x] .maister/docs/standards/global/minimal-implementation.md — no new message type, no new bundle, no second acquireVsCodeApi(), no shim-local string constant

**From INDEX.md**:
- [x] .maister/docs/standards/global/coding-style.md — injectBackLink/backLink follow the file's verb-first naming; no dead code
- [x] .maister/docs/project/tech-stack.md — zero new runtime dependencies, no new esbuild entry
- [x] .maister/docs/standards/global/validation.md — reviewed, not applicable (no user input)

**Discovered During Execution**:
- None beyond the above.

## 2026-09-23T17:03:45Z - Group 4 Complete

**Steps**: 4.1 through 4.8 completed
**Tests**: `npx playwright test test/dom/shim.spec.ts` → RED first (1 passed / 2 failed, the degradation test passing vacuously pre-implementation), then 3 passed. Regression: `test/dom/security.spec.ts` → 2 passed. `test/dom/surfaces.spec.ts` deliberately NOT run — Group 3 owned it live in the same wave. Lint and build clean.
**Hard constraints verified**: `git diff --stat src/panel/hostDashboard.ts` EMPTY (zero-line diff, three-insertion contract preserved). Exactly one `acquireVsCodeApi()` call in shim.ts. No new file under `src/webview/`, so the bundle count is provably unchanged.
**Files Modified**: src/webview/shim.ts (+69), test/dom/shim.spec.ts (created)
**Notes**:
- Deviation from declared `Files to Modify`, accepted by the executor: tests went into a NEW `test/dom/shim.spec.ts` rather than being appended to `test/dom/security.spec.ts`, whose scope is CSP/nonce guarantees rather than chrome. It adds no entry to the surfaces array (still five) and collides with no sibling-owned file.
- Bundle-count clarification: `dist/webview/*.js` is 7 files because `esbuild.mjs` globs every `src/webview/*.ts`; the plan's "five bundles" refers to the five DOM surfaces, which are unchanged.
- Test 3 overrides the `Document.prototype.body` accessor in an init script before the shim loads (no real page yields a null body); it asserts no pageerror, zero injected elements, and that interceptLink still yields exactly `{type:'navigate', href}`.
- Test 2 asserts clicking the button produces ZERO navigate messages — empirical evidence for the plan's Key Decision, with no comment repeating the spec's false interceptLink rationale.
- `stopPropagation()` present as plain defence-in-depth with no explanatory comment, per the constraint.
- The nav carries z-index 2147483647 plus explicit visibility/overflow/width/height/float/opacity so task-author CSS cannot collapse or hide it; test 1 asserts computed display/visibility against the real hosted fixture.

### Group 3: Native Task Back Link
**From Implementation Plan**:
- [x] .maister/docs/standards/frontend/accessibility.md — semantic nav[aria-label] + button[type=button], name from text content, no tabindex, first tab stop
- [x] .maister/docs/standards/frontend/css.md — zero new CSS; styling solely from the existing .link class
- [x] .maister/docs/standards/global/minimal-implementation.md — reused el(), the local post(), the single acquireVsCodeApi() handle and the allowlisted openDashboard message
- [x] .maister/docs/standards/global/coding-style.md — the three lines mirror src/webview/risksMode.ts:431-433 in shape
- [x] .maister/docs/standards/global/commenting.md — no comment in fallbackTask.ts; the single test-file comment documents a non-obvious test-infra invariant

**From INDEX.md**:
- [x] .maister/docs/standards/global/validation.md, global/error-handling.md — reviewed; no new input or failure path
- [x] .maister/docs/standards/frontend/components.md — the crumb has a single responsibility, no state
- [x] .maister/docs/project/tech-stack.md — no new dependency; five webview bundles after build

**Discovered During Execution**:
- [x] .maister/docs/standards/global/conventions.md (minimal dependencies) — trigger: step 3.1. The extension host has no `document` and the repo deliberately carries no DOM library. Rather than add a devDependency to satisfy the plan's instruction to place these tests in the integration runner, a ~60-line local `StubNode` DOM stub was written covering exactly the operations el()/render() perform.

## 2026-09-23T17:04:10Z - Group 3 Complete

**Steps**: 3.1 through 3.7 completed
**Tests**: `MAISTER_TEST_GREP='fallbackTask' npm run test:integration` → 5 passing, 0 failing (1 pre-existing + 4 new), red-before-green confirmed. `npm run test:dom` → 11 passed; surfaces.spec.ts unmodified and green — the blanket a11y loop picks the new control up automatically and the tabOrder check over the first six controls still passes with the breadcrumb now at index 0; surfaces array still FIVE. Lint, build and `tsc --noEmit` clean.
**Hard constraints verified**: `git diff --stat src/panel/messages.ts` empty; `git diff --stat media/webview.css` empty; no innerHTML / style= / tabindex in fallbackTask.ts; exactly one acquireVsCodeApi() call; the nav is the first node appended by render().
**Files Modified**: src/webview/fallbackTask.ts (+5 in render()), test/integration/fallbackTask.test.ts (+162)
**Notes**:
- The mid-wave `document.createTextNode is not a function` failures Group 2 observed were this group's TDD red phase, since resolved.
- Stub bug found and fixed through the harness: the first version created a fresh `posted` array per render, but the bundle captures `const api = acquireVsCodeApi()` once at module load, so only the first stub was ever used. The array is now module-scoped and cleared per render.
- Carried into Group 5: the required assertion "the back link is the FIRST FOCUSABLE control in the fallbackTask surface" is NOT yet covered — these tests assert first-node-in-fragment, not first-focusable-in-rendered-page. It belongs in test/dom/surfaces.spec.ts per step 5.2.
- The StubNode stub should move to test/helpers/ if it ever gets a second consumer.

### Group 5: Test Review, Rename Coverage & Documentation
**From Implementation Plan**:
- [x] .maister/docs/standards/global/conventions.md — README and CHANGELOG updated alongside the behaviour; Keep-a-Changelog Added/Changed shape
- [x] .maister/docs/standards/global/minimal-implementation.md — 3 tests of a permitted 6; no speculative coverage; no runtime-sidebar-order test (audit W4)
- [x] .maister/docs/standards/frontend/accessibility.md — the first-focusable assertion uses the harness's real accessible-name computation and a real Tab press, not DOM position
- [x] .maister/docs/standards/global/commenting.md — zero comments added; the new tests are self-describing through their names

**From INDEX.md**:
- [x] .maister/docs/standards/global/coding-style.md — SURFACES follows the file's SCREAMING_SNAKE module-const convention; no dead code left by the hoist
- [x] .maister/docs/standards/global/validation.md, global/error-handling.md — reviewed, no bearing on a test/docs group
- [x] .maister/docs/project/vision.md — confirmed README wording stays inside the read-only, no-git-browsing scope

**Discovered During Execution**:
- [x] test/unit/manifest.test.ts:197 already asserts NO repo-relative links in CHANGELOG.md ("a relative link breaks in the Marketplace"). Trigger: step 5.3. The new CHANGELOG entry was written with zero links; the existing guard passes.
- [x] .mocharc uses a `spec` glob, so a single-file mocha invocation runs the whole unit suite (first noted by Group 1). Accounted for when reading counts.

## 2026-09-23T17:07:27Z - Group 5 Complete

**Steps**: 5.1 through 5.5 completed
**Tests added**: 3 of a permitted 6 — (1) manifest↔strings.ts drift assertion closing audit W2, (2) rendered Overview `<main aria-label>` positive check, (3) the first-focusable-control + five-surfaces assertion that closes the gap Group 3 carried over.
**Supporting refactor**: the `surfaces` array in surfaces.spec.ts hoisted to a module-scope `SURFACES` so the a11y loop and the new test share one source of truth. No behaviour change.
**Files Modified**: test/unit/manifest.test.ts, test/dom/surfaces.spec.ts, README.md, CHANGELOG.md
**Notes**:
- The aria-label test is partly tautological (harness.ts:56 sources the label from OVERVIEW.title); the plan anticipated this. The manifest drift test is the one that would actually go red on a package.json↔strings.ts drift.
- manifest.test.ts now pins the Overview name twice — `=== 'Tasks'` (literal, pins shipped copy) and `=== OVERVIEW.title` (drift check, pins the two sources together). Both intentional.
- CHANGELOG entry sits under `## [Unreleased]`; needs folding into a version heading at release time.

## 2026-09-23T17:07:27Z - Implementation Complete

**Total Steps**: 38 of 38 completed (0 skipped)
**Task Groups**: 5 of 5 complete across 3 waves (W1: G1 · W2: G2+G3+G4 parallel · W3: G5)
**Total Standards**: 11 distinct standards/docs applied across the five groups; 3 discovered during execution (conventions.md minimal-dependencies in G3, the CHANGELOG no-relative-links guard and the .mocharc spec glob in G5)
**Test Suite (full three-runner pass, Group 5 step 5.4)**:
- `npm run lint` — clean
- `npm test` — 54 passing, 0 failing
- `npm run test:integration` — 39 passing + 1 untrusted, 0 failing
- `npm run test:dom` — 13 passed, 0 failed
- Feature total: 19 new tests (3 + 6 + 4 + 3 + 3), inside the plan's 19–25 band
**Hard constraints (verified against the real diff)**: hostDashboard.ts and messages.ts both zero-line diffs; nine palette-visible commands; five surfaces; no "Project" entry anywhere; no new CSS rule in media/webview.css; no inline `style` attribute in any native-panel bundle; one acquireVsCodeApi() per webview file.
**Final diff**: 13 files changed, 367 insertions, 20 deletions, plus 3 untracked source/test files (src/views/navTree.ts, test/dom/shim.spec.ts, test/integration/navTree.test.ts).
**OPEN FOR OPERATOR**: the uncommitted `ViewColumn.Beside` → `Active` change at src/panel/panel.ts:1342 is pre-existing and explicitly out of scope (decision D6). No group touched panel.ts. It will be swept into any `git commit -a` — stage this feature's files explicitly, or decide whether that line ships.

## 2026-09-23T17:27:00Z - Verification Fixes Applied

**Source**: Phase 11 verification. Operator selected W2 and W3 for fixing; W1/C2 to be documented as a known limitation; C1 and all info items deliberately left alone.

**W2 — defensive styling in `src/webview/shim.ts` (code review warning)**
The ~30-property block did not deliver the override-resistance it was written for: `z-index: 2147483647` was inert because the same element sets `position: static`, and no declaration used `!important`, so a page rule like `.maister-lens-back { display: none !important }` still won.
Fix: replaced the two straight-line property runs with `BUTTON_STYLE` / `NAV_STYLE` declaration tables applied by a shared `applyStyle()` helper. Visibility-critical properties (`display`, `visibility`, `opacity`, `max-height`, `overflow`, `float`) now carry `important` priority; purely cosmetic ones stay at normal priority so a dashboard's own theme can still influence them. The inert `z-index` line is gone. One doc comment added stating why the split exists.

**W3 — global stubbing in `test/integration/fallbackTask.test.ts` (code review warning)**
`renderFallback()` assigned `globalThis.document` / `window` / `acquireVsCodeApi` and then dynamically imported the bundle on every call. Because the bundle captures `acquireVsCodeApi()` once at module scope and ESM caches imports, the suite depended on being the first importer in the shared mocha process — an ordering hazard that would have surfaced as `acquireVsCodeApi is not defined` from an unrelated suite.
Fix: stub installation moved into `installDomStubs()`, called from a `before()` hook that also asserts the stub exists and then imports the bundle exactly once into a suite-scoped binding. `renderFallback()` is now synchronous and only renders; the four call sites dropped their `await`.

**W1 / C2 — single injection, documented as a known limitation (operator decision)**
`injectBackLink()` runs once and never re-asserts, so a hosted dashboard that replaces `document.body` after load loses the link. Recorded in `README.md` ("The four panel modes") as unsupported, noting that the `editor/title` **Open Dashboard** button is always present so the dashboard stays reachable. No `MutationObserver` added — the operator chose documentation over code.

**Deliberately NOT fixed** (operator declined): C1 CHANGELOG rewording; I1 StubNode style assertion; I2 unused `registerNavTree` returns; I3 `isTrusted`; I4 inert `stopPropagation`; I5 shared `BREADCRUMB` group; I6 magic command count; I7/C4 sidebar copy and redundant `view/title` button.

**Re-verification**: `npm run lint` clean · `npm run build` clean · `npx tsc -p tsconfig.json --noEmit` exit 0 · `npm test` **54 passing, 0 failing** · `npm run test:integration` **39 passing + 1 untrusted, 0 failing** · `npm run test:dom` **13 passed, 0 failed**. Identical counts to the pre-fix run — no regressions, no tests added or removed.
**Files Modified**: src/webview/shim.ts, test/integration/fallbackTask.test.ts, README.md

## 2026-09-23T17:48:46Z - W2 Widened After E2E (fix cycle 2)

**Source**: Phase 12 E2E runtime verification. The cycle-1 W2 fix was narrower than claimed: the E2E verifier probed 9 hostile-CSS vectors in isolation and 8 neutralised the hosted back link. Root cause was an `important` set copied from the review note rather than derived from what can actually suppress an element — `width`/`height` sat at NORMAL priority immediately beside `overflow` at `important`, so `width:0!important` won while `overflow:hidden!important` lost. Operator chose to widen the set and add the missing test.

**Fix — `src/webview/shim.ts`**
Both `BUTTON_STYLE` and `NAV_STYLE` now mark every property that can suppress an element as `important`: visibility (`display`, `visibility`, `opacity`, `content-visibility`), box collapse (`width`, `height`, `min-*`, `max-*`, `font-size`, `line-height`), displacement (`position`, `left`/`right`/`top`/`bottom`, `float`, `text-indent`), clipping (`clip-path`, `transform`, `overflow`) and interaction (`pointer-events`). `z-index` is back, now correctly paired with `position: relative` on the nav — the cycle-1 removal was right that it was inert on a static box, but nothing had replaced it.

**Two defects found only by running the new test — it went RED first, then green:**
1. `BUTTON_STYLE` pinned no `position`/inset, so `position:absolute; left:-9999px` still moved the button off-screen. Fixed with `position: static` plus the four inset longhands.
2. `inset: auto` as a SHORTHAND did not carry `important` through to the longhands in Chromium. Replaced with explicit `left`/`right`/`top`/`bottom`.
3. `text-indent: -9999px` on the NAV still displaced its inline child — `text-indent` had been pinned on the button only. Added to `NAV_STYLE`.

**New test — `test/dom/shim.spec.ts`**
"the hosted back link stays visible and clickable under hostile page CSS": injects a stylesheet carrying all 21 hostile declarations at `!important`, then asserts Playwright visibility, a non-zero bounding box, that the link is the TOPMOST element at its own centre via `elementFromPoint`, and that a real click still posts exactly one `openDashboard`. The absence of exactly this test is how the gap survived the cycle-1 rewrite.

**Accepted limitation, stated in the code comment**: a page can still cover the link with its own stacked overlay. That case is unwinnable from inside the page; the `editor/title` Open Dashboard button is the guaranteed route back. The test deliberately omits the overlay vector.

**Re-verification**: `npm run lint` clean · `npx tsc --noEmit` exit 0 · `npm test` **54 passing** · `npm run test:integration` **39 + 1 passing** · `npm run test:dom` **20 passed** (19 + the new hostile-CSS test). `git diff --stat` on `src/panel/hostDashboard.ts` and `src/panel/messages.ts` both still EMPTY.
**Files Modified**: src/webview/shim.ts, test/dom/shim.spec.ts

**NOTE — parallel edits in the working tree, not from this task**: `media/webview.css`, `.vscodeignore`, `LICENSE`, `media/maister.svg`, `test/integration/a18-resolution.test.ts`, `test/dom/surfaces.spec.ts` and a new `SUPPORT.md` changed during this session from work outside this task (theme/contrast and packaging). The DOM baseline rose from 13 to 19 tests for that reason. This task touched none of them. Staging by explicit path matters more than ever.

## 2026-09-23T17:50:22Z - Workflow Complete

**Phases**: 1, 2, 5, 6, 7, 8, 10, 11, 12, 14 completed · 3, 9 not activated (no reproducible defect) · 4 skipped (operator declined mockups) · 13 skipped (operator declined user docs)
**Groups**: 5 of 5 · **Steps**: 38 of 38 · **Tests**: 20 new across three runners
**Fix cycles**: 2 (W2/W3 from code review; W2 reopened and widened after E2E)
**Final suites**: lint clean · `tsc --noEmit` exit 0 · `npm test` 54 passing · `npm run test:integration` 39 + 1 passing · `npm run test:dom` 20 passed · 0 failures
**Hard constraints held throughout**: `src/panel/hostDashboard.ts` and `src/panel/messages.ts` zero-line diffs; nine palette-visible commands; five DOM surfaces; no new command, message type, CSS rule or webview bundle; no "Project" entry.
**NOT committed** — staging deliberately left to the operator, because unrelated parallel work (theme/contrast, packaging, branding) shares the working tree.
