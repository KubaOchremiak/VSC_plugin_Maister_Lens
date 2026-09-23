# E2E Verification Report

## TL;DR
Both back links (FR3 native, FR4 hosted) pass every runtime check: first DOM node, first Tab stop, accessible name, and exactly `{type:'openDashboard'}` on activation — zero `navigate` messages. The W2 defensive-styling fix holds against the exact hostile stylesheet it was written for. But it is narrower than it looks: 8 of 9 hostile-CSS vectors I probed still neutralise the link, because only 6 properties carry `important` while `width`, `height`, `font-size` and `pointer-events` do not. FR1 (sidebar tree view) is **not verifiable by this method** — it lives in VS Code chrome. Verdict: GO WITH CAVEATS.

## Open Questions / Risks
- The W2 claim "survives hostile page CSS" is true only for the specific property set defended. `pointer-events:none`, `width/height:0`, `font-size:0`, `clip-path`, `transform:scale(0)`, `content-visibility:hidden`, off-screen `position:absolute`, and a full-page overlay each defeat the link — all confirmed empirically (§5.2).
- `width`/`height` are set on the nav at *normal* priority while `overflow`/`max-height` are set at `important` — an internally inconsistent defence; `width:0!important` from the page wins.
- Removing the inert `z-index` was correct (z-index is inert on `position:static`), but nothing replaced it, so a page overlay can still cover the link.
- FR1 sidebar view is untested here by design; it needs the `@vscode/test-electron` integration path, not a browser.

