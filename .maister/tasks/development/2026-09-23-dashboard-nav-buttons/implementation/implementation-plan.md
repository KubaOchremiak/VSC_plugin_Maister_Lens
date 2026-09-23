# Implementation Plan: Dashboard Navigation Affordances

## TL;DR
Five task groups, 38 steps, ~20 new tests. Group 1 (strings) is the only true prerequisite; Groups 2, 3 and 4 — sidebar nav view, native back link, hosted back link — then run fully in parallel with zero file overlap. Group 5 closes the audit gaps (rename assertion, docs note) and runs the three suites end to end. All host plumbing already exists: no new command, message type, bundle or CSP surface.

## Key Decisions
- Strings are extracted into their own first group — `src/strings.ts` is the single file three downstream groups all touch, so isolating it removes the only write contention and lets 2/3/4 run concurrently.
- The nav-provider test lives at `test/integration/navTree.test.ts`, not `test/unit/` — `TreeDataProvider`/`ThemeIcon`/`createTreeView` need the live `vscode` module (audit W3).
- Registration in `test/integration/index.ts` `SUITES.trusted` is its own numbered step with a *proof-of-execution* sub-step — the suite list is hard-coded by name and an unregistered file passes green with zero coverage (audit W3).
- FR2's rename gets a real cross-check assertion (manifest view name === `OVERVIEW.title`), because nothing in the repo asserts the literal today (audit W2).
- `stopPropagation()` on the hosted button is kept as plain defence-in-depth only. The spec's rationale is false: `interceptLink` bails unless `event.target.closest('a[href]')` resolves (`src/webview/shim.ts:118-121`), and the injected element is a `<button>` directly under `document.body`. No code comment may repeat the false rationale.
- No acceptance criterion asserts runtime sidebar order. `contributes.views` order governs first-install layout only; VS Code persists each user's arrangement (audit W4). Manifest order is asserted; runtime order is documented as a limitation instead.

## Open Questions / Risks
- Existing users will not see the new "Overview" view first after update. Mitigation is documentation only — README notes the limitation and points at the **Views: Reset View Locations** command. Do not attempt to force placement programmatically.
- FR4's visual result inside arbitrary task-authored `dashboard.html` is untestable — no harness re-hosts a third-party dashboard. The defensive inline styling is the only mitigation.
- `test/dom/surfaces.spec.ts` runs a blanket a11y loop plus a `tabOrder` check over the first six controls. Prepending a control to `fallbackTask` shifts that surface's control indices; Group 3 must re-run `npm run test:dom` and confirm the existing loop still passes before Group 5 starts.
- `src/strings.ts` is touched by Group 1 only; if any later group needs a new key, it must be added in Group 1's step list rather than opportunistically, or the parallelism guarantee breaks.

## Overview
Total Steps: 38
Task Groups: 5
Expected Tests: 18-24 new (Group 1: 3, Group 2: 6, Group 3: 4, Group 4: 3, Group 5: up to 6 additional)

## Parallelism

| Wave | Groups | Note |
|---|---|---|
| 1 | Group 1 | Sole prerequisite; touches `src/strings.ts` and `test/unit/strings.test.ts` only |
| 2 | Group 2, Group 3, Group 4 | Fully parallel — disjoint file sets, all depend only on Group 1 |
| 3 | Group 5 | Review/gap group; depends on all of 2, 3, 4 |

## Implementation Steps

### Task Group 1: Strings Foundation
**Dependencies:** None
**Files to Modify:** `src/strings.ts`, `test/unit/strings.test.ts`
**Estimated Steps:** 7

