# Code Review Report — dashboard-nav-buttons

**Date**: 2026-09-23T17:16:00Z
**Path**: `/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin` (task change set)
**Scope**: all (quality / security / performance / best practices)
**Status**: ⚠️ Issues Found (no critical)

## TL;DR
Small, disciplined change set, clean on every security invariant the task flagged. All four hard invariants verified true: `hostDashboard.ts` and `messages.ts` both have a literal zero-line diff; no new message type (reuses the allowlisted `openDashboard`, validated at `src/panel/messages.ts:299`); the native breadcrumb carries no inline `style` attribute, respecting the `style-src` CSP at `src/panel/panel.ts:1305`; no second `acquireVsCodeApi()` handle. `NavTreeProvider`'s lack of `dispose()` is genuinely safe, not merely plan-compliant.
0 critical, 3 warnings, 7 info.

## Key Decisions (validated)
- **Reuse of `openDashboard` over a new message type** — correct. Keeps `messages.ts` untouched, adds no validation surface. The message is parameterless, so a forged post from page script grants nothing.
- **`element.style` in the shim vs `class` in the native fallback** — correct and correctly asymmetric. `hostDashboard.ts:93` permits `style-src 'unsafe-inline'`; `panel.ts:1305` does not. Each file uses the mechanism its own CSP allows.
- **`NavTreeProvider` with no `dispose()`** — safe. No `EventEmitter`, no `onDidChangeTreeData`, no index subscription, no captured disposables; `getChildren`/`getTreeItem` are pure over a frozen module constant. `registerNavTree()` (`src/views/navTree.ts:42-44`) disposes the `TreeView`, the only object VS Code retains, and `src/extension.ts:33` pushes it onto `context.subscriptions`.

## Open Questions / Risks
- Does any shipped Maister `dashboard.html` re-render `document.body` wholesale after `dashboard-data.js` loads? If so the back link disappears silently at runtime (W1). The DOM test passes against a harness page that only appends.
- Two sidebar views now read as "Overview" (tree) and "Tasks" (webview). Confirm this is the intended final naming — the tree named "Overview" contains a single "Dashboard" row.

---

## Critical Issues
None.

---

## Warnings

### W1 — The injected back link is not re-asserted; a body re-render silently removes it
**Location**: `src/webview/shim.ts:191-203` (`injectBackLink`) · **Category**: quality / robustness · **Fixable**: no (design decision)

`injectBackLink()` runs exactly once — immediately or on `DOMContentLoaded` — then never again. The hosted `dashboard.html` is task-authored and loads data asynchronously via `dashboard-data.js`; a dashboard that renders with `document.body.innerHTML = …`, `body.replaceChildren(…)` or a framework mount will destroy the host-owned nav with no trace and no error. The FR4 DOM test (`test/dom/shim.spec.ts:55`) only covers a harness page that appends, so this failure mode is untested.

Functional/availability issue, not security — the removed node cannot be replaced by anything reaching the host, because page script has no `acquireVsCodeApi()` handle and any injected `<a>` routes through the `navigate` validator.

**Fix**: attach a narrow `MutationObserver` on `document.body` `childList` that re-prepends the nav when `document.querySelector('nav.maister-lens-back')` is gone, disconnecting after N re-assertions to bound cost; or accept the gap and record it as a known limitation.

### W2 — The defensive style set is both excessive and insufficient
**Location**: `src/webview/shim.ts:142-188` (`backLink`), ~30 `setProperty` calls · **Category**: quality / security hygiene · **Fixable**: yes

1. **`z-index: 2147483647` (line 186) is inert.** Line 170 sets `position: 'static'` on the same node, and `z-index` has no effect on a non-positioned, non-flex/grid-item box. It reads as hardening but does nothing — a magic number with no effect, which `global/minimal-implementation.md` ("no speculative abstractions") and `global/coding-style.md` ("no dead code") rule out.
2. **Inline styles do not actually win.** A page stylesheet with `.maister-lens-back { display: none !important }` overrides every declaration, since none uses `!important`. The 30-property block does not deliver the guarantee it is written to deliver.

