# Specification: Dashboard Navigation Affordances (Sidebar Nav View + Task Back Link)

## TL;DR
Two navigation affordances over host plumbing that already works. A new first-position `tree` view titled "Overview" holds one icon-bearing "Dashboard" row that runs the existing `maister.openDashboard` command; the existing `maister.overview` webview view is retitled "Tasks" to resolve the title collision. An unconditional "← Dashboard" back link is added at the top of both task renderers — native (`fallbackTask.ts`, via the existing `.link` class) and hosted (`shim.ts`, inline-styled, with `hostDashboard.ts` untouched). No new command, message type, CSP surface or webview bundle.

## Key Decisions
- New nav view is a `tree`, not a webview — no new bundle, no sixth DOM surface, VS Code provides keyboard/screen-reader access for free.
- Existing `maister.overview` is retitled "Overview" → "Tasks" — the new nav section takes the user's requested "Overview" title, and "Tasks" describes a task list more accurately.
- The "Project" nav entry is deferred to a follow-up task — no destination exists, and a stub violates `minimal-implementation.md`.
- The hosted back link is injected from `src/webview/shim.ts`, never from `src/panel/hostDashboard.ts` — that file's "exactly three insertions, all security plumbing" invariant is preserved verbatim.
- The back link is unconditional in both renderers, mirroring the risks breadcrumb; origin tracking would require new `PanelLocation` state for no user-visible gain.
- Back-link copy lives in new `FALLBACK.breadcrumb` / `FALLBACK.breadcrumbLabel` keys, reused by both renderers (`strings.ts` is dependency-free, so `shim.ts` can import it).

## Open Questions / Risks
- The hosted `dashboard.html` does not load `media/webview.css` and carries arbitrary task-author CSS. The injected link must self-style inline and resist inheritance; visual consistency across arbitrary task dashboards cannot be guaranteed by any test.
- `src/webview/shim.ts` stops being a pure messaging bridge and begins injecting one host-owned chrome element. Its header doc comment must be updated to say so, or it becomes stale documentation.
- Three test files encode literal counts (`manifest.test.ts`: nine palette-visible commands, `navigation@1`/`@2`; `surfaces.spec.ts`: five DOM surfaces). Adding the view must not disturb them; the chosen design keeps both counts unchanged.
- The deferred "Project" page remains an open design item for a future task.

## Goal
Make the Maister dashboard reachable in one click from the sidebar body and from the top of any open task view, in both task renderers, without introducing new host plumbing or a new UI surface type.