- [x] 1.0 Land every user-facing string the feature needs, in one file, before any consumer is written
  - [x] 1.1 Write 3 focused tests in `test/unit/strings.test.ts`
    - `OVERVIEW.title` equals `'Tasks'`
    - `FALLBACK.breadcrumb` equals `'← Dashboard'` and `FALLBACK.breadcrumbLabel` equals `'Breadcrumb'` (identical values to `RISKS.breadcrumb`/`breadcrumbLabel` at `src/strings.ts:329-330`)
    - The new nav block exports a non-empty row label and a non-empty accessible label
    - Do NOT add a fourth test for forbidden wording — the file's existing `running|waiting|stalled|abandoned` scan already covers every export automatically
  - [x] 1.2 Change `OVERVIEW.title` at `src/strings.ts:138` from `'Overview'` to `'Tasks'`
    - Key name, view id `maister.overview`, provider and `view/title` menu entries are unchanged
    - Both consumers (`src/views/overviewView.ts:535,538`) and `test/dom/harness.ts:56` pick the value up with no code change
  - [x] 1.3 Add `breadcrumb: '← Dashboard'` and `breadcrumbLabel: 'Breadcrumb'` at the TOP of the `FALLBACK` block (`src/strings.ts:226-258`)
    - Top placement matches the block's render-order convention, since the breadcrumb renders first
    - Mirror: `RISKS` block, `src/strings.ts:329-330`
  - [x] 1.4 Add a small `NAV` block exporting the sidebar row label (`'Dashboard'`) and its accessible label
    - One block per surface is the file convention; follow the `NOW` / `OVERVIEW` block shape
    - No inline literal may later appear in `src/views/navTree.ts`
  - [x] 1.5 Verify no new string contains `running|waiting|stalled|abandoned`
  - [x] 1.6 Run `npm run lint`
  - [x] 1.7 Run ONLY the strings tests: `npx mocha test/unit/strings.test.ts`
    - Do NOT run the full suite here