## 1. Identifier
- **Task**: 2026-09-23-dashboard-nav-buttons
- **Task path**: `/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/.maister/tasks/development/2026-09-23-dashboard-nav-buttons`
- **Spec**: `.maister/tasks/development/2026-09-23-dashboard-nav-buttons/implementation/spec.md`
- **Date**: 2026-09-23
- **Git ref**: a5b106b (main, with the task's working-tree changes uncommitted)
- **Tester**: e2e-test-verifier (maister)

## 2. Test Environment
| Field | Value |
|---|---|
| Base URL | `http://127.0.0.1:8899` (local static server over the project's own generated surfaces — there is no app dev server) |
| Browser | Playwright MCP Chromium |
| Viewport | 1280×720 (default) |
| Auth context | anonymous (not applicable — VS Code webview surfaces) |
| Test data | `test/fixtures/tasks/dev-real/` for the hosted page; an inline `FallbackPayload` fixture for the native surface |

**Route taken (stated plainly).** This is a VS Code extension, so there is no app to point a browser at. I reproduced `test/dom/harness.ts` outside the Playwright runner: ran `npm run build`, bundled `src/panel/hostDashboard.ts` for Node, and regenerated the two pages the harness builds — the `fallbackTask` bundle shell and the re-hosted `dev-real/dashboard.html` (three insertions + shim + `dashboard-data.js`). Because the Playwright MCP browser blocks the `file:` protocol, I served the tree over HTTP and passed that origin as `cspSource`/`baseHref`, and injected the harness's `acquireVsCodeApi` stub as a nonced inline script so the hosted CSP admits it. Every assertion below comes from that live page, not from reading source. I separately ran `npm run test:dom` (19 passed) as corroboration.

## 3. Executive Summary
**Verdict**: ⚠️ GO WITH CAVEATS

| Metric | Count |
|---|---|
| Scenarios planned | 9 |
| Scenarios executed | 8 |
| Passed | 7 |
| Failed | 1 |
| Blocked | 0 |
| Pass rate | 88% |
| Critical issues | 0 |
| Major issues | 1 |
| Minor issues | 2 |
| Cosmetic issues | 0 |

Both back links are correct, accessible and correctly wired. The native link is the first node in `#root`, the first Tab stop of 7 focusables, carries `aria-label="Breadcrumb"` on its `<nav>` and `class="link"` with no inline style anywhere in the document, and Enter on it posts exactly `{type:'openDashboard'}`. The hosted link is `document.body.firstChild`, computed `display:block / visibility:visible / opacity:1`, renders an 81×18px box at (12,10), survives a `refresh` re-render, and both click and Enter post exactly one `openDashboard` and zero `navigate` — confirming the `stopPropagation()` guard against the shim's own capture-phase interceptor. The headline finding is on W2: the fix does exactly what the brief's stylesheet tests, but a broader probe shows the defended property set is incomplete, so "survives hostile page CSS" is an overstatement of what was actually achieved.

## 4. Verification Scenarios

### 4.1 Native back link — structure and position — ✅ Passed
- **User story / acceptance criterion**: FR3 AC1, AC3, AC4, AC6
- **Preconditions**: `fallbackTask` bundle shell loaded, one `task` payload posted.

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Post `FallbackPayload`, read `#root.firstElementChild` | `<nav aria-label="Breadcrumb">` | `NAV`, `aria-label="Breadcrumb"` | ✅ |
| 2 | Read its child button | `<button type="button" class="link">← Dashboard</button>` | tag `BUTTON`, type `button`, class `link`, text `← Dashboard` | ✅ |
| 3 | Read `tabindex` | absent / non-positive | `null` | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/01-native-breadcrumb-focused.png`
- **Acceptance criteria checklist**:
  - [x] `<nav>` is the first node (FR3 AC3)
  - [x] `<button type="button" class="link">` structure (FR3 AC1)
  - [x] Rendered unconditionally on the payload (FR3 AC4)
  - [x] `button`, not a heading; no positive tabindex (FR3 AC6)

### 4.2 Native back link — first focusable by real Tab — ✅ Passed
- **User story / acceptance criterion**: FR3 AC3; Accessibility Requirements
- **Preconditions**: focus parked on `document.body` (`tabIndex=-1`, `.focus()`) to reset Chromium's sequential-focus starting point.

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Press Tab once from page start | Focus lands on the back link | `activeElement` = `BUTTON.link` "← Dashboard" | ✅ |
| 2 | Compare against focusable inventory | It is index 0 | `isFirstFocusable: true`, 7 focusables total | ✅ |
| 3 | Count positive tabindex in the surface | 0 | `positiveTabindexCount: 0` | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/01-native-breadcrumb-focused.png`
- **Acceptance criteria checklist**:
  - [x] First in tab order
  - [x] No positive `tabindex` anywhere in the surface

### 4.3 Native back link — activation posts exactly `openDashboard` — ✅ Passed
- **User story / acceptance criterion**: FR3 AC2
- **Preconditions**: back link focused (from 4.2); stubbed `acquireVsCodeApi` recording into `window.__posted`.

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Press Enter | One `openDashboard` message appended | `__posted` = `[{"type":"ready"},{"type":"openDashboard"}]` | ✅ |
| 2 | Inspect payload shape | Exactly `{type:'openDashboard'}`, no extra keys | exact match | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/01-native-breadcrumb-focused.png`
- **Acceptance criteria checklist**:
  - [x] Reuses the existing local `post` helper's message shape (FR3 AC2)
  - [x] Keyboard-operable, not mouse-only

### 4.4 Native surface — no inline styles (CSP conformance) — ✅ Passed
- **User story / acceptance criterion**: FR3 AC5; Success Criterion 6
- **Preconditions**: rendered native surface.

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | `document.querySelectorAll('[style]').length` | 0 | `0` | ✅ |
| 2 | Read `style` attr on the nav and button | `null` on both | `null`, `null` | ✅ |

- **Issues observed**: Computed `color` was `rgb(0,0,0)` because `--vscode-textLink-foreground` is undefined outside VS Code. This is a harness limitation, not a defect — contrast cannot be judged from this route. See §8.
- **Evidence**: `screenshots/01-native-breadcrumb-focused.png`
- **Acceptance criteria checklist**:
  - [x] Zero inline `style` attributes in the native bundle (FR3 AC5)

### 4.5 Hosted back link — injected, first body child, genuinely visible — ✅ Passed
- **User story / acceptance criterion**: FR4 AC1, AC2, AC4
- **Preconditions**: `dev-real/dashboard.html` re-hosted via `hostDashboardHtml` with the real shim and `dashboard-data.js`; page fully loaded (`ready` reported `dataLoaded: true`).

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Read `document.body.firstChild` | the injected nav | `NAV.maister-lens-back`, `isFirstBodyChild: true` | ✅ |
| 2 | Read `aria-label` and button text | `Breadcrumb` / `← Dashboard` | exact match, `type="button"`, no `tabindex` | ✅ |
| 3 | Computed visibility of the nav | display block, visibility visible, opacity 1 | `block` / `visible` / `1`; max-height `none`, overflow `visible`, float `none` | ✅ |
| 4 | Computed visibility of the button | visible, themed, pointer cursor | `inline-block` / `visible` / `1`, color `rgb(55,148,255)`, cursor `pointer` | ✅ |
| 5 | Layout box and `checkVisibility()` | non-zero box in viewport | 81.25×18.19 at (12,10); `checkVisibility(): true` | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/02-hosted-backlink-visible.png`
- **Acceptance criteria checklist**:
  - [x] First child of `document.body` (FR4 AC2)
  - [x] Distinctive class `maister-lens-back` + style set as properties (FR4 AC4)
  - [x] Actually visible at runtime, not merely present in the DOM

### 4.6 Hosted back link — click posts one `openDashboard`, zero `navigate` — ✅ Passed
- **User story / acceptance criterion**: FR4 AC3, AC5
- **Preconditions**: hosted page loaded; shim's capture-phase `interceptLink` active on `click` and `auxclick`.

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Click the back link (real mouse event) | one `openDashboard` | `openDashboardCount: 1` | ✅ |
| 2 | Count `navigate` messages | 0 | `navigateCount: 0` | ✅ |
| 3 | Park focus on body, Tab once | Focus lands on the back link | `activeElement` = "← Dashboard", `isFirstFocusable: true` of 7 | ✅ |
| 4 | Press Enter | one `openDashboard`, zero `navigate` | `1` / `0` | ✅ |
| 5 | Post `{type:'refresh'}`, wait for the dashboard's re-render | link still first child and visible | `stillFirstChild: true`, `stillVisible: true` | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/02-hosted-backlink-visible.png`
- **Acceptance criteria checklist**:
  - [x] Posts through the existing `vscodeApi` handle (FR4 AC3)
  - [x] `stopPropagation()` prevents conversion into `navigate` (FR4 AC5)
  - [x] Survives the dashboard's own later rendering (FR4 AC2)

### 4.7 W2 fix — survives the brief's hostile stylesheet — ✅ Passed
- **User story / acceptance criterion**: W2 defensive-styling rewrite (`important` on display, visibility, opacity, max-height, overflow, float)
- **Preconditions**: freshly loaded hosted page; stylesheet injected into `<head>` after the shim ran, under the page's own `style-src 'unsafe-inline'`.

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Inject `.maister-lens-back { display:none!important; visibility:hidden!important; opacity:0!important; max-height:0!important; overflow:hidden!important }` | all five resisted | `block` / `visible` / `1` / `none` / `visible` | ✅ |
| 2 | `checkVisibility()` and layout box | still visible, non-zero box | `true`; 81.25×18.19 at (12,10) | ✅ |
| 3 | Hit-test the box centre | the button is the topmost element | `hitTestIsButton: true` | ✅ |
| 4 | Click it | one `openDashboard`, zero `navigate` | `1` / `0` | ✅ |

- **Issues observed**: _None observed for this stylesheet._ The scenario the fix was written against passes cleanly. See 4.8 for the broader probe.
- **Evidence**: `screenshots/04-hosted-survives-brief-hostile-css.png`
- **Acceptance criteria checklist**:
  - [x] Six defended properties all win against page `!important`
  - [x] Link remains clickable, not merely present

### 4.8 W2 fix — survives *broader* hostile page CSS — ❌ Failed
- **User story / acceptance criterion**: the fix's general claim that the link resists arbitrary task-author CSS (spec Open Questions: "The injected link must self-style inline and resist inheritance")
- **Preconditions**: freshly loaded hosted page; each rule injected in isolation, measured, then removed.

Per-vector results (`clickable` = hit-test at the button's box centre returns the button):

| # | Injected rule | Box (w×h) | Clickable | Status |
|---|---|---|---|---|
| 0 | *(baseline, no hostile CSS)* | 81×18 | true | ✅ |
| 1 | `pointer-events: none !important` | 81×18 | **false** | ❌ |
| 2 | `position:absolute!important; left:-9999px!important` | 81×18 at x=-9987 | **false** | ❌ |
| 3 | `button { font-size: 0 !important }` | **0×0** | **false** | ❌ |
| 4 | `button { color: transparent !important }` | 81×18 | true (invisible text) | ⚠️ |
| 5 | `clip-path: inset(100%) !important` | 81×18 | **false** | ❌ |
| 6 | `transform: scale(0) !important` | **0×0** | **false** | ❌ |
| 7 | `content-visibility: hidden !important` | 81×18 | **false** (`checkVisibility(): false`) | ❌ |
| 8 | `width:0!important; height:0!important; padding:0!important; overflow:hidden!important` | **0×0** | **false** | ❌ |
| 9 | Full-page `body::before` overlay at `z-index:2147483647` | 81×18 | **false** (covered) | ❌ |

Combined stylesheet (all of the above plus the brief's five) reproduced the same outcome end to end: the six defended properties held (`display:block`, `visibility:visible`, `opacity:1`, `max-height:none`, `overflow:visible`, `float:none`) yet the element collapsed to a 0×0 box at x=-9987 with `pointer-events:none`, and a real Playwright click timed out with *"element is not visible"* after 5s of retries.

- **Issues observed**: §5.2 (Major), §5.3.1 and §5.3.2 (Minor).
- **Evidence**: `screenshots/03-hosted-after-hostile-css.png` (page after the combined injection — the link is gone from the rendered output), contrasted with `screenshots/04-hosted-survives-brief-hostile-css.png`
- **Acceptance criteria checklist**:
  - [x] The six explicitly defended properties resist `!important`
  - [ ] The link survives arbitrary hostile page CSS
  - [ ] The link remains clickable under arbitrary hostile page CSS

### 4.9 FR1 — sidebar "Overview" tree view — ⚠️ Not verifiable by this method
- **User story / acceptance criterion**: FR1 (all), FR2 (sidebar titles)
- **Preconditions**: none — scenario not executed.

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Inspect the Maister Lens sidebar tree | "Overview" → "Dashboard" row above "Now" and "Tasks" | Not executed — the view is VS Code chrome, outside any web page's DOM | ⚠️ |

- **Issues observed**: Stated honestly as out of reach rather than guessed or marked failed. A `tree` view is rendered by the VS Code shell, not by a webview, so no browser — Playwright MCP or otherwise — can reach it. Verifying FR1 requires the `@vscode/test-electron` route (`npm run test:integration`) or manual inspection in a real VS Code window.
- **Evidence**: _None — scenario not executed._
- **Acceptance criteria checklist**: _Not assessed by this method._

## 5. Discrepancies

### 5.1 Critical
_None observed._

### 5.2 Major
- **Spec requirement**: spec Open Questions/Risks — "The injected link must self-style inline and resist inheritance"; the W2 fix's stated claim that visibility-critical properties are set with `important` so the link survives hostile page CSS.
- **Expected**: The hosted back link remains visible and clickable regardless of what CSS the task-authored `dashboard.html` carries.
- **Actual**: 8 of 9 independently probed hostile vectors neutralise the link (4.8). The defended set covers only `display`, `visibility`, `opacity`, `max-height`, `overflow`, `float`. Everything that collapses the box (`width`, `height`, `font-size`, `transform`, `clip-path`), disables hit-testing (`pointer-events`), removes it from rendering (`content-visibility`), moves it off-screen (`position`/`left`) or covers it (a stacked overlay) still wins.
- **Evidence**: `screenshots/03-hosted-after-hostile-css.png`; the per-vector table in §4.8; Playwright's own click failure — *"element is not visible"* after 5s.
- **Root cause hypothesis**: `BUTTON_STYLE`/`NAV_STYLE` in `src/webview/shim.ts` mark exactly six properties `CRITICAL`. The property set was chosen to match the properties named in the W2 review note, not derived from the set of properties that can actually suppress an element. Notably `['width','auto']` and `['height','auto']` sit at *normal* priority in `NAV_STYLE` right next to `overflow` at `important` — so `width:0!important` from the page wins while `overflow:hidden!important` loses.
- **User impact**: Low in practice, high in principle. Maister's own committed `dashboard.html` contains no such rules, so the shipped experience is fine (4.5–4.7 all pass against the real fixture). The exposure is a task-authored dashboard whose CSS happens to collide — that user loses their only way back, since the link is the sole navigation affordance on the hosted page.
- **Recommended fix**: Promote the remaining box- and interaction-critical properties to `important` — at minimum `width`, `height`, `min-width`, `min-height`, `font-size`, `pointer-events`, `transform`, `clip-path`, `content-visibility`, and `position` (pin it to `static` or `relative`). For overlay resistance, give the nav `position:relative!important` plus a high `z-index!important` — a `z-index` only takes effect once the element is positioned.
- **Workaround**: The user can reopen the dashboard from the sidebar "Overview" → "Dashboard" row (FR1) or the command palette; the back link is a convenience, not the only route to the dashboard at the extension level.

### 5.3 Minor
**5.3.1 — Inconsistent priority within `NAV_STYLE`**
- **Spec requirement**: W2 fix intent — visibility-critical properties set with `important` priority.
- **Expected**: Properties that jointly decide whether the element occupies space share one priority.
- **Actual**: `overflow` and `max-height` are `important` while `width` and `height` — the properties that actually zero the box — are normal priority.
- **Evidence**: `src/webview/shim.ts` `NAV_STYLE`; §4.8 vector 8 (`width:0!important` → 0×0 box).
- **Root cause hypothesis**: The `important` set was copied from the review note's property list rather than reasoned from box-model semantics.
- **User impact**: None on the shipped fixture; it makes the defence look stronger than it is.
- **Recommended fix**: Move `width`/`height` to `CRITICAL` alongside the other box properties (folded into 5.2's fix).
- **Workaround**: _None needed._

**5.3.2 — Nothing replaced the removed `z-index`**
- **Spec requirement**: FR4 AC4 lists `z-index` among the properties the element should pin.
- **Expected**: Either a working stacking defence, or an explicit decision that overlays are out of scope.
- **Actual**: The W2 fix removed the `z-index` as inert and added no replacement; a full-page `body::before` overlay covers the link (§4.8 vector 9).
- **Evidence**: `src/webview/shim.ts` `NAV_STYLE` (no `z-index`); §4.8 vector 9, `hitTestIsButton: false`.
- **Root cause hypothesis**: The removal itself was *correct* — `z-index` is inert on a `position:static` element, so the old declaration genuinely did nothing. The gap is that the underlying exposure was never addressed, only the dead code removed.
- **User impact**: A task dashboard with a full-bleed fixed overlay (a modal backdrop, a splash layer) would swallow clicks on the back link.
- **Recommended fix**: If overlay resistance is wanted, add `position:relative!important` *and* `z-index:<high>!important` together. If not, record it as accepted risk in the spec's Open Questions so the next reader does not re-litigate it.
- **Workaround**: Same as 5.2.

### 5.4 Cosmetic
_None observed._

## 6. Console & Network Errors
| Source (file:line) | Message | Frequency | Severity | Impact |
|---|---|---|---|---|
| `http://127.0.0.1:8899/favicon.ico` | Failed to load resource: 404 | 1 (native surface) | Cosmetic | None — artifact of my static file server; no favicon exists in a VS Code webview |
| *(none)* — hosted page | 0 errors, 0 warnings across load, click, keyboard and refresh | — | — | — |

The two `[VERBOSE] Rendering was performed in a subtree hidden by content-visibility` entries on the hosted page were produced by my own §4.8 probe, not by the implementation.

## 7. Spec Alignment
- **Fully implemented**:
  - FR3 AC1–AC6 — native back link: structure, `post` wiring, first-node position, unconditional render, zero inline styles, `button` with accessible name and no positive tabindex.
  - FR4 AC1–AC5 — hosted back link: `<nav aria-label>` + `<button type=button>`, first child of `body`, posts `{type:'openDashboard'}` through the existing handle, distinctive class + style set as properties, `stopPropagation()` suppressing `navigate`.
  - FR5 — `FALLBACK.breadcrumb` (`← Dashboard`) and `FALLBACK.breadcrumbLabel` (`Breadcrumb`) render identically in both surfaces, confirming the shared source.
  - Accessibility Requirements — both links are `<button>` inside a labelled `<nav>`, first in tab order, zero positive tabindex in either surface, keyboard-operable via Enter.
- **Partially implemented**:
  - The spec's hosted-link resilience intent ("resist inheritance", FR4 AC4's list of pinned properties including `position` and `z-index`) — six of the needed properties are pinned; `position` is not pinned and `z-index` is absent (§5.2, §5.3.2).
- **Not implemented**: _None found by this method._
- **Extra (unspecified) behavior**: The hosted link survives a `refresh`-triggered re-render of the dashboard (§4.6 step 5). This exceeds FR4 AC2's literal wording and is a genuine strength of attaching to `body` rather than an author container.

## 8. Variances from Plan
- **No `base_url`, no dev server.** The task is a VS Code extension. I rebuilt the `test/dom/harness.ts` page-generation path by hand and served it over `http://127.0.0.1:8899` because the Playwright MCP browser refuses the `file:` protocol that the real harness uses. The hosted page's CSP `cspSource` and `<base href>` were set to that HTTP origin instead of `file:`, and the harness's `acquireVsCodeApi` stub — normally injected via `page.addInitScript`, which MCP does not expose — was inlined into `<head>` with the page's own nonce so the CSP admits it. Everything downstream (the shim, the three insertions, `dashboard-data.js`) is the unmodified real asset.
- **FR1 and FR2's sidebar halves were not executed** (§4.9) — unreachable from a browser by construction.
- **Colour contrast was not assessed.** `--vscode-textLink-foreground` is undefined outside VS Code, so the native link computed to `rgb(0,0,0)`. The hosted link picked up its literal fallback `#3794ff` correctly, which does at least confirm the fallback works.
- **Corroboration run**: `npm run test:dom` — 19 passed, including `surfaces.spec.ts:258` ("the fallbackTask back link is the first focusable control, and the surface inventory is still five") and `shim.spec.ts:84`/`:100`. No existing test asserts hostile-CSS survival, which is why §4.8 was worth running.

## 9. Evaluation Against Exit Criteria
| Criterion (from spec) | Status | Evidence |
|---|---|---|
| SC1 — Sidebar shows "Overview" (Dashboard row), "Now", "Tasks"; clicking opens the dashboard | ⚠️ | Not verifiable by browser (§4.9); requires integration/manual VS Code check |
| SC2 — No two sidebar sections share a title | ⚠️ | Manifest-level; not verifiable by this method |
| SC3 — Every task view, native and hosted, shows "← Dashboard" first and as first tab stop; activating it opens the dashboard | ✅ | §4.1–4.3 (native), §4.5–4.6 (hosted); `isFirstFocusable: true` in both; exactly one `openDashboard` per activation |
| SC4 — Zero lines changed in `hostDashboard.ts`, `messages.ts`, `panel.ts:1342` | ✅ | `git status` lists neither `hostDashboard.ts` nor `messages.ts` as modified |
| SC5 — `npm test`, `test:integration`, `test:dom` pass; five surfaces; nine palette commands | ⚠️ | `npm run test:dom` 19 passed and the five-surface assertion holds; `npm test` and `test:integration` not run by this agent |
| SC6 — No inline `style` attribute in any native-panel bundle | ✅ | §4.4 — `document.querySelectorAll('[style]').length === 0` |

## 10. Recommendations
- **Must fix before merge**: None. No Critical finding; §5.2 does not break the shipped experience against Maister's own dashboard.
- **Should fix soon**: §5.2 — widen the `important` property set (`width`, `height`, `font-size`, `pointer-events`, `transform`, `clip-path`, `content-visibility`, `position`), which subsumes §5.3.1. Add a DOM test that injects hostile CSS and asserts the link is still hit-testable — no current test covers this, which is precisely how the gap survived the W2 rewrite.
- **Nice-to-have**: §5.3.2 — decide explicitly between an overlay defence (`position:relative!important` + `z-index!important`) and recording overlays as accepted risk in the spec.

## 11. Artifacts
- **Screenshots**: `verification/screenshots/` (4 files)
- **Visual-fidelity report**: _Not generated (no design_context_path)._
- **Console log dump**: inline in §6

## 12. Conclusion
**GO WITH CAVEATS.** Both back links do exactly what FR3 and FR4 require — correct structure, first position, first tab stop, accessible names, keyboard operation, and precisely one `openDashboard` message with zero `navigate` leakage — verified live rather than inferred, and the W2 fix genuinely defeats the hostile stylesheet it was written against. The caveat is that its defence is narrower than its claim: eight further hostile-CSS vectors still neutralise the hosted link, and no test guards against any of them. Recommend merge, with §5.2 tracked as a fast follow-up plus a regression test that injects hostile CSS — and FR1's sidebar view confirmed separately through the integration harness or a manual VS Code window, since no browser can reach it.