## User Stories
- As a developer monitoring Maister state, I want a labelled "Dashboard" row at the top of the Maister Lens sidebar, so that I can open the dashboard without hunting for an unlabelled codicon in a view title bar.
- As a developer who drilled into a task from the dashboard, I want a "← Dashboard" link at the top of the task view, so that I can return the same way risks mode already lets me.
- As a developer using either task renderer (native fallback or the task's own re-hosted `dashboard.html`), I want the same back link in both, so that navigation does not depend on which renderer happened to be chosen.

## Core Requirements

### FR1 — New sidebar navigation view (`maister.nav`)
A `tree` view contributed to `contributes.views.maister`, listed **first**, above `maister.now`, titled "Overview".

Acceptance criteria:
1. `package.json` `contributes.views.maister` lists exactly three entries in order: the new nav view (`"type": "tree"`, `"name": "Overview"`), then `maister.now`, then `maister.overview`.
2. A new provider module under `src/views/` (e.g. `navTree.ts`) exports the view id constant, a `TreeDataProvider` returning exactly one root node, and a `register…` factory returning `{ provider, view, dispose() }` — mirroring `registerNowTree` (`src/views/nowTree.ts:401-425`).
3. The single row renders with label "Dashboard" (from `strings.ts`), `iconPath = new vscode.ThemeIcon('dashboard')` (same codicon as the command, `package.json:129-134`), `collapsibleState = None`, an `accessibilityInformation.label`, and `item.command = { command: 'maister.openDashboard', … }`.
4. The node has no children; `getChildren(node)` returns `[]` for any non-root argument.
5. The view is registered in `src/extension.ts` alongside `registerNowTree` and its disposable is pushed to `context.subscriptions`.
6. No new command is declared and no new palette entry appears — `PALETTE_VISIBLE_COMMANDS` stays at nine.
7. No `viewsWelcome` entry is added — the view is never empty.
8. The view is never gated on workspace trust (the Dashboard command is not trust-gated, `messages.ts:81`).

### FR2 — Rename the existing Overview view to "Tasks"
Acceptance criteria:
1. `package.json` `contributes.views.maister` entry `maister.overview` has `"name": "Tasks"`.
2. `OVERVIEW.title` in `src/strings.ts:138` changes value from `'Overview'` to `'Tasks'`; the key name, the view id `maister.overview`, the provider, the `view/title` menu entries (`maister.openDashboard` at `navigation@1`, `maister.openRisks` at `navigation@2`) and all behavior are unchanged.
3. `OVERVIEW.title`'s two consumers — the `<title>` and the `<main aria-label>` at `src/views/overviewView.ts:535,538` — pick the new value up with no code change; `test/dom/harness.ts:56` follows automatically.
4. No `when`-clause, context key or `view ==` selector string changes.

### FR3 — Back link in the native task view
`src/webview/fallbackTask.ts` `render()` (`:296-307`) prepends a breadcrumb before `banner(payload)`.

Acceptance criteria:
1. Structure mirrors `src/webview/risksMode.ts:429-433` exactly: `el('nav', { 'aria-label': FALLBACK.breadcrumbLabel }, [crumb])` wrapping `el('button', { class: 'link', type: 'button' }, [FALLBACK.breadcrumb])`.
2. The button's click handler calls the file's existing local `post` helper (`fallbackTask.ts:75-77`) with `{ type: 'openDashboard' }` — no new `acquireVsCodeApi()` call, no new `post` definition.
3. The `<nav>` is the **first** node appended to the fragment, before `banner(payload)`, so it is also first in tab order.
4. The link is rendered unconditionally, on every payload, with no origin or condition check.
5. No inline `style` attribute anywhere — the native panel CSP (`src/panel/panel.ts:1305`) omits `'unsafe-inline'` for styles. Styling comes solely from the existing `.link` class (`media/webview.css:260-275`). No new CSS rule is added.
6. The `<button>` carries an accessible name from its text content; no positive `tabindex`; the element is a `button`, not a heading (the `risksSection()` heading-as-button pattern at `fallbackTask.ts:85-91` is an existing anti-pattern and is **not** copied).

### FR4 — Back link in the hosted task view
`src/webview/shim.ts` injects the equivalent back link at the top of the re-hosted `dashboard.html`. `src/panel/hostDashboard.ts` is not modified.

Acceptance criteria:
1. The shim creates a `<nav aria-label="…">` containing a `<button type="button">` reading `FALLBACK.breadcrumb`, imported from `src/strings.ts` (dependency-free; no inline literal in the shim).
2. The element is inserted as the **first child of `document.body`**, after the DOM is available (guard on `document.readyState`, falling back to a `DOMContentLoaded` listener), so it survives the dashboard's own later rendering into the page.
3. Clicking posts `{ type: 'openDashboard' }` through the shim's existing `vscodeApi` handle (`shim.ts:20`) — no second `acquireVsCodeApi()` call (VS Code permits exactly one per page) and no new message type.
4. The element carries a distinctive class (e.g. `maister-lens-back`) **and** inline `style` properties for every visual property it depends on (display, position in flow, margin/padding, font, color, background, border, cursor, z-index, visibility) — the hosted CSP (`hostDashboard.ts:92-94`) permits `style-src 'unsafe-inline'`, and the page does not load `media/webview.css`. Styles are set as properties on `element.style`, never as a string of markup.
5. The click handler is attached directly to the button and calls `stopPropagation()` so the shim's own capture-phase `interceptLink` handler (`shim.ts`, `document.addEventListener('click', interceptLink, true)`) never converts it into a `navigate` message.
6. The shim's header doc comment (`shim.ts:1-6`, "It is the only code the extension adds to that page") is updated to state that it now also injects exactly one host-owned chrome element, the back link.
7. `src/panel/hostDashboard.ts` has a zero-line diff; its "exactly three insertions, all security plumbing" contract (`:4-12`) is preserved.

### FR5 — Strings
Acceptance criteria:
1. `src/strings.ts` `FALLBACK` block (`:226-258`) gains `breadcrumb: '← Dashboard'` and `breadcrumbLabel: 'Breadcrumb'`, mirroring `RISKS` (`:329-330`), placed at the top of the block to match the render order convention.
2. The new nav view's row label and accessible name live in `strings.ts` — either a small new `NAV` block or the reuse of an existing key; no inline literal in `src/views/`.
3. No user-facing literal appears in `fallbackTask.ts`, `shim.ts`, `navTree.ts` or `package.json`-adjacent TypeScript beyond what `strings.ts` exports (`package.json` view titles are manifest data and are necessarily literal there).
4. All new strings avoid the wording `test/unit/strings.test.ts` forbids (`running|waiting|stalled|abandoned`). "← Dashboard", "Breadcrumb", "Dashboard", "Overview", "Tasks" are all safe.

## Reusable Components

### Existing code to leverage (no new equivalent is written)
| Asset | Location | Used for |
|---|---|---|
| `maister.openDashboard` command | declared `package.json:129-134` (icon `dashboard`), registered `src/panel/panel.ts:1489-1491` | FR1's tree-item command; no new command declared |
| `{type:'openDashboard'}` message | allowlisted/validated/dispatched `src/panel/messages.ts:59,299-300,363,378`; dispatch `panel.ts:513-514` | FR3 and FR4; no new message type, no `messages.ts` change |
| Risks breadcrumb template | `src/webview/risksMode.ts:429-433` | FR3's exact structure |
| `.link` CSS class | `media/webview.css:260-275` | FR3's styling; no new CSS |
| `el()` DOM builder | `src/webview/components.ts:9-27` | FR3's markup (the only permitted builder; no `innerHTML` anywhere) |
| Local `post()` helper | `src/webview/fallbackTask.ts:75-77` | FR3's dispatch; no sixth copy of the `acquireVsCodeApi`/`post` boilerplate |
| `vscodeApi` handle | `src/webview/shim.ts:20` | FR4's dispatch; one `acquireVsCodeApi()` per page is the hard limit |
| Tree-provider + registration pattern | `src/views/nowTree.ts` (`NOW_VIEW_ID:8`, `taskItem():273-300`, `registerNowTree():401-425`) | FR1's provider shape, item/command wiring, disposal contract |
| `FALLBACK` / `RISKS` string blocks | `src/strings.ts:226-258`, `:329-330` | FR5's placement convention |

### New components required (and why)
| New | Why existing code cannot be reused |
|---|---|
| `src/views/navTree.ts` — nav view id, `TreeDataProvider`, register factory | `NowTreeProvider` is bound to `TaskIndex` and unfinished-task membership; its data model (`NowNode`, seven node kinds, badges, artifact mtimes) has nothing in common with a single static navigation row. Folding the row into `NowTreeProvider` would mix navigation into a task list, breaking single responsibility (`standards/frontend/components.md`). The new provider is index-free and holds no state. |
| `package.json` view entry | VS Code has no container-title contribution point; a contributed view is the only way to place a labelled row above `maister.now`. |
| `FALLBACK.breadcrumb` / `breadcrumbLabel` + nav label strings | No existing key carries this copy in the FALLBACK surface; the file's convention is one block per surface (D5). |
| One `<nav>`+button in `fallbackTask.render()`; one injected element in `shim.ts` | Neither renderer emits any breadcrumb today. |

Explicitly **not** created: new command, new message type, new `PanelLocation` variant, new webview bundle, new CSP surface, new CSS rule, new `TaskPanel` history API, any origin-tracking state.

## Technical Approach

**Sidebar (FR1/FR2).** Manifest-first: reorder/extend `contributes.views.maister` and retitle `maister.overview`. The new provider is a stateless `TreeDataProvider<NavNode>` with one root node and no `onDidChangeTreeData` firing (the row never changes); registration mirrors `registerNowTree`, returning a disposable pushed in `src/extension.ts`. Activation is unchanged — the view is contributed to an existing container, so existing `activationEvents` suffice. No badge.

**Native back link (FR3).** Purely additive inside `render()`: one `<nav>` prepended to the existing document fragment. The webview → host path is untouched; the click reuses the already-validated `openDashboard` message, which the host turns into a fresh `{mode:'dashboard'}` push via `TaskPanel.show()` — the same forward-navigation semantic risks mode already uses, and the same one that survives reload since history is not persisted.

**Hosted back link (FR4).** The shim is the only extension-owned code executing inside the re-hosted page. It gains a small `injectBackLink()` step: build the node with `document.createElement`, set inline style properties defensively, attach a click handler that stops propagation and posts `openDashboard`, and prepend to `document.body` once the body exists. Because the page's own script may re-render regions, the link is attached to `body` (not to any author container) so it is not clobbered. The hosted CSP allows inline styles; the security boundary (`hostDashboard.ts`, `messages.ts`) is untouched.

**Ordering invariants.** Sidebar order becomes nav → Now → Tasks. Task render order becomes nav → banner → header → sections; the back link is therefore also first in tab order in both renderers.

## Accessibility Requirements
- Every new control is a `<button>` or a tree item — never a `<div>`, never a heading-as-button.
- Both back links sit inside a `<nav>` with an `aria-label` sourced from `FALLBACK.breadcrumbLabel`.
- The tree row sets `accessibilityInformation.label` (the `nowTree.ts` convention) so the spoken name is explicit.
- No positive `tabindex` anywhere; document order is the tab order, and the back link is first.
- Color and contrast: the native link inherits `--vscode-textLink-foreground` via `.link`; the hosted link sets `color` explicitly from a VS Code CSS variable with a literal fallback, since the hosted page's theme variables are not guaranteed.
- `test/dom/surfaces.spec.ts:190-213` enforces the tag/name/tabindex rules automatically for the `fallbackTask` surface.

## Test Plan

| File | Change | Covers |
|---|---|---|
| `test/unit/manifest.test.ts` | Assert `contributes.views.maister` order (nav first, `maister.now` second, `maister.overview` third), the nav view's `type: "tree"` and `name: "Overview"`, and `maister.overview`'s `name: "Tasks"`. Confirm the nine-palette-visible-commands assertion (`:89-96`) and the `navigation@1`/`@2` literals (`:106,:111`) still pass unchanged. | FR1, FR2 |
| `test/unit/strings.test.ts` | No new test needed; the existing forbidden-wording scan covers the new keys automatically. Verify it still passes. | FR5 |
| `test/integration/fallbackTask.test.ts` | Assert the rendered task view's first element is a `<nav>` whose button reads `FALLBACK.breadcrumb`, and that clicking it posts `{type:'openDashboard'}`. | FR3 |
| `test/integration/overview.test.ts` | Update any assertion on the old "Overview" title/aria-label to "Tasks"; confirm the view id and behavior assertions are untouched. | FR2 |
| `test/dom/surfaces.spec.ts` | The `fallbackTask` surface picks the new control up automatically in the blanket a11y loop; assert the back link is the first focusable control in that surface. The surfaces array stays at **five** — no new bundle. | FR3, a11y |
| New unit test for the nav provider (co-located with existing `src/views` tests) | `getChildren()` returns exactly one node; its tree item has the `dashboard` `ThemeIcon`, the `maister.openDashboard` command, `collapsibleState: None`, and a non-empty accessible label; `getChildren(node)` returns `[]`. | FR1 |

Test sizing: 2-8 focused tests per implementation task group. Verification runs only the new/affected tests, not the entire suite; runners are `npm test` (mocha unit), `npm run test:integration`, `npm run test:dom` (Playwright).

**Untested by design:** FR4's visual appearance inside arbitrary task-authored `dashboard.html` pages. No harness re-hosts a third-party dashboard; this is accepted risk and is the main reason the element self-styles defensively.

## Standards Compliance
- `standards/global/minimal-implementation.md` — the "Project" entry is deferred rather than stubbed; no new command, message type, bundle, CSS rule or speculative abstraction is introduced.
- `standards/global/coding-style.md` — the duplicate "Overview" title is resolved; naming follows the `NOW_VIEW_ID` / `registerNowTree` conventions.
- `standards/global/commenting.md` — the only comment added is the `shim.ts` header-comment correction, which documents a real invariant change; no change-log comments.
- `standards/global/error-handling.md` — the hosted injection degrades gracefully: if `document.body` is unavailable the injection is skipped and the rest of the shim (messaging, nonce adoption, link interception) is unaffected.
- `standards/frontend/accessibility.md` — semantic `nav`/`button`, aria-labels, keyboard-first order (see Accessibility Requirements).
- `standards/frontend/components.md` — the nav provider has a single responsibility and no props/state beyond its one row.
- `standards/frontend/css.md` — zero new custom CSS in the native panel; the hosted inline styles are the minimum needed and use VS Code theme variables where available.
- `project/vision.md` — both affordances serve "recall in seconds"; both are read-only navigation, consistent with the view-layer scope.
- `project/tech-stack.md` — no new dependency, no new esbuild entry, no change to the five-bundle DOM surface count.

## Out of Scope
- The "Project" nav entry and the Project page (deferred to a follow-up task; adding a second row later is a one-line provider change).
- Origin tracking / conditional back link — the link is unconditional by decision.
- Any change to `src/panel/panel.ts:1342` (the uncommitted `ViewColumn.Beside` → `ViewColumn.Active` edit).
- Any change to `src/panel/hostDashboard.ts`, `src/panel/messages.ts`, or `PanelLocation`.
- Refactoring the per-surface `acquireVsCodeApi()`/`post()` boilerplate into a shared helper.
- Extracting a shared `BREADCRUMB` string constant across RISKS/FALLBACK/reader.
- Changing `maister.overview`'s view id, provider or `view/title` actions.
- Any new webview bundle, CSP change, badge or `viewsWelcome` entry.

## Assumptions
- The new view id is not asserted anywhere outside the manifest test, so the implementer may pick it (e.g. `maister.nav`) without downstream breakage.
- `src/strings.ts` has no imports and is bundle-safe, so `shim.ts` may import from it without pulling in extension-host code; if bundle size proves a problem, the implementer may instead pass the copy through a narrow shim-local constant *sourced from* `strings.ts` at build time — the requirement is no hand-written literal.
- `test/integration/overview.test.ts` asserts the surface's title/aria-label; if it does not, FR2's test change reduces to a no-op and only the manifest assertion applies.
- The `dashboard` codicon is valid as a `ThemeIcon` id (it is already used as a command icon in the manifest).
- Adding a third view to the container does not alter any existing `when` clause or context key.

## Success Criteria
1. The Maister Lens sidebar shows, in order: "Overview" (one "Dashboard" row with the dashboard icon), "Now", "Tasks". Clicking the row opens the dashboard panel.
2. No two sidebar sections share a title.
3. Every task view — native and hosted — shows "← Dashboard" as its first element and its first tab stop; activating it opens the dashboard.
4. `git diff --stat` shows zero lines changed in `src/panel/hostDashboard.ts`, `src/panel/messages.ts` and at `src/panel/panel.ts:1342`.
5. `npm test`, `npm run test:integration` and `npm run test:dom` all pass; `surfaces.spec.ts` still enumerates five surfaces and `manifest.test.ts` still asserts nine palette-visible commands.
6. No inline `style` attribute exists in any native-panel bundle; no new CSS rule was added to `media/webview.css`.
