# Requirements — Dashboard navigation buttons

## TL;DR
Two navigation affordances for Maister Lens: a new first-position sidebar tree view titled "Overview" holding a single icon-bearing "Dashboard" row, and an unconditional "← Dashboard" back link at the top of every task view in both renderers. The existing Overview webview is renamed "Tasks". The originally requested "Project" entry is deferred.

## Key Decisions
- Dashboard row rendered as icon + "Dashboard" using the existing `dashboard` codicon — consistent with the command's own icon elsewhere in the UI.
- Back link reads "← Dashboard", identical to the risks breadcrumb, so both surfaces read the same.
- Back link is unconditional on every task view (re-confirmed by the operator).
- No visual assets provided; Phase 4 mockups were skipped by operator choice.

## Open Questions / Risks
- The hosted `dashboard.html` does not load `media/webview.css`; the shim-injected link needs inline styling resistant to task-author CSS.
- The deferred "Project" page is an open design item for a future task.

## Initial description (verbatim)
> 1. like to have above "now" button "Open Dashboard", 2. if I open task from dashboard I expext to have "back" button on top to move back to dashboard (as it is in case of risks)

## Q&A record

### Round 1 — Phase 1 clarifications
- **Placement**: There is no "now button"; "Now" is a sidebar tree view. Operator asked for placement "above Now, just below the Maister Lens title". After being shown that VS Code has no container-title contribution point, the operator chose a new first-position sidebar view with header **"Overview"**, containing **Dashboard** then **Project** ("a new page which I will design later").
- **Back link renderers**: both the native fallback task view and the re-hosted `dashboard.html`.
- **Back link condition**: always show.

### Round 2 — Phase 2 decision gate
- D1 title collision → rename existing `maister.overview` view to **"Tasks"**.
- D2 "Project" entry → **defer** to a follow-up task.
- D3 hosted back link → **inject from `src/webview/shim.ts`**.
- D4 new view type → **tree view**.
- D5 back-link strings → **own keys in the `FALLBACK` block**.
- D6 stray edit at `src/panel/panel.ts:1342` → **leave untouched**.

### Round 3 — Phase 5 requirements
- Dashboard row presentation → **icon + "Dashboard"** (existing `dashboard` codicon).
- Back link wording → **"← Dashboard"**, matching the risks breadcrumb.
- Back link scope → **always show**, re-confirmed.

## Functional requirements

**FR1 — New sidebar navigation view**
A `tree` view contributed to `contributes.views.maister`, positioned first (above `maister.now`), titled "Overview". It contains exactly one row: an icon + "Dashboard" entry that invokes the existing `maister.openDashboard` command on activation.

**FR2 — Rename the existing Overview view**
`maister.overview`'s contributed title changes from "Overview" to "Tasks". The view id, provider and behavior are unchanged.

**FR3 — Back link in the native task view**
`src/webview/fallbackTask.ts` `render()` prepends a `<nav aria-label="…">` containing a `button.link` reading "← Dashboard" that posts `{type:'openDashboard'}`, appended before `banner(payload)`. Mirrors `src/webview/risksMode.ts:429-433`.

**FR4 — Back link in the hosted task view**
`src/webview/shim.ts` injects the equivalent back link at the top of the re-hosted `dashboard.html` page, styled inline (the hosted page has no access to `media/webview.css`). `src/panel/hostDashboard.ts` is not modified.

**FR5 — Strings**
New `breadcrumb` and `breadcrumbLabel` keys in the `FALLBACK` block of `src/strings.ts`, mirroring `RISKS` at :329-330. All user-facing text lives in `strings.ts`; no inline literals in webview code.

## User journey
Entry points: the sidebar (always visible in the Maister Lens container) and any open task view. A user working in the Now tree or the Tasks list can reach the dashboard in one click from the sidebar without first opening a task. A user who has drilled into a task can return to the dashboard from the top of the page rather than hunting for the unlabelled editor title-bar icon. Persona: the extension's single user profile — a developer monitoring Maister workflow state in the editor. Fits the existing read-only view-layer workflow; no new data or mutation paths.

## Existing code reuse
- `maister.openDashboard` command — already declared (`package.json:129-134`, icon `dashboard`) and registered (`src/panel/panel.ts:1489-1491`). No new command needed.
- `{type:'openDashboard'}` webview message — already allowlisted, validated and dispatched in `src/panel/messages.ts`. No new message type needed.
- `src/webview/risksMode.ts:429-433` — the breadcrumb to copy verbatim.
- `src/webview/reader.ts:48-58` — richer breadcrumb precedent with a CSS class on the nav.
- `el()` from `src/webview/components.ts` — the only permitted DOM builder.
- `.link` class, `media/webview.css:260-275`.
- `src/views/nowTree.ts` — the tree-view provider pattern for FR1.

## Scope boundaries

**In scope**: FR1–FR5 plus test updates in `test/unit/manifest.test.ts`, `test/dom/surfaces.spec.ts`, `test/integration/fallbackTask.test.ts`, `test/integration/overview.test.ts`.

**Out of scope**: the "Project" nav entry and Project page; origin tracking for the back link; any change to `src/panel/panel.ts:1342`; refactoring the per-surface `acquireVsCodeApi`/`post` boilerplate; any change to `src/panel/hostDashboard.ts`.

## Technical considerations
- Adding a view must not disturb `test/unit/manifest.test.ts`'s literal assertions (nine palette-visible commands, `navigation@1`/`@2`).
- The native panel CSP (`src/panel/panel.ts:1305`) omits `'unsafe-inline'` for styles — no inline `style` attributes there. The hosted page's CSP (`src/panel/hostDashboard.ts:92-94`) does allow inline styles.
- `test/dom/surfaces.spec.ts`'s blanket a11y loop auto-fails unnamed controls, positive tabindex, and non-button/a/input controls.
- `test/unit/strings.test.ts` scans string exports for forbidden wording (running|waiting|stalled|abandoned) — "← Dashboard" and "Overview" are safe.
- No new webview bundle is introduced (tree view chosen), so the DOM surface count stays at five.

## Visual assets
None supplied. Phase 4 mockup generation was skipped at the operator's request; ASCII previews shown during clarification serve as the layout reference.