**Acceptance Criteria:**
- The 3 new tests pass and the existing forbidden-wording scan still passes
- `OVERVIEW.title === 'Tasks'`; the key name and view id are untouched
- `FALLBACK.breadcrumb` / `breadcrumbLabel` exist at the top of the `FALLBACK` block
- A `NAV` block supplies the sidebar row label and accessible label
- `src/strings.ts` still has ZERO imports (required for Group 4's bundle-safe import)
- No file other than `src/strings.ts` and `test/unit/strings.test.ts` is touched

---

### Task Group 2: Sidebar Nav View (manifest + provider + registration + its test)
**Dependencies:** Group 1
**Files to Modify:** `package.json`, `src/views/navTree.ts` (new), `src/extension.ts`, `test/integration/navTree.test.ts` (new), `test/integration/index.ts`, `test/unit/manifest.test.ts`
**Estimated Steps:** 11

- [x] 2.0 Contribute a first-position `tree` view whose single row opens the dashboard
  - [x] 2.1 Write 6 focused tests
    - In `test/integration/navTree.test.ts` (new, mirroring `test/integration/nowTree.test.ts`), 4 tests:
      1. `getChildren()` with no argument returns exactly one node
      2. `getTreeItem(root)` has `label` from the `NAV` strings block, `iconPath instanceof vscode.ThemeIcon` with id `dashboard`, and `collapsibleState === vscode.TreeItemCollapsibleState.None`
      3. `getTreeItem(root).command.command === 'maister.openDashboard'`, and `accessibilityInformation.label` is a non-empty string
      4. `getChildren(root)` returns `[]` for the root and for any non-root argument
    - In `test/unit/manifest.test.ts`, 2 tests:
      5. `contributes.views.maister` has exactly three entries in manifest order: the nav view (`type: 'tree'`, `name: 'Overview'`), then `maister.now`, then `maister.overview`
      6. `PALETTE_VISIBLE_COMMANDS` is still nine and no new command was declared
    - Assert MANIFEST order only. Do NOT assert runtime sidebar order — `contributes.views` governs first-install layout only (audit W4)
  - [x] 2.2 Register `'navTree'` in `SUITES.trusted` in `test/integration/index.ts:6-18`
    - The array enumerates suite members by HARD-CODED NAME; an unregistered file never loads and the suite passes green with zero FR1 coverage (audit W3)
    - Insert it adjacent to `'nowTree'` to keep the list readable
  - [x] 2.3 PROVE the new test actually executes
    - Record the reported test count from `npm run test:integration` before adding the file, then again after; the count MUST increase by 4
    - Alternatively, deliberately make one assertion in `navTree.test.ts` fail once, confirm the run goes red, then restore it
    - This step is not optional — it is the only defence against W3's silent-green failure mode
  - [x] 2.4 Create `src/views/navTree.ts`
    - Export a view id constant (e.g. `NAV_VIEW_ID = 'maister.nav'`), mirroring `NOW_VIEW_ID` at `src/views/nowTree.ts:8`
    - Export a stateless `TreeDataProvider<NavNode>` with one root node, no `TaskIndex` dependency, no state and no `onDidChangeTreeData` firing (the row never changes)
    - Item fields per FR1 AC3: label from the `NAV` strings block, `iconPath = new vscode.ThemeIcon('dashboard')`, `collapsibleState = None`, `accessibilityInformation.label`, `command = { command: 'maister.openDashboard', title: <NAV label> }`
    - Reuse: the existing `maister.openDashboard` command (declared `package.json:121-126`, registered `src/panel/panel.ts:1489-1491`, dispatched `src/panel/panel.ts:513`) — declare NO new command
    - Item shape reference: `taskItem()` at `src/views/nowTree.ts:258`
  - [x] 2.5 Export a `registerNavTree()` factory returning `{ provider, view, dispose() }`
    - Mirror `registerNowTree()` at `src/views/nowTree.ts:402-425`, minus the badge and the index subscription
    - `dispose()` disposes the view and the provider
  - [x] 2.6 Add the manifest view entry in `package.json` `contributes.views.maister`, FIRST, above `maister.now`
    - `{ "id": "maister.nav", "name": "Overview", "type": "tree" }`
    - No `viewsWelcome` entry — the view is never empty
    - No `when` clause and no trust gate — `maister.openDashboard` is not trust-gated (`src/panel/messages.ts:81`)
  - [x] 2.7 Retitle `maister.overview` in the same `contributes.views.maister` block to `"name": "Tasks"`
    - View id, provider, and the `view/title` menu entries stay exactly as they are
    - `test/unit/manifest.test.ts:106,110,115` assert `maister.startWorkflow@navigation@1`, `maister.refresh@navigation@2` and `maister.openRisks@navigation@2`; none of them are affected. There is NO existing `openDashboard` navigation@1 assertion — do not assume one
  - [x] 2.8 Register the view in `src/extension.ts`
    - Import `registerNavTree` alongside `registerNowTree` (`src/extension.ts:7`)
    - Call it beside `const now = registerNowTree(index)` (`:25`) and push the disposable into `context.subscriptions` (`:28-36`)
    - Activation is unchanged — the view joins an existing container, so existing `activationEvents` suffice
  - [x] 2.9 Run `npm run lint` and the build (`npm run build` + `tsc -p tsconfig.json`)
    - Confirm `esbuild.mjs` produces NO new bundle — `src/views/*` is extension-host code, not a webview entry
  - [x] 2.10 Ensure Group 2 tests pass
    - `npm run test:integration` (confirms the navTree suite loads and the 4 tests run)
    - `npx mocha test/unit/manifest.test.ts`
    - Do NOT run `npm run test:dom` here — no DOM surface changed

**Acceptance Criteria:**
- The 6 tests pass, and step 2.3's proof shows the integration test count increased by 4
- `'navTree'` appears in `SUITES.trusted` in `test/integration/index.ts`
- `contributes.views.maister` lists three entries, nav first
- `maister.overview` is named `"Tasks"` in the manifest
- Zero new commands; `PALETTE_VISIBLE_COMMANDS` still nine; no new esbuild bundle
- No inline user-facing literal in `src/views/navTree.ts`
- NO acceptance criterion asserts runtime sidebar order

---

### Task Group 3: Native Task Back Link
**Dependencies:** Group 1
**Files to Modify:** `src/webview/fallbackTask.ts`, `test/integration/fallbackTask.test.ts`
**Estimated Steps:** 7

- [x] 3.0 Prepend an unconditional "← Dashboard" breadcrumb to the native task renderer
  - [x] 3.1 Write 4 focused tests in `test/integration/fallbackTask.test.ts`
    1. The first node appended by `render()` is a `<nav>` whose `aria-label` is `FALLBACK.breadcrumbLabel`
    2. That `<nav>` contains a `<button type="button" class="link">` whose text is `FALLBACK.breadcrumb`
    3. Clicking the button posts exactly `{ type: 'openDashboard' }`
    4. The breadcrumb renders for a payload with no risks/decisions/artifacts — i.e. unconditionally, with no origin check
  - [x] 3.2 In `render()` (`src/webview/fallbackTask.ts:296-307`), build the crumb and append the `<nav>` BEFORE `fragment.append(banner(payload))`
    - Structure mirrors `src/webview/risksMode.ts:431-433` exactly:
      `const crumb = el('button', { class: 'link', type: 'button' }, [FALLBACK.breadcrumb]);`
      `crumb.addEventListener('click', () => post({ type: 'openDashboard' }));`
      `fragment.append(el('nav', { 'aria-label': FALLBACK.breadcrumbLabel }, [crumb]));`
    - Reuse: `el()` builder (`src/webview/components.ts:9-27`) — the only permitted builder, no `innerHTML` anywhere
    - Reuse: the file's existing local `post()` helper (`src/webview/fallbackTask.ts:75-77`) and its single `acquireVsCodeApi()` at `:73` — add NO second handle and NO sixth copy of the boilerplate
    - Reuse: the `{type:'openDashboard'}` message, already allowlisted and validated (`src/panel/messages.ts:59, 299-300, 363, 378`) — change nothing in `messages.ts`
  - [x] 3.3 Confirm NO inline `style` attribute is introduced
    - The native panel CSP omits `'unsafe-inline'` for styles (`src/panel/panel.ts:1305`)
    - Styling comes solely from the existing `.link` class (`media/webview.css:259-275`); add NO new CSS rule
  - [x] 3.4 Confirm the control is a `<button>`, not a heading
    - Do NOT copy the heading-as-button pattern in `risksSection()` (`src/webview/fallbackTask.ts:84-91`) — it is a known anti-pattern
    - Accessible name comes from text content; no `tabindex` attribute at all
  - [x] 3.5 Run `npm run lint` and `npm run build`
  - [x] 3.6 Run `npm run test:dom` and confirm `test/dom/surfaces.spec.ts` still passes unchanged
    - The surfaces array stays at FIVE (`test/dom/surfaces.spec.ts:189-195`)
    - The blanket a11y loop (`:199-212`) picks the new control up automatically: button tag, named, no positive tabindex
    - The `tabOrder` check over the first six controls must still pass with the breadcrumb now at index 0
  - [x] 3.7 Ensure Group 3 tests pass — `npm run test:integration` scoped to the fallbackTask suite
    - Do NOT run the entire suite

**Acceptance Criteria:**
- The 4 tests pass and `npm run test:dom` passes with the surfaces array still at five
- The `<nav>` is the first node in the fragment and therefore the first tab stop
- The link renders on every payload with no condition
- Zero inline `style` attributes; zero new CSS rules in `media/webview.css`
- No change to `src/panel/messages.ts`

---

### Task Group 4: Hosted Task Back Link (shim injection)
**Dependencies:** Group 1
**Files to Modify:** `src/webview/shim.ts`
**Estimated Steps:** 8

- [x] 4.0 Inject one host-owned back link at the top of the re-hosted `dashboard.html`
  - [x] 4.1 Write 3 focused tests
    - Place them where the shim is already exercised (the `a18-resolution` / `dashboardMode` integration path or a DOM-level harness — follow whichever already loads the shim bundle; do NOT create a sixth DOM surface)
    1. After injection, `document.body.firstElementChild` is a `<nav>` containing a `<button type="button">` whose text is `FALLBACK.breadcrumb`
    2. Clicking the button posts exactly `{ type: 'openDashboard' }` through the existing `vscodeApi` handle
    3. Injection is skipped without throwing when `document.body` is unavailable, and the rest of the shim (messaging, nonce adoption, link interception) still initialises
  - [x] 4.2 Add an `injectBackLink()` step to `src/webview/shim.ts`
    - Build with `document.createElement`; set text from `FALLBACK.breadcrumb` imported from `src/strings.ts`
    - `src/strings.ts` has zero imports and esbuild bundles `src/webview/*.ts` as tree-shaken IIFEs, so importing `FALLBACK` alone is bundle-safe — do NOT use the spec's "shim-local constant" escape hatch
    - `<nav aria-label={FALLBACK.breadcrumbLabel}>` wrapping `<button type="button">`
  - [x] 4.3 Insert as the FIRST CHILD of `document.body`
    - Guard on `document.readyState`; fall back to a `DOMContentLoaded` listener
    - Attach to `body`, never to an author container, so the dashboard's own later rendering does not clobber it
    - If `document.body` is unavailable, skip injection silently and let the rest of the shim run (graceful degradation per `standards/global/error-handling.md`)
  - [x] 4.4 Style defensively via `element.style` PROPERTIES, never a markup string
    - The hosted CSP permits `style-src 'unsafe-inline'` (`src/panel/hostDashboard.ts:93`) and the page does NOT load `media/webview.css`
    - Set every visual property the element depends on: display, position-in-flow, margin, padding, font, color, background, border, cursor, z-index, visibility — the page carries arbitrary task-author CSS that must not be able to hide or distort it
    - `color` uses a VS Code theme variable with a literal fallback, since hosted theme variables are not guaranteed
    - Also give it a distinctive class (e.g. `maister-lens-back`)
  - [x] 4.5 Attach the click handler directly to the button; reuse the existing `vscodeApi` handle (`src/webview/shim.ts:20`)
    - VS Code permits exactly ONE `acquireVsCodeApi()` per page — add no second call
    - `stopPropagation()` may be kept as plain defence-in-depth ONLY. Do NOT write a comment claiming it prevents `interceptLink` from firing: `interceptLink` bails at `src/webview/shim.ts:118-121` unless `event.target.closest('a[href]')` resolves, and a `<button>` directly under `document.body` has no anchor ancestor
  - [x] 4.6 Update the shim's header doc comment (`src/webview/shim.ts:1-6`)
    - The line "It is the only code the extension adds to that page" must now also state that the shim injects exactly one host-owned chrome element, the back link
    - This is the only comment added by the whole feature; no change-log comments (`standards/global/commenting.md`)
  - [x] 4.7 Verify `src/panel/hostDashboard.ts` has a ZERO-LINE DIFF
    - `git diff --stat src/panel/hostDashboard.ts` must be empty
    - Its "exactly three insertions, all security plumbing" contract (`:4-12`) is preserved verbatim
  - [x] 4.8 Run `npm run lint`, `npm run build`, then ONLY the Group 4 tests
    - Confirm the build still emits exactly five webview bundles

**Acceptance Criteria:**
- The 3 tests pass
- The back link is `document.body`'s first child, self-styled via `element.style` properties
- `git diff --stat src/panel/hostDashboard.ts` is empty
- Exactly one `acquireVsCodeApi()` call in the file; no new message type
- No comment in the codebase repeats the false `interceptLink` rationale
- The shim header comment describes the new injection responsibility
- Still five webview bundles

---

### Task Group 5: Test Review, Rename Coverage & Documentation
**Dependencies:** Groups 2, 3, 4
**Files to Modify:** `test/unit/manifest.test.ts`, `test/dom/surfaces.spec.ts`, `README.md`, `CHANGELOG.md`
**Estimated Steps:** 5

- [x] 5.0 Close the audit gaps and verify the whole feature end to end
  - [x] 5.1 Review the 13 tests written by Groups 1-4 and analyse gaps for THIS feature only
  - [x] 5.2 Write up to 6 additional strategic tests
    - REQUIRED (audit W2 — the rename is otherwise untested end to end; a repo-wide grep for `'Overview'` hits only `src/strings.ts:138` and `package.json:55`): a drift-catching assertion in `test/unit/manifest.test.ts` that the `maister.overview` manifest view name equals `OVERVIEW.title` from `src/strings.ts`
    - REQUIRED: an assertion in `test/dom/surfaces.spec.ts` (or the existing overview DOM assertions) that the rendered Overview `<main aria-label>` equals `OVERVIEW.title` — `test/dom/harness.ts:56` already sources it, so this only needs the positive check
    - REQUIRED: assert the back link is the FIRST focusable control in the `fallbackTask` surface, and that the surfaces array is still exactly five entries
    - Add no more than 6; do NOT broaden coverage beyond this feature
  - [x] 5.3 Document the view-order limitation for users
    - In `README.md` "The two sidebar views" (`:13-18`): retitle the section for three views, add the new **Overview** (tree) row, and rename the existing **Overview** row to **Tasks**
    - State explicitly that the new view appears first only on a fresh profile — VS Code remembers each user's existing sidebar arrangement, and existing users can restore the intended order with the **Views: Reset View Locations** command
    - Add a `CHANGELOG.md` entry covering the new view, the Overview→Tasks rename and the task back links
    - Do NOT attempt to force view placement programmatically
  - [x] 5.4 Run the feature-affected tests
    - `npm test`, `npm run test:integration`, `npm run test:dom`, `npm run lint`
  - [x] 5.5 Verify the hard constraints hold on the final diff
    - `git diff --stat` shows ZERO lines in `src/panel/hostDashboard.ts` and `src/panel/messages.ts`, and no change at `src/panel/panel.ts:1342`
    - `manifest.test.ts` still asserts nine palette-visible commands (`:89-96`); `surfaces.spec.ts` still enumerates five surfaces (`:189-195`)
    - No `"Project"` entry anywhere in the diff
    - No new CSS rule in `media/webview.css`; no inline `style` attribute in any native-panel bundle

**Acceptance Criteria:**
- All feature tests pass across the three runners (~19-25 total)
- No more than 6 additional tests added
- The Overview→Tasks rename is covered by a manifest↔`strings.ts` drift assertion AND a rendered-aria-label assertion
- `README.md` documents the three sidebar views and the first-install-only ordering limitation, naming **Views: Reset View Locations**
- Every hard constraint in 5.5 verified against the real diff

## Execution Order

1. Group 1 — Strings Foundation (7 steps)
2. Group 2 — Sidebar Nav View (11 steps, depends on 1) ⟂
3. Group 3 — Native Task Back Link (7 steps, depends on 1) ⟂
4. Group 4 — Hosted Task Back Link (8 steps, depends on 1) ⟂
5. Group 5 — Test Review & Documentation (5 steps, depends on 2, 3, 4)

⟂ = Groups 2, 3 and 4 may run concurrently; their file sets are disjoint.

## Standards Compliance

Follow standards from `.maister/docs/standards/`:
- `global/minimal-implementation.md` — "Project" deferred not stubbed; no new command, message type, bundle, CSS rule or speculative abstraction
- `global/coding-style.md` — `NAV_VIEW_ID` / `registerNavTree` follow the `NOW_VIEW_ID` / `registerNowTree` conventions; the duplicate "Overview" title is resolved
- `global/commenting.md` — exactly one comment added (the `shim.ts` header correction, documenting a real invariant change); no change-log comments
- `global/error-handling.md` — hosted injection degrades gracefully when `document.body` is unavailable
- `frontend/accessibility.md` — semantic `nav`/`button`, aria-labels, `accessibilityInformation` on the tree item, no positive tabindex, back link first in tab order
- `frontend/components.md` — the nav provider has a single responsibility, no index dependency, no state
- `frontend/css.md` — zero new custom CSS natively; hosted inline styles are the minimum needed and prefer VS Code theme variables
- `project/vision.md`, `project/tech-stack.md` — read-only navigation; no new dependency, no new esbuild entry, five bundles unchanged

## Notes

- Test-Driven: each group starts with its 2-8 tests before implementation
- Run Incrementally: only the group's own tests after each group; the full three-runner pass happens once, in Group 5
- Mark Progress: check off steps as completed
- Reuse First: `maister.openDashboard`, `{type:'openDashboard'}`, `el()`, `post()`, `vscodeApi`, the `.link` class and the `registerNowTree` pattern all already exist — write no equivalent