**Fix**: cut to the properties carrying real intent (`display`, `margin`, `padding`, `color`, `background`, `border`, `font`, `cursor`); if override-resistance is genuinely required, pass the priority flag — `nav.style.setProperty('display', 'block', 'important')` — on visibility-critical properties only. Delete the `z-index` line, or set `position: relative` if stacking is intended. Hoist the property list to a module-level table applied in a loop.

### W3 — `renderFallback()` mutates process-wide globals and depends on ESM import caching
**Location**: `test/integration/fallbackTask.test.ts:212-236` · **Category**: best practices / test soundness · **Fixable**: yes

`renderFallback()` assigns `globalThis.document`, `globalThis.window` and `globalThis.acquireVsCodeApi`, then `await import('../../src/webview/fallbackTask.ts')`. Coupled fragilities:

- `fallbackTask.ts` calls `acquireVsCodeApi()` at **module scope** (line 73). The stub must exist before the first import anywhere in the mocha process. If another suite in the shared integration run imports that module first — directly or transitively — the module throws `acquireVsCodeApi is not defined` at load and this suite fails for an unrelated reason. `test/integration/index.ts` runs all suites in one process, so this is an ordering hazard, not a theoretical one.
- ESM imports are cached, so later `renderFallback()` calls reuse the instance captured against the *first* stub set. The test only passes because `postedMessages` is a shared module-scope array. That coupling is invisible and breaks the moment someone makes the stub per-call.
- `globalThis.window = { addEventListener: … }` defines `window` for the whole Node process until `after()` runs. Any library feature-detecting `typeof window !== 'undefined'` in that window takes its browser branch.

**Fix**: do the stub assignment once in a `before()` hook that runs before any import of the bundle, and load the module once into a suite-scoped binding. Add `assert.equal(typeof globalThis.acquireVsCodeApi, 'function')` at the top of the suite so a failure names the real cause.

---

## Informational

### I1 — `StubNode` is sound for what it covers, but omits properties production code doesn't currently use
**Location**: `test/integration/fallbackTask.test.ts:100-158` · **Fixable**: yes

Well-built for its scope: `append` correctly flattens `#fragment` nodes, matching `DocumentFragment` semantics, and `el()` (`src/webview/components.ts:10-26`) only ever calls `createElement`, `setAttribute` and `append`, all modelled faithfully. The assertions it enables (tag, `aria-label`, `class`, `type`, `textContent`, click→post) are real.

**What it could mask**: no `className`, `style`, `id`, `insertBefore`/`firstChild`, no node re-parenting (a node appended twice appears twice rather than moves), and `getElementById` always returns `null`. So it cannot catch a regression where the breadcrumb acquires an inline `style` attribute — precisely the CSP violation the native panel must never commit. That risk is covered instead by the Playwright surface test, so the gap is closed in aggregate.

**Suggestion**: add `assert.equal(crumb.getAttribute('style'), null)` to pin the CSP-critical property at this level too.

### I2 — `registerNavTree()` returns two fields nobody consumes
**Location**: `src/views/navTree.ts:29-46`; consumer at `src/extension.ts:26` · **Fixable**: yes

`extension.ts` uses only `dispose`, via `context.subscriptions.push(nav)`. `provider` and `view` are returned but never read, and `NAV_VIEW_ID` (line 4) is exported but referenced nowhere outside the module (`global/minimal-implementation.md`: unused code is debt). Mitigating: `registerNowTree` establishes this shape, and matching a sibling has real value.

**Fix**: `export function registerNavTree(): vscode.Disposable` returning `{ dispose: () => view.dispose() }`, and drop the `NAV_VIEW_ID` export unless a test consumes it — or keep the parallel deliberately and say so.

### I3 — The injected button's click handler does not check `event.isTrusted`
**Location**: `src/webview/shim.ts:164-167` · **Fixable**: no (recommended as-is)

Script on the re-hosted page can call `.click()` on `nav.maister-lens-back button` and cause an `openDashboard` post. Impact is nil — the message is parameterless, already allowlisted, and the worst outcome is an unexpected dashboard panel. Hygiene, not a vulnerability. The DOM test at `test/dom/shim.spec.ts:87` relies on synthetic clicks, so adding the guard would require reworking that test.

