# Gap Analysis: Dashboard Nav Buttons + Task Back Link

## TL;DR
Two independent UI gaps: a new first-position sidebar nav view (Dashboard / Project) and an unconditional "← Dashboard" back link at the top of both task renderers. Everything needed already exists host-side — the `maister.openDashboard` command, the `{type:'openDashboard'}` allowlisted message, and the risks breadcrumb pattern — so no new command, message type or navigation plumbing is required. Risk rises from low to **medium** because of a hard title collision with the existing `maister.overview` view, a destination-less "Project" entry that violates the project's own minimal-implementation standard, and a back link in the re-hosted `dashboard.html` that can only be delivered by breaching a documented security invariant. Four blocking decisions must be settled before a spec can be written.

## Key Decisions
- Treated the task as two separable deliverables (sidebar nav view; task back link) — they share no code and can ship independently if scope is cut.
- Rated risk medium rather than low — the back link in the hosted renderer touches `hostDashboard.ts`/`shim.ts`, the extension's security boundary, not just presentation code.
- Escalated all four known open issues to `decisions_needed` rather than defaulting them — each has a materially different implementation shape and cost.

## Open Questions / Risks
- A new webview bundle would make `test/dom/surfaces.spec.ts` a six-surface suite; its test name and array literally enumerate "all five generated surfaces" (:185-196) and it auto-fails unnamed controls.
- Injecting a back link into the re-hosted `dashboard.html` from `shim.ts` contradicts the invariant written at `src/panel/hostDashboard.ts:4-12` ("exactly three insertions, all security plumbing").
- Uncommitted working-tree change in `src/panel/panel.ts:1342` (dashboard panel `ViewColumn.Beside` → `ViewColumn.Active`) is unrelated to this task and will pollute the diff.

## Summary
- **Risk Level**: Medium
- **Estimated Effort**: Medium
- **Detected Characteristics**: modifies_existing_code, creates_new_entities, ui_heavy

## Task Characteristics
- Has reproducible defect: **no**
- Modifies existing code: **yes** (`package.json` views/menus, `fallbackTask.ts`, `strings.ts`, `shim.ts` or `hostDashboard.ts`, three test files)
- Creates new entities: **yes** (a new sidebar view + provider; possibly a new webview bundle; new string keys)
- Involves data operations: **no** (pure navigation; no entity CRUD, no persistence)
- UI heavy: **yes** (sidebar view, nav entries, breadcrumb in two renderers, a11y-gated)

## Gaps Identified

### Missing Features
- **No first-position navigation view.** `package.json:46-53` contributes exactly two views into container `maister`: `maister.now` (tree, "Now") then `maister.overview` (webview, "Overview"). Nothing sits above `maister.now`.
- **No "Project" page.** No route, mode, renderer, command or `PanelLocation` variant exists. `PanelLocation` (`src/panel/panel.ts:49-59`) has four modes: dashboard, risks, task, artifact.
- **No back link in the native task renderer.** `src/webview/fallbackTask.ts:296-307` `render()` starts with `banner(payload)`; there is no `<nav>` element and no `openDashboard` post in that file.
- **No back link in the re-hosted dashboard.** `src/webview/shim.ts` posts `ready` and converts links to `navigate`; it injects no chrome of its own.
- **No FALLBACK string keys for a breadcrumb.** `src/strings.ts:226-258` has no `breadcrumb`/`breadcrumbLabel`; only `RISKS` carries them (`:329-330`).

### Incomplete Features
- **Dashboard is reachable, but only from chrome, not from content.** `maister.openDashboard` is already pinned as a title-bar action on the Overview view (`package.json:230-234`, `navigation@1`) and on the panel editor title (`:305-309`). The gap is in-content reachability from a task, and a labelled entry point in the sidebar body.

### Behavioral Changes Needed
- Sidebar view order: `maister.now` first → new nav view first, `maister.now` second, `maister.overview` third.
- Task view render order: `banner(...)` first → `nav(back link)` first, then `banner(...)`.

## User Journey Impact Assessment

