# Phase 2 Scope Clarifications

## TL;DR
All six gap-analyzer decisions resolved by the operator. Scope was reduced, not expanded: the "Project" nav entry is deferred to a follow-up task, leaving a Dashboard-only nav section. The existing "Overview" webview is renamed "Tasks" so the new nav section can take the "Overview" title. The hosted-renderer back link is injected from the webview shim, preserving hostDashboard.ts's security invariant.

## Key Decisions
- **D1 Overview title collision → rename existing view to "Tasks"** — the new nav section takes the "Overview" title the user asked for; "Tasks" is also a more accurate name for a task list.
- **D2 "Project" entry → defer to a follow-up task** — no design exists; shipping a stub would violate the no-future-stubs standard. Adding the row later is a one-line change.
- **D3 Hosted dashboard.html back link → inject from `src/webview/shim.ts`** — keeps `hostDashboard.ts`'s "exactly three insertions, all security plumbing" contract intact.
- **D4 New view type → tree view** — no new bundle, no new CSP surface, a11y handled by VS Code, matches `maister.now`.
- **D5 Back-link strings → own keys in the FALLBACK block** — follows the per-surface grouping convention used by RISKS and READER.
- **D6 Stray working-tree edit at `src/panel/panel.ts:1342` → leave untouched** — outside this task's scope; the operator will handle it.

## Open Questions / Risks
- The hosted `dashboard.html` does not load `media/webview.css`, so the shim-injected back link needs its own inline styling (permitted there — the hosted CSP allows `style-src 'unsafe-inline'`) and must resist inheriting arbitrary task-author CSS.
- Renaming the existing Overview view touches `test/integration/overview.test.ts` and any string assertions on that surface.
- `test/unit/manifest.test.ts` encodes literal counts (nine palette-visible commands, `navigation@1`/`@2`); adding a view must not disturb them.
- The deferred "Project" page remains an open design item for a future task.

## Resolved Decisions — full record

### Critical

**D1 — `nav-view-title-collision`**
A sidebar view titled "Overview" already exists (`package.json:50-52`, `maister.overview`).
Options: (A) rename existing to "Tasks"; (B) title the new view differently; (C) fold nav entries into the existing Overview webview.
**Chosen: (A)** — rename the existing view to "Tasks"; the new nav section is titled "Overview".

**D2 — `project-entry-no-destination`**
The "Project" entry has no page, mode, command or `PanelLocation` variant; the user stated it will be designed later.
Options: (A) defer to follow-up; (B) ship disabled/"coming soon"; (C) build a minimal real page now.
**Chosen: (A)** — defer. This task ships a Dashboard-only nav section.

**D3 — `hosted-dashboard-back-link`**
Options: (A) inject from `src/webview/shim.ts`; (B) rely on the pinned editor-title action; (C) 4th insertion in `hostDashboard.ts`.
**Chosen: (A)** — shim injection, with the shim's doc comment updated and the element given inline styles plus a distinctive class.

### Important

**D4 — `nav-view-type`**: tree vs webview. **Chosen: tree view.**

**D5 — `back-link-string-placement`**: per-surface keys vs shared constant. **Chosen: own `breadcrumb`/`breadcrumbLabel` keys in the `FALLBACK` block of `src/strings.ts`**, mirroring `RISKS` at :329-330.

**D6 — `unrelated-working-tree-change`**: the uncommitted `ViewColumn.Beside` → `ViewColumn.Active` edit at `src/panel/panel.ts:1342`. **Chosen: leave it untouched.**

## Resulting scope

**In scope**
1. New `tree` view contributed first in `contributes.views.maister`, titled "Overview", containing a single "Dashboard" row that runs `maister.openDashboard`.
2. Rename the existing `maister.overview` view's title from "Overview" to "Tasks".
3. Back link at the top of the native fallback task view (`src/webview/fallbackTask.ts` `render()`, before `banner(payload)`), mirroring `src/webview/risksMode.ts:429-433`, with new FALLBACK strings.
4. Back link injected into the hosted `dashboard.html` task view from `src/webview/shim.ts`, with inline styling.
5. Test updates: `test/unit/manifest.test.ts`, `test/dom/surfaces.spec.ts`, `test/integration/fallbackTask.test.ts`, `test/integration/overview.test.ts`.

**Out of scope**
- The "Project" nav entry and the Project page (deferred to a follow-up task).
- Origin tracking for the back link (it is unconditional by decision).
- Any change to `src/panel/panel.ts:1342`.
- Refactoring the per-surface `acquireVsCodeApi`/`post` boilerplate.