**Suggestion**: leave as is; record the reasoning so a future reader doesn't mistake it for an oversight.

### I4 — `stopPropagation()` cannot affect the document capture listener that already ran
**Location**: `src/webview/shim.ts:165` · **Fixable**: yes

`interceptLink` is registered with `capture: true` on `document` (`shim.ts:132-133`), so it fires *before* the button's bubble-phase listener. The `stopPropagation()` on line 165 cannot prevent `interceptLink` from running. Harmless today because the injected node is a `<button>`, not an `<a href>`, so `closest('a[href]')` returns null and `interceptLink` bails — but the call does not do what it reads as doing.

**Suggestion**: drop the line, or keep it with a one-line comment stating it guards against the page wrapping the nav in its own click handler — not against `interceptLink`.

### I5 — The shim imports `FALLBACK`, a semantic mismatch
**Location**: `src/webview/shim.ts:9` · **Fixable**: yes

The shim is not the fallback surface; borrowing `FALLBACK.breadcrumb`/`breadcrumbLabel` couples hosted-dashboard chrome to a string group named for a different surface. `test/unit/strings.test.ts` already asserts `FALLBACK.breadcrumb === RISKS.breadcrumb`, so three surfaces now share one literal under two unrelated names.

**Fix**: introduce a shared `BREADCRUMB = { back: '← Dashboard', label: 'Breadcrumb' }` group in `src/strings.ts`; have `FALLBACK`, `RISKS` and the shim reference it, replacing the equality assertions with a single source of truth (DRY).

### I6 — `manifest.test.ts` pins a bare command count
**Location**: `test/unit/manifest.test.ts:159` · **Fixable**: yes

`assert.equal(declared.filter(…).length, 9)` is a magic number that fails on any unrelated command addition with a message that doesn't explain what changed. The adjacent prefix assertion is the real check.

**Fix**: drop it, or name it: `const EXPECTED_VISIBLE_COMMANDS = 9;`.

### I7 — Sidebar naming reads as a swap, not a hierarchy
**Location**: `package.json:48-51` and `package.json:60` · **Fixable**: no (operator copy decision)

`maister.nav` is titled "Overview" and contains one row, "Dashboard"; `maister.overview` is retitled "Tasks". A user reading the sidebar sees "Overview" as a one-item tree and "Tasks" as the rich view. The manifest test (`test/unit/manifest.test.ts:135-143`) pins exactly this, so it is deliberate — flagged so the operator confirms it is the final copy.

---

## Metrics

| Metric | Value |
|---|---|
| Files changed | 13 modified + 3 new; ~367 insertions, 20 deletions |
| Longest new function | `backLink()` — 47 lines, straight-line style assignment, no branching |
| Max nesting depth in new code | 2 |
| New public message types | **0** (reuses allowlisted `openDashboard`) |
| `acquireVsCodeApi()` handles added | **0** |
| Inline `style` attributes on CSP-restricted surfaces | **0** |
| Zero-diff invariants held | **2 / 2** (`hostDashboard.ts`, `messages.ts`) |
| Disposal leaks identified | **0** |
| Per-render / per-message work added | none — `injectBackLink()` runs once per page load; the native breadcrumb adds two nodes to a one-shot `render()` |

---

## Prioritized Recommendations

1. **W1** — Decide on shim back-link re-assertion (MutationObserver, or document the limitation). The only finding with a real runtime failure mode.
2. **W3** — Move global stubbing into a `before()` hook so the suite cannot fail on import ordering within the shared mocha process.
3. **W2** — Delete the inert `z-index`, trim the style block, add `'important'` priority to visibility-critical properties if override-resistance is actually required.
4. **I1** — Add the one-line `style`-attribute assertion to the `StubNode` breadcrumb test.
5. **I5 / I2 / I6** — Housekeeping: shared `BREADCRUMB` strings, narrow `registerNavTree`'s return type, drop the magic command count.

---

**Out of scope, not reported**: the pre-existing `ViewColumn.Beside` → `Active` change at `src/panel/panel.ts:1342` (confirmed the only hunk in `panel.ts`).

**Read-only**: no files were modified by this review.