| Dimension | Current | After | Assessment |
|-----------|---------|-------|------------|
| Reachability — dashboard from a task | Editor-title icon only, or re-invoke command | In-content link at top of task, both renderers | ✅ +1 |
| Reachability — dashboard from sidebar | Icon-only title action on Overview | Labelled row, first thing under the container title | ✅ +1 |
| Discoverability — dashboard | 5/10 (unlabelled codicon in a view title bar) | 9/10 (labelled row, first position) | ✅ +4 |
| Discoverability — back from task | 4/10 (icon in editor title, easily missed) | 8/10 (standard breadcrumb, mirrors risks mode) | ✅ +4 |
| Flow integration | Task view is a dead end for navigation | Matches risks-mode breadcrumb precedent | ✅ consistent |
| Flow integration — "Project" | n/a | Row that leads nowhere, or to a stub | ❌ dead end (see decision D2) |
| Multi-persona | n/a — extension has no roles; workspace-trust gating applies only to `maister.startWorkflow` | unchanged | ✅ no impact |

**Back-link consistency note:** the user asked for the back link to be **unconditional**. The risks breadcrumb it mirrors is also unconditional (`risksMode.ts:427-433` renders the crumb before any branch), so this is consistent with existing behavior. `PanelLocation` carries no origin field and history is not persisted (`panel.ts:49-59`, `readLocation()` ~:1521), so an origin-conditional link would have required new state — unconditional is also the cheaper and more consistent choice.

## Data Lifecycle Analysis
Not applicable — `involves_data_operations: false`. This task adds navigation affordances only; no entity is created, read, updated or deleted, and no orphaned-operation risk exists. Completeness scoring is not meaningful here.

## Three-Layer Verification (navigation affordance)

| Layer | Dashboard entry | Project entry | Task back link |
|-------|-----------------|---------------|----------------|
| 1. Host capability | ✅ `maister.openDashboard` registered `panel.ts:1489-1491`; `{type:'openDashboard'}` allowlisted and dispatched in `messages.ts` | ❌ **MISSING** — no mode, no command, no `PanelLocation` variant | ✅ same message, already validated |
| 2. UI component | ❌ no nav view/provider | ❌ nothing to point at | ❌ no `<nav>` in `fallbackTask.ts`; none injected by `shim.ts` |
| 3. User access | ❌ view not contributed | ❌ | ❌ |

The Dashboard entry and the back link are **UI-only gaps over existing, working host plumbing** — genuinely cheap. The Project entry is missing at every layer, which is why it dominates the effort estimate and is the strongest scope-cut candidate.

## Standards & Documentation Conflicts

| Doc | Conflict |
|-----|----------|
| `standards/global/minimal-implementation.md` — "No Future Stubs", "Build What You Need", "Unused Code Is Debt" | **Direct conflict** with the "Project" entry. A nav row whose page "will be designed later" is a placeholder with no caller and no destination. Shipping it disabled or pointing at an empty page is precisely what this standard forbids. |
| `standards/global/coding-style.md` — naming consistency, no dead code | Two sidebar sections both titled "Overview" is a naming-consistency failure the reader cannot resolve. |
| `standards/frontend/accessibility.md` — semantic HTML, keyboard nav, ARIA when needed | Satisfied by following precedent: `<nav aria-label=…>` + `<button class="link">`, built via `el()`. Enforced automatically by `test/dom/surfaces.spec.ts:190-213`, which fails any unnamed control. |
| `standards/frontend/components.md` — single responsibility, minimal props | A tree-based nav view satisfies this more cleanly than a bespoke webview. |
| `standards/frontend/css.md` — minimize custom CSS, use design tokens | `.link` / `.action` already exist at `media/webview.css:260-288`; no new CSS needed for the native renderer. |
| `project/vision.md` — "read-only view layer", "recall in seconds" | The back link and the Dashboard nav entry advance "recall in seconds". The Project entry has no stated vision anchor — vision does not describe a project-level page. |
| `project/tech-stack.md` — webview bundles via esbuild, minimal dependencies | A new webview bundle must be registered via `esbuild.mjs` (it auto-globs `src/webview/*.ts`, so a new file is picked up automatically — but it then joins the DOM a11y suite). |

## Security / Invariant Analysis — hosted `dashboard.html` back link

`src/panel/hostDashboard.ts:4-12` states the extension makes **exactly three insertions, all security plumbing**, decided by a tag-by-tag scan, and never evaluates the task's own `dashboard-data.js`. Adding a visible DOM button there would be a fourth insertion that is *not* security plumbing, weakening a deliberately narrow, documented contract.

Relevant CSP facts verified:
- Hosted page CSP (`hostDashboard.ts:92-94`) includes `style-src <cspSource> 'unsafe-inline'` — so a shim-injected element **can** be styled inline.
- Native panel CSP (`panel.ts:1305`) has `style-src <cspSource>` with **no** `'unsafe-inline'` — so the fallback-task back link must use the existing `.link` class, never an inline `style` attribute.
- The hosted page does not load `media/webview.css`, so a shim-injected link inherits the task author's arbitrary stylesheet and may render invisible or misplaced. Inline styling would be required, and visual consistency across arbitrary task dashboards cannot be guaranteed.

This is the single highest-risk element of the task and the reason risk is medium rather than low.

## Test Impact

| Test | Impact |
|------|--------|
| `test/unit/manifest.test.ts` | New view entry assertions; if new commands are added they need `"category": "Maister"` (:98-101) and must be added to `PALETTE_VISIBLE_COMMANDS` (:54) or the hidden list — the suite asserts **exactly nine** palette-visible commands (:89-96). |
| `test/dom/surfaces.spec.ts` | A new webview bundle becomes a sixth surface; the test name and array enumerate five (:185-196). The a11y loop (:190-213) fails unnamed controls, positive tabindex and non-button/a/input controls. The `fallbackTask` back link is covered automatically. |
| `test/unit/strings.test.ts` | New string keys are scanned for forbidden wording (running/waiting/stalled/abandoned). "← Dashboard", "Overview", "Project" are all safe. |
| `test/integration/fallbackTask.test.ts` | Needs a back-link assertion. |
| `test/integration/overview.test.ts` | Affected if the existing Overview view is renamed or absorbs the nav entries. |
| `test/unit/messages.test.ts` | Unchanged if no new message type is introduced (recommended). |

## Issues Requiring Decisions

### Critical (Must Decide Before Proceeding)

1. **D1 — "Overview" title collision.** A view titled "Overview" already exists (`package.json:50-52`, `maister.overview`, backed by `OverviewViewProvider` at `src/views/overviewView.ts:230`). Adding a second "Overview" renders two identically-titled sections in one container.
   - **A)** Rename the *existing* `maister.overview` view (e.g. "Tasks") and give the new view the title "Overview". Cost: touches `test/integration/overview.test.ts` and user-facing naming of an established surface; the existing view lists tasks, so "Tasks" is arguably more accurate than "Overview" anyway.
   - **B)** Give the *new* view a different title ("Navigation", "Go to", "Maister"). Cost: lowest; contradicts the user's stated wording.
   - **C)** Fold the nav entries into the *existing* Overview webview and move it to first position. Cost: no new view/provider/bundle; but violates single-responsibility (`standards/frontend/components.md`) by mixing navigation into a task-listing surface, and changes an established view's contract.
   - **Recommendation: A.** It is the only option that honors the user's wording without producing a duplicate title, and renaming the task list to "Tasks" improves naming accuracy per `coding-style.md`. Requires explicit user sign-off because it renames a surface they did not ask to change.

2. **D2 — "Project" entry has no destination.** Directly violates `minimal-implementation.md` ("No Future Stubs", "Build What You Need").
   - **A)** Defer the Project entry to a follow-up task; ship the nav view with Dashboard only.
   - **B)** Ship it disabled / greyed with a "coming soon" affordance. Note: a disabled control still must satisfy the a11y suite, and this is textbook "future stub".
   - **C)** Ship a minimal real Project page now — requires a new `PanelLocation` mode, a renderer, a command, a message-type or command route, and DOM tests. This roughly doubles the task's effort and is undesigned.
   - **Recommendation: A.** Standards-compliant, keeps this task small and shippable, and avoids committing to a UI the user has explicitly not designed. The nav view remains extensible — adding a second row later is a one-line change.

3. **D3 — Back link in the re-hosted `dashboard.html`.** See the Security / Invariant Analysis above.
   - **A)** Inject from `src/webview/shim.ts` (it already holds the `acquireVsCodeApi()` handle at :20 and posts messages). Delivers a real in-page link; inline styling is CSP-permitted on this page. Cost: the shim stops being purely a messaging bridge and starts injecting chrome; appearance is at the mercy of the task author's CSS.
   - **B)** Rely on the already-pinned editor-title `maister.openDashboard` action (`package.json:305-309`). Zero code, zero invariant cost — but it is an unlabelled icon, does not satisfy "back link at the TOP of the task view", and leaves the two renderers inconsistent.
   - **C)** Add a controlled fourth insertion in `hostDashboard.ts`. Highest invariant cost: the file's own documentation would have to be rewritten, and the tag-scanner would need a new insertion site.
   - **Recommendation: A**, with the shim's doc comment updated to state it now injects exactly one host-owned chrome element, and with that element given a distinctive class plus inline styles so task-author CSS cannot hide it. Reject C (weakens the security contract at its most sensitive point). B is the acceptable fallback if the user prefers zero risk, but it does not meet the stated requirement.

### Important (Should Decide)

4. **D4 — New view type: `tree` vs `webview`.**
   - **A) Tree view.** VS Code-native rows with icons, no new bundle, no new CSP surface, no addition to the five-surface DOM suite, keyboard and screen-reader accessible for free, and a tree item maps directly onto a command. Matches `maister.now`, the existing tree view.
   - **B) Webview.** Custom button styling, but requires a new provider, a new `src/webview/*.ts` entry (auto-globbed by `esbuild.mjs`), a sixth surface in `test/dom/surfaces.spec.ts`, and its own CSP/nonce handling.
   - **Default / Recommendation: A (tree).** Substantially cheaper, satisfies `minimal-implementation.md` and `components.md`, and gains accessibility compliance for free. A webview buys only visual customization the task does not require.

5. **D5 — Back-link wording and string placement.** `RISKS.breadcrumb` is `'← Dashboard'` with `breadcrumbLabel: 'Breadcrumb'` (`strings.ts:329-330`).
   - **A)** Add `breadcrumb` / `breadcrumbLabel` keys to the `FALLBACK` block (`strings.ts:226-258`), duplicating the literals per the per-surface grouping convention.
   - **B)** Extract a shared `BREADCRUMB` constant reused by risks, fallback and the shim.
   - **Default: A.** The file's documented convention is grouping by surface, and `shim.ts` cannot import surface strings cheaply anyway. B trades a convention break for a marginal DRY win on a four-word string.

6. **D6 — Unrelated uncommitted change.** `src/panel/panel.ts:1342` currently has an uncommitted `ViewColumn.Beside` → `ViewColumn.Active` edit that is outside this task's scope.
   - **A)** Commit or stash it separately before starting. **B)** Revert it. **C)** Carry it along.
   - **Default: A.** Keeps this task's diff reviewable, per `conventions.md` ("clean version control").

## Recommendations
- Split delivery: the task back link (native renderer) is genuinely low-risk and can land first; the sidebar view and the hosted-renderer link carry the open decisions.
- Reuse `maister.openDashboard` and `{type:'openDashboard'}` end to end — introduce no new command and no new message type unless D2-C is chosen.
- Mirror `risksMode.ts:427-433` exactly for the fallback back link: `el('nav', {'aria-label': …}, [el('button', {class:'link', type:'button'}, [label])])`, appended *before* `banner(payload)` in `fallbackTask.ts:296-307`.
- Never use an inline `style` attribute in the native panel — its CSP (`panel.ts:1305`) omits `'unsafe-inline'` for styles. Use the existing `.link` class (`media/webview.css:260-288`).
- Update `test/dom/surfaces.spec.ts` and `test/unit/manifest.test.ts` in the same change; both encode literal counts that will otherwise fail.

## Risk Assessment
- **Complexity Risk — Low/Medium.** The Dashboard entry and the native back link are small, precedent-backed changes. Complexity is concentrated entirely in the Project entry (D2) and the hosted renderer (D3).
- **Integration Risk — Medium.** Reordering sidebar views changes an established layout; the "Overview" title collision is a guaranteed defect unless D1 is resolved; the shim gains a new responsibility.
- **Regression Risk — Medium.** Three test files encode exact counts and literals (nine palette-visible commands, `navigation@1`/`@2` groups, five DOM surfaces). The blanket a11y loop will fail any unnamed new control. The hosted-page injection risks visual regressions across arbitrary, author-controlled task dashboards that no test covers.
