# Design Alternatives — Maister Viewer VS Code Extension

## TL;DR
Twenty alternatives across five decision areas: presentation architecture, artifact rendering, data layer & indexing, navigation model, and relationship to Maister's existing `dashboard.html`.
The recommended spine is a TreeView for navigation plus one reusable webview panel for reading (A2), in-extension markdown rendering with companion HTML re-hosted through `asWebviewUri` (B2+B3), a two-tier persisted metadata index with lazy body parsing (C2), an activity-first three-surface navigation model (D2), and a reimplementation of the dashboard's visual language over `orchestrator-state.yml` with `dashboard-data.js` as an optional fast path (E3+E4).
Areas are genuinely coupled: a tree-only presentation (A1) forecloses rendered reading inside the extension and therefore fails the universal floor; delegating rendering to VS Code's markdown preview (B1) forecloses the GitLens self-sufficiency property.
The two largest cost drivers — full-text search and portfolio aggregation — are both deferrable without breaking the universal floor, which is what makes a credible first release possible.

## Key Decisions
- Alternatives are organised into five decision areas so the operator can choose area by area — coupling constraints are stated explicitly where a choice in one area forecloses one in another.
- Every alternative is evaluated against the Phase 3 universal floor (rendered reading, workflow-type filtering, § 7 summary block) rather than against feature counts.
- Scope guardrails separate a minimum-viable spine from expansive options, treating full-text search and portfolio roll-up as the two deferrable cost peaks.

## Open Questions / Risks
- The "self-sufficiency" property the user named (GitLens) is in direct tension with the cheapest rendering options — every low-cost rendering alternative pushes the user out to VS Code's own preview or an external browser.
- Webview CSP forces a rewrite pass over Maister's self-contained companions; inline `<style>` is allowed under a nonce but inline `<script>` and the dashboard's dynamic `<script src>` are not, so companion re-hosting is a partial, not total, reuse.
- Persisted indexes risk staleness across VS Code sessions and Maister plugin upgrades; every persisted-index alternative needs a cheap invalidation key (mtime + size, or a schema version stamp).
- Accessibility diverges sharply between areas: TreeView is accessible for free, webviews inherit nothing and must be built to the project's frontend accessibility standard by hand.
- Performance at hundreds of tasks is unvalidated — no alternative here has been benchmarked, and the glob-plus-parse floor cost is unmeasured.

---

## How to Read This Document

Five decision areas, four alternatives each. Each alternative gives a concrete mechanism (named VS Code APIs), honest pros and cons, and persona impact using the Phase 3 cards — Marek (engineering contributor, live monitoring), Ada (business contributor, rendered reading), Irena (delivery lead, portfolio and staleness).

The **universal floor** from Phase 3 is the pass/fail bar applied throughout: rendered artifact reading (never source), workflow-type filtering, and the § 7 TL;DR / Key Decisions / Risks block surfaced. An alternative that fails the floor is marked as such regardless of its other merits.

---

# Decision Area A — Presentation Architecture

*How the extension's UI is composed from VS Code's available surfaces.*

VS Code offers a fixed menu: `TreeDataProvider` in a view container (`viewsContainers.activitybar` + `views` contributions), `WebviewViewProvider` (a webview that lives inside a sidebar view), `WebviewPanel` (a webview occupying an editor tab), `CustomTextEditorProvider` / `CustomReadonlyEditorProvider` (a webview bound to a file type and opened through normal editor flows), `TextDocumentContentProvider` (virtual read-only documents behind a custom URI scheme), `TextEditorDecorationType` (inline editor decoration), `StatusBarItem`, and `QuickPick`. These differ sharply in capability, theming cost, accessibility, and how well they support the self-sufficiency property.

## A1 — Tree-First, Native Editors

**How it works.** A single activity-bar container contributes two or three `TreeView`s (`Tasks`, `Active Run`). `TreeDataProvider` returns `TreeItem`s with `iconPath` (`ThemeIcon` from the built-in codicon set), `description` (the dimmed trailing text — used for status and "quiet for 3 days"), `tooltip` as a `MarkdownString` (this is where the § 7 TL;DR goes), and `contextValue` for right-click menus. `resourceUri` plus `FileDecorationProvider` supplies badge letters and colours for verification outcome. Clicking an artifact runs `vscode.open` or `markdown.showPreview`. A `StatusBarItem` shows the live phase of the running task. Filtering by workflow type is a `TreeView` title-bar menu that swaps the provider's grouping and re-fires `onDidChangeTreeData`.

**Pros.** Cheapest by a wide margin — perhaps a tenth of the UI cost of any webview option. Accessibility, keyboard navigation, theming, high-contrast, and screen-reader labelling all come free and correct. Native look, zero CSP surface, no bundling of front-end assets, trivially fast at hundreds of nodes because `TreeDataProvider` is lazily pulled by `getChildren`. `MarkdownString` tooltips can render the TL;DR block with formatting, which covers more of the § 7 requirement than it first appears.

**Cons.** Fails the universal floor on rendered reading: every artifact click leaves the extension's surface for VS Code's markdown preview or, for HTML companions, either the source editor or an external browser. That is precisely the pain Ada reports. Tree rows cannot show a decisions table, a verification findings list, or a portfolio roll-up. Irena's aggregate view has nowhere to live except a tree of synthetic summary nodes, which reads badly. No progress bars, no charts, no side-by-side.

**Personas.** Serves Marek adequately (he is comfortable with trees and hero-artifact shortcuts). Fails Ada outright — directory-free navigation is achieved but rendered reading is not. Fails Irena — no aggregation surface.

## A2 — Tree for Navigation + One Reusable Webview Panel for Reading

**How it works.** The activity-bar container holds the `TreeView`s from A1 for navigation, staleness, and filtering. Selecting a task or artifact opens (or reuses, via a singleton `WebviewPanel` held in extension state and `reveal()`ed) a panel in `ViewColumn.Beside` titled after the task. The panel is a small single-page app: task header, phase timeline, § 7 block, decisions/risks, artifact list, and the rendered artifact body. Navigation inside the panel is `postMessage` to the extension host, which reads files and posts content back. `retainContextWhenHidden: false` with explicit state serialisation via `WebviewPanelSerializer` keeps memory sane. `localResourceRoots` is set to the task directory plus the extension's `media/` folder so `asWebviewUri()` can serve screenshots and mockups.

**Pros.** Meets the universal floor fully. Splits responsibility along the grain of each surface's strengths: the tree does hierarchy, filtering, and always-visible live state at low cost; the webview does documents and aggregation, where only a webview will do. The panel sits beside the integrated terminal pane, which matches Marek's journey literally — terminal left, plugin right. Because the panel is reused rather than spawned per artifact, the user never accumulates editor tabs. One webview codebase serves task detail, artifact reading, and the portfolio view.

**Cons.** Two UI technologies to build and maintain, with a `postMessage` protocol between them that becomes real surface area (message typing, error handling, race conditions on rapid selection). Webview accessibility is entirely hand-built — semantic HTML, focus management, keyboard routes — against the project's frontend accessibility standard. Theming requires consuming `--vscode-*` CSS custom properties and testing across light, dark, and high-contrast. State restoration after a window reload is manual work. The panel competes with the user's code editors for screen space.

**Personas.** Serves all three. Marek gets the tree's live state plus rendered verification reports. Ada gets documents. Irena gets a real canvas for roll-ups.

## A3 — Webview-View Only (Whole Sidebar Is Custom UI)

**How it works.** No `TreeView` at all. `window.registerWebviewViewProvider` contributes one (or two) `WebviewView`s into the activity-bar container; the entire product — task list, filters, live run, artifact reading — is rendered as HTML inside the sidebar. Optionally a second `WebviewPanel` is opened for full-width document reading when the sidebar gets cramped.

**Pros.** Total design control with one technology and one rendering pipeline — no tree/webview protocol split. Matches the "one identical reading experience" principle with a single component library. Filters, facet chips, search boxes, sparklines, and roll-up tiles all become ordinary front-end work. Persistent in the sidebar, so live monitoring is always visible without consuming an editor column.

**Cons.** The sidebar is narrow (often 250–350px) and resizing it steals from the editor. Rendering a verification report in that column is bad; the escape hatch is a panel anyway, which reintroduces the two-surface split without the tree's benefits. Everything the tree gives free must be rebuilt: keyboard navigation, virtualised scrolling at hundreds of rows, drag behaviour, context menus (webview context menus are limited and do not integrate with `menus` contributions cleanly), and accessibility. `WebviewView`s are disposed and re-created when the sidebar is collapsed unless `retainContextWhenHidden` is set, which costs memory. Least native-feeling of the four.

**Personas.** Strong for Ada (pure visual surface, no tree vocabulary). Acceptable for Irena in a widened sidebar. Weakest for Marek, who loses the dense native tree he is used to and gains a narrow column.

## A4 — Custom Editor Bound to Task Files

**How it works.** `window.registerCustomEditorProvider` with a `CustomReadonlyEditorProvider` registered for `orchestrator-state.yml` (via a `customEditors` contribution with a `filenamePattern`) and optionally for artifacts. Opening a task's state file from anywhere — the file explorer, Quick Open, a search result — renders the task console instead of YAML source. A `TextDocumentContentProvider` on a `maister:` scheme provides synthetic documents (e.g. `maister:portfolio`) for views with no backing file.

**Pros.** Deeply idiomatic: tasks become "things you open" and inherit the full editor model — tabs, split views, back/forward navigation, Quick Open, pinning, tab history. Anyone who lands on a state file by accident gets the good view instead of raw YAML, which is a genuinely elegant answer to "the editor defeats Maister's output." `TextDocumentContentProvider` virtual docs are cheap, get syntax highlighting and the built-in find widget for free, and are a good fit for "read this artifact as text but never edit it."

**Cons.** Binding to `orchestrator-state.yml` hijacks a file the user may legitimately want to inspect as YAML (mitigable with `Reopen With…`, but it is friction, and Maister's own troubleshooting sometimes requires reading that file raw). No always-visible surface: live monitoring in a tab that can be buried behind code tabs is a poor fit for Marek's primary job. The portfolio view has no natural file to bind to, so it needs a synthetic scheme, making the model half-consistent. Custom editors carry the same webview costs as A2/A3 without the tree's cheap navigation. Task discovery still needs *some* list surface.

**Personas.** A nice complement for all three, a weak spine for any. Marek's live monitoring specifically argues against it.

## Recommendation — Area A

**A2 (Tree + reusable webview panel)**, optionally adopting A4's custom-editor binding later as an *entry point* rather than a spine.

The reasoning is that the universal floor forces a webview somewhere (A1 cannot render documents), and the live-monitoring primary job forces an always-visible surface (A4 cannot guarantee one). A2 is the only option that satisfies both without rebuilding the tree in HTML (A3's cost). It also degrades gracefully: if the webview is slow to build, the tree alone is already useful, which makes A2 the option with the best partial-delivery story.

**Coupling.** A1 is incompatible with B2/B3/B4 — choosing A1 forces B1 and accepts failing the floor. A3 and A4 both require B2 or B3. E2 (host the real dashboard) requires a webview and therefore rules out A1.

---

# Decision Area B — Artifact Rendering Strategy

*How markdown artifacts and Maister's 13 self-contained HTML companions get displayed rendered rather than as source.*

The hard facts: VS Code webviews enforce a `Content-Security-Policy` with a per-load nonce. Inline `<style>` is permitted when the CSP grants `style-src 'unsafe-inline'` (common and acceptable). Inline `<script>` requires a matching nonce attribute. Dynamically injected `<script src="…">` — exactly what `dashboard.html` does to load `dashboard-data.js` — is blocked. Any local resource referenced by the webview must go through `webview.asWebviewUri()` and lie under a declared `localResourceRoots`. Links to other files need either rewriting to `asWebviewUri` or conversion to `command:` URIs (which require `enableCommandUris`).

## B1 — Delegate to VS Code's Built-In Rendering

**How it works.** Markdown artifacts open via `vscode.commands.executeCommand('markdown.showPreview', uri)` or `markdown.showPreviewToSide`. HTML companions open through `vscode.env.openExternal` (system browser) or the Simple Browser extension (`simpleBrowser.show`). The extension contributes nothing to rendering.

**Pros.** Zero rendering code. VS Code's markdown preview is excellent, theme-correct, accessible, supports the find widget, sync-scrolls with the source, and users already know it. It also honours workspace markdown extensions (Mermaid plugins, etc.) the user may already have. HTML companions open in a real browser where they work exactly as designed — they are, after all, built to be self-contained browser documents.

**Cons.** Directly contradicts the GitLens self-sufficiency property, which is the user's named reference model. Ada's stated pain is "the editor renders my report as source" and the answer here is "open it in Chrome instead" — better than source, but it is a jump out of the editor, which is the thing the product exists to avoid. No control over presentation: no § 7 block pinned, no breadcrumb into sibling artifacts, no deep-linking from a decision in the tree to an anchor in the doc. Markdown preview shows the artifact as a document but gives no task context around it.

**Personas.** Adequate for Marek (he tolerates tool-switching). Fails Ada's central requirement in spirit. Neutral for Irena.

## B2 — Render Markdown In-Extension into the Webview

**How it works.** The extension host bundles a markdown parser (`markdown-it`, ~100KB, plus GFM table and task-list plugins to handle the `- [ ]` / `- [x]` / `- [~]` checkboxes in `implementation-plan.md`). On request, it reads the file, parses it to HTML, sanitises it, rewrites relative image and link URLs (`asWebviewUri` for images under `localResourceRoots`; `command:maister.openArtifact?…` for sibling `.md` links so navigation stays inside the panel), and posts the HTML to the webview. Webview CSS is written against `--vscode-editor-background`, `--vscode-textLink-foreground`, `--vscode-font-family`, and the `.vscode-light` / `.vscode-dark` / `.vscode-high-contrast` body classes.

**Pros.** Full control. The § 7 block can be hoisted out of the body and pinned as a header card, satisfying Ada and Irena's shared requirement directly. Sibling links become in-panel navigation, which is what makes the extension self-sufficient. Anchors allow deep-linking from a tree decision node straight into the relevant heading (Irena's "aggregate straight to artifact" journey). Theming with VS Code CSS variables is reliable and cheap. Checkbox parsing gives real per-step progress from `implementation-plan.md` for free.

**Cons.** Re-implements what VS Code already does well, and will be worse at the margins (no Mermaid, no math, no user's preferred plugins) unless more is bundled. Sanitisation and link rewriting are correctness-sensitive: a missed case either breaks navigation or opens a small injection surface from model-authored content. Bundle size and a cold-start parse cost. Long artifacts need chunking or virtualisation to stay responsive.

**Personas.** Serves all three; the primary enabler for Ada.

## B3 — Re-Host Maister's HTML Companions Inside the Webview

**How it works.** For the 13 artifact kinds that have `.html` companions, read the companion, and run a rewrite pass before injecting: add a nonce to any inline `<script>` (or strip scripts entirely, since the companions are largely static apart from `<details>` which is pure HTML), rewrite relative `href`/`src` to `asWebviewUri` or `command:` URIs, and emit a CSP that permits inline styles. Inject either directly into the panel's document or into a sandboxed `<iframe srcdoc>` inside it.

**Pros.** Reuses real, maintained, already-good design work — the companions have a fixed skeleton (breadcrumb, badge header, stat tiles, TL;DR, TOC, main) that is exactly the presentation the product wants. Stat tiles and severity badges arrive free. Fidelity to what Maister intended, and it stays correct as Maister evolves its companion style. Cheapest path to a genuinely rich reading surface.

**Cons.** The companions hardcode their own light/dark palette via `prefers-color-scheme`, which will *not* match the user's VS Code theme — a companion will render light in a dark editor if the OS is light. That is a visible quality defect, fixable only by overriding their CSS variables (brittle, since the variable names are a convention not a contract). Older tasks carry older companion styles, so the reading experience is inconsistent by task age. `html_output: false` removes companions entirely, so this path needs B2 as a fallback regardless. An `<iframe srcdoc>` isolates styling nicely but then the outer panel cannot easily read the iframe's scroll position, anchors, or intercept its links.

**Personas.** Strong for Ada when companions exist. Unreliable as a sole strategy because of the `html_output: false` degraded mode that Phase 2 declared normal.

## B4 — Structured Extraction Instead of Document Rendering

**How it works.** Do not render documents as documents. Parse each artifact into a structured model — § 7 TL;DR / Key Decisions / Risks, plus per-kind structures (`spec.md`'s fixed section set, `implementation-plan.md`'s task groups and checkboxes, verification verdict glyphs, `design-context/INDEX.md`'s ID table, `work-log.md`'s timestamped entries) — and render native-feeling components from that model: decision cards, a findings table, a checklist with progress. Offer "open full document" as an escape hatch to B1 or B2.

**Pros.** The most *product-like* option: information designed for the reader rather than transcribed. Makes cross-task aggregation possible almost for free, because everything is already structured (Irena's roll-up is a query over the same model). Search over decisions and risks becomes a first-class facet. Small payloads — a decisions list is kilobytes where a rendered report is hundreds.

**Cons.** Maximum coupling to schemas that Phase 1 established are prose followed by an LLM, not enforced contracts. Every per-kind parser is a maintenance liability that silently degrades as Maister drifts. Anything not modelled becomes invisible, which risks the plugin *hiding* content — the opposite of the product's purpose. The § 7 contract explicitly exempts `work-log.md`, raw mockups, and screenshots, so an escape hatch is mandatory anyway. Highest total build cost of the four.

**Personas.** Excellent for Irena and for Ada's skim-first behaviour; risks frustrating Marek, who needs the full verification report verbatim to judge it.

## Recommendation — Area B

**B2 as the spine, with B3 for companions where they exist and B4 applied narrowly to the § 7 block only.**

Concretely: parse the § 7 TL;DR / Key Decisions / Risks out of every markdown artifact and pin it as a structured header (B4, but limited to the one structure Phase 1 identified as guaranteed across all workflows); render the remaining body with `markdown-it` (B2); and when a `.html` companion exists and the user asks for the styled version, re-host it with the rewrite pass (B3). This ordering means the degraded `html_output: false` mode is the *default* path rather than a fallback, which matches Phase 2's finding that degraded modes are normal.

B4 in full is rejected as a spine for its schema-coupling risk, but its narrow application is unavoidable — the § 7 block must be extracted to be surfaced, and that is the universal floor.

**Coupling.** B2, B3, and B4 all require a webview, so all three foreclose A1. B1 is the only rendering option compatible with A1, and choosing B1 means accepting a failure of the universal floor. B3's viability is a function of E — if E2 (host the real dashboard) is chosen, the same rewrite machinery serves both, making B3 nearly free.

---

# Decision Area C — Data Layer & Indexing

*How tasks are discovered, parsed tolerantly, cached, watched, and searched at a scale of hundreds.*

Constraints from Phase 1 and 2: no registry (discovery is `workspace.findFiles('.maister/tasks/*/*/orchestrator-state.yml')`), model-authored YAML with confirmed structural drift, `dashboard-data.js` is JS not JSON, resume logic can *shrink* `completed_phases`, and search must span metadata, decisions/risks, full text, and structured facets.

## C1 — Lazy, In-Memory Only

**How it works.** On activation, `workspace.findFiles` locates state files; nothing is parsed. A `Map<taskPath, TaskState|undefined>` is populated on demand as tree nodes expand or a task is opened. A single `FileSystemWatcher` on `**/.maister/tasks/**` invalidates entries. Nothing persists between sessions. Search is metadata-only over whatever happens to be loaded, plus a filename match.

**Pros.** Simplest correct thing. No staleness bugs, no invalidation logic beyond "drop the entry," no persistence format to version, no migration when Maister changes shape. Instant activation regardless of task count. Memory proportional to what the user actually looked at.

**Cons.** Fails success criterion 3 (recall in seconds) — you cannot filter or sort by status, type, verification outcome, or staleness without having parsed everything, so any portfolio view forces a full parse anyway. Irena's view is impossible. First-use-per-session latency on every list operation. Full-text search is simply absent.

**Personas.** Adequate for Marek's single-live-task focus. Fails Ada's orientation and Irena's portfolio entirely.

## C2 — Two-Tier Index: Eager Metadata, Lazy Bodies, Persisted

**How it works.** Tier 1 is a metadata index: on activation, glob the state files and parse *only* the cheap fields (`task.title/type/status/tags/priority`, `orchestrator.created/updated/completed_phases`, verification verdict, artifact registry entries). Persist that index as JSON in `ExtensionContext.storageUri`, keyed per workspace, with each entry stamped by the state file's `mtime` and `size`; on next activation, re-stat the files and re-parse only what changed. Tier 2 is artifact bodies: parsed lazily on open, cached in memory with an LRU bound, never persisted. `FileSystemWatcher` with three handlers — `onDidCreate` (new task or artifact), `onDidChange` (re-parse that one state file, debounced ~250ms to absorb Maister's full-file rewrites), `onDidDelete` (evict). Search operates over tier 1 plus the § 7 blocks, which are cheap enough to include in tier 1 if parsed at index time (reading the first ~40 lines of each artifact rather than the whole file).

**Pros.** Directly sized to the stated needs. Portfolio aggregation, facet filtering, staleness ("quiet for N" is just `now - mtime`), and decisions/risks search all work off tier 1. Persistence makes second-and-later activations near-instant, which matters for an extension the user opens every day. The mtime/size stamp is a cheap, reliable invalidation key. Debounced watching handles the fact that `dashboard-data.js` and `orchestrator-state.yml` are rewritten in full at every phase boundary. Bounded memory.

**Cons.** A persisted index is a cache, and caches go wrong — a schema version stamp is required so an extension upgrade discards rather than misreads the old shape. Tier-1 parse of hundreds of state files on cold start is real work (YAML parsing dominates); it must run off the activation path, with the tree showing a loading state, or activation is slow. Does not deliver true full-text search over artifact bodies. Two cache layers with different lifetimes is more moving parts than C1.

**Personas.** Serves all three. The only option that makes Irena's portfolio view affordable.

## C3 — Full Inverted Index in the Extension Host

**How it works.** C2's tier 1, plus a background job that reads every markdown artifact in every task and feeds it into an in-process search library (`minisearch`, `lunr`, or `flexsearch`), with field boosting so titles and § 7 decisions outrank body prose. The index is serialised alongside the metadata index and rebuilt incrementally on watcher events.

**Pros.** The only option that delivers all four stated search modes in one place with one ranking model — a query can combine "type:development", "verdict:failed", and free text, which is exactly the compound question Irena and Marek both ask. Fuzzy and prefix matching, relevance ranking, and snippet highlighting are library features rather than bespoke work. Fully offline and independent of the workspace's other tooling.

**Cons.** The single largest cost item in the whole design. Reading every artifact in hundreds of tasks is tens of megabytes of I/O and a multi-second background job; the serialised index may be larger than the source data. Incremental update correctness is genuinely hard (delete-then-reinsert per document, with document identity surviving renames). Memory resident in the extension host, which is shared with every other extension. Substantially duplicates ripgrep, which VS Code already ships and which is faster than any JS index at brute-force matching.

**Personas.** Best possible search for all three; hardest to justify for a first release.

## C4 — Delegate Full-Text to VS Code / ripgrep, Keep Metadata In-Extension

**How it works.** C2's tier 1 for metadata and facets. For free-text, either call `workbench.action.findInFiles` with `filesToInclude` scoped to `.maister/tasks/**` (hands the user off to VS Code's search panel) or, for results rendered inside the extension, spawn the bundled ripgrep binary as a child process against the tasks tree and parse its JSON output into the extension's own result list, then join each hit back to its task via the path.

**Pros.** Full-text search for near-zero build cost and better raw performance than any JS index — ripgrep over a few hundred megabytes is milliseconds. No index to build, persist, invalidate, or version; results are always current by construction. The path-to-task join is trivial because the directory layout *is* the identity. Composes cleanly with tier-1 facets: filter tasks by facet first, pass the surviving directories to ripgrep as its search scope.

**Cons.** Spawning VS Code's vendored ripgrep is an undocumented, unsupported path (`vscode-ripgrep` location varies by platform and version) — the supported alternative is handing the user to the search panel, which breaks self-sufficiency. No relevance ranking, no fuzzy matching, no field boosting; it is substring matching over raw markdown, so hits land on syntax as often as on meaning. Cannot rank a § 7 decision above a passing mention in a work log.

**Personas.** Good enough for Marek's "that migration from two months ago." Weaker for Ada, who searches by concept rather than by string.

## Recommendation — Area C

**C2, with C4 as the full-text answer for the first release and C3 held as a later upgrade.**

C2 is non-negotiable — every persona requirement above the single-task level depends on a metadata index existing. For free text, C4's cost/benefit is overwhelming at first-release scale, and the facet-first-then-grep composition (narrow by type/status/verdict in tier 1, then text-search only the surviving directories) makes ripgrep's lack of ranking much less painful, because the candidate set is already small. C3 becomes worth its cost only if usage shows people searching the whole corpus by concept rather than by remembered phrase.

**Coupling.** C is largely independent of A and B — it sits behind both. It is coupled to D: D3's portfolio-first home requires C2's eager tier 1 at activation, whereas D1 and D4 can tolerate C1's laziness. It is coupled to E4: if `dashboard-data.js` is used as the tier-1 fast path, tier-1 parse cost drops substantially, because 3.5KB of near-JSON parses far faster than a full state YAML.

---

# Decision Area D — Navigation Model

*How the three personas move between portfolio, task, phase and artifact, and how affinity, ownership, staleness and verification outcome are exposed.*

## D1 — One Tree, Grouping Switcher

**How it works.** A single `TreeView` whose root level is determined by a grouping mode the user picks from the view's title menu (`menus.view/title` with a `when` clause on a context key): group by workflow type, by status, by owner (git-derived), or flat by recency. Beneath the grouping node: task → phase → artifact. Facets that are not the active grouping appear as `TreeItem.description` text and `FileDecorationProvider` badges. A separate filter command sets context keys that the provider reads.

**Pros.** One mental model, one component, minimal chrome. Grouping switchers are a familiar VS Code idiom (the SCM and Testing views both do it). Workflow-type affinity is served directly by making "group by type" the default and remembering the user's collapse state per group, so Ada's `product-design` group stays open and `development` stays closed. Cheap and fully accessible.

**Cons.** One dimension at a time — you cannot see "grouped by type, sorted by staleness, filtered to failed verification" without stacking a filter UI onto the grouping switcher, and tree title bars have room for perhaps three actions. The live-run surface competes with the browse surface in the same tree: during a run Marek wants phase detail expanded, while Ada wants a flat recent list, and one tree cannot be both. Aggregate counts have nowhere natural to live except group-node labels.

**Personas.** Good for Marek and Ada individually, awkward when both needs are active. Thin for Irena.

## D2 — Three Surfaces: Now / Browse / Task

**How it works.** Three distinct surfaces with distinct jobs.
- **Now** — a compact always-visible tree view (or webview view) showing only tasks with recent write activity: current phase, elapsed, last decision recorded, artifacts as they land. Driven by `FileSystemWatcher` events, not polling. Empty when nothing is running, which is honest.
- **Browse** — the portfolio: filterable, facetable list of all tasks with type, status, verdict, owner, and "quiet for N days". Lives in a second tree view, escalating to the webview panel when the user wants roll-up tiles and counts.
- **Task** — the reusable webview panel from A2: one task's header, phase timeline, § 7 block, decisions, risks, artifacts, and rendered artifact bodies.

Movement is always Now→Task or Browse→Task; Task is the terminal surface and the only place documents render.

**Pros.** Maps one-to-one onto the jobs Phase 2 identified: primary (what's happening now), secondary (orientation and recall), and the reading act itself. Each surface is optimised for its job rather than compromised across three. Marek lives in Now, Ada in Browse, Irena in Browse's roll-up, and all three converge on the identical Task surface — which is exactly the Phase 3 principle that reading someone else's task uses the same view as reading your own. "Now" being empty when nothing runs is a clean expression of the never-assert-what-you-cannot-observe constraint: it shows write activity, not inferred running-ness.

**Cons.** Three surfaces is more chrome, more sidebar real estate, and more to explain. Now and Browse overlap — a live task appears in both, and users must learn why. Risk of the Now view being permanently empty for users who do not run workflows (Irena), making a third of the UI dead weight for them. More `package.json` view contributions and more state to keep in sync.

**Personas.** Serves all three with the least compromise; the empty-Now problem is Irena-specific and mitigable by collapsing it by default when it has been empty.

## D3 — Portfolio Dashboard as Home

**How it works.** The extension opens to a webview portfolio: status counts, type distribution, in-flight tasks, stalled tasks, failed verifications, recent completions — tiles and lists. Everything is reached by drilling from there. The tree, if present at all, is a secondary navigation aid.

**Pros.** Strongest orientation story and the most immediately impressive surface. Directly delivers Irena's journey step one. Aggregate-to-artifact drill-down is the natural gesture rather than a bolted-on path. Makes the extension feel like a product rather than a file browser, which is the vision's framing.

**Cons.** Inverts the priority Phase 2 established — live monitoring is the *primary* job and this makes it a tile on a dashboard. Marek does not want a portfolio; he wants one task, live. Requires C2's full eager index at activation before anything is visible, so cold start is the worst of the four. A dashboard is the surface most likely to show numbers the underlying data cannot honestly support (throughput, duration, "abandoned"), running straight into constraint 4.

**Personas.** Excellent for Irena. Acceptable for Ada. Poorly aligned with Marek and with the stated primary job.

## D4 — Command-Palette and Quick-Pick Centric

**How it works.** Navigation is primarily keyboard: `Maister: Go to Task` opens a `QuickPick` with fuzzy matching over the metadata index, `QuickPickItem.description`/`detail` carrying type, status and § 7 TL;DR, and `QuickPickItem.buttons` for actions. `Maister: Find Decision` searches decisions and risks. A minimal tree shows only the live run. Selection opens the Task panel.

**Pros.** Fastest possible recall for anyone who has internalised it, and very cheap to build — `QuickPick` gives fuzzy matching, filtering, and rendering for free. Genuinely excellent for "that migration from two months ago." Scales to thousands of tasks without any UI work. Minimal screen real estate.

**Cons.** Discovery-hostile: nothing is browsable, so you must know roughly what you are looking for. Ada's morning journey — "what is worth reading among hundreds of tasks" — is exactly the question a Quick Pick cannot answer. No aggregation, no portfolio, no ambient awareness. Suits code-first users, and the vision's target audience is explicitly not code-first.

**Personas.** Strong for Marek. Weak for Ada. Fails Irena.

## Recommendation — Area D

**D2 (Now / Browse / Task)**, with D4's Quick Pick added as an accelerator layered on top rather than as a model.

D2 is the only model that respects the priority ordering Phase 2 fixed (live monitoring primary, orientation secondary) while still giving Irena a real aggregation surface, and it embodies the Phase 3 principle of one identical reading experience by making Task the single terminal surface. D3's portfolio content is not rejected — it becomes a mode of the Browse surface rather than the application's front door. D4 costs almost nothing to add once C2's index exists and materially improves Marek's recall, so it should ship as commands even in a first release.

**Coupling.** D2 and D3 both require A2 or A3 (a webview for the Task and roll-up surfaces). D1 and D4 are the only models compatible with A1. D3 requires C2's eager tier 1; D4 works with C1 but is much better with C2.

---

# Decision Area E — Relationship to Maister's Existing `dashboard.html`

*Reuse, adapt, reimplement, or ignore — and whether to render `dashboard-data.js` or parse `orchestrator-state.yml` directly.*

Facts: `dashboard.html` is 615 lines / 32.6KB, fully self-contained, copied verbatim into each task root and therefore pinned to the Maister version that created the task. It loads data by injecting `<script src="dashboard-data.js?t=…">` — blocked by webview CSP — and polls every 5 seconds. `dashboard-data.js` is `window.MAISTER_DATA = {…};`, a lossy projection, absent when `html_output: false`.

## E1 — Ignore It Entirely

**How it works.** Parse `orchestrator-state.yml` with a YAML library (`yaml` or `js-yaml`) behind a tolerant adapter that normalises the known hazards: `phase_summaries` keyed semantically vs `phase-N`, `options` at two nesting levels, `clarifications` being a list where siblings are maps, unknown extra fields preserved and ignored. Build the extension's own UI from scratch.

**Pros.** One source of truth, no lossy projection, no dependence on `html_output`. Access to everything the state file holds, including the domain extension blocks (`task_context.task_characteristics`, `design_context.design_characteristics`, `migration_context.breaking_changes`, `performance_context.bottleneck_priorities`) that `dashboard-data.js` flattens away. Freedom to design for VS Code's idioms rather than inheriting a browser document's. No coupling to a Maister asset that changes underneath the extension.

**Cons.** Discards genuinely good, maintained design work and guarantees visual divergence between the plugin and the dashboard the user already knows. Full YAML parse per task is the expensive path for the tier-1 index. Every future addition Maister makes to the dashboard must be re-implemented rather than inherited.

## E2 — Host the Real `dashboard.html` in a Webview

**How it works.** Read the task's own `dashboard.html`, apply a rewrite pass: replace the dynamic `<script src>` data loader with an inline nonce'd bootstrap that receives `MAISTER_DATA` by `postMessage`, nonce the remaining inline script, rewrite relative artifact `href`s to `command:` URIs, and emit a compatible CSP. Replace the 5-second poll with watcher-driven pushes.

**Pros.** Perfect fidelity to Maister's intent, including `HERO_MAP`, the decisions/risks drawers, expanded-state preservation, and verification rendering — a large amount of working UI for a modest rewrite pass. Automatically inherits dashboard improvements from future Maister versions. Fastest path to a credible task detail view.

**Cons.** The rewrite pass depends on the internal structure of a file the extension does not own; any change to how the dashboard loads data breaks it silently, and there is no contract preventing that. Each task holds a *different vintage* of the file, so the extension must handle N structural variants and the user sees inconsistent UI across task ages. The dashboard styles itself with `prefers-color-scheme`, not VS Code theme variables, so it will clash with the editor theme. `html_output: false` removes it. It is a single-task document with no concept of portfolio, so E2 answers only one of the product's three surfaces. Its accessibility is unaudited against the project's frontend standard.

## E3 — Reimplement the Dashboard's Visual Language Natively

**How it works.** Treat `dashboard.html` as a design reference — as Phase 2 explicitly framed it. Adopt its information architecture (phase timeline with status, hero artifacts per type via an equivalent of `HERO_MAP`, decisions and risks in drawers, verification section, `icon_hint` → codicon mapping) and re-express it in the extension's own webview using VS Code theme variables, VS Code-idiomatic controls, and the project's frontend standards. Source data is the state file (E1's parser).

**Pros.** Keeps the good structural decisions while shedding the constraints of a file-protocol browser document. Theme-correct, accessible to the project's own standard, consistent across task ages, and works with `html_output: false`. Extends naturally to the portfolio and Now surfaces, which E2 cannot. `HERO_MAP` in particular is a cheap, high-value idea worth copying outright — it is the answer to Marek's "twenty files with no signal about which matters."

**Cons.** Build cost, and ongoing drift from Maister's dashboard as it evolves — two implementations of the same idea diverging over time. Requires judgement calls the original already made (which artifacts are heroes for each of the five types), and getting those wrong is directly user-visible.

## E4 — `dashboard-data.js` as the Fast Path, YAML as the Fallback

**How it works.** Orthogonal to E1–E3: a data-source decision. When `dashboard-data.js` exists, extract its object with a bounded regex from `window.MAISTER_DATA =` to the trailing `;` and `JSON.parse` the result, falling back to a sandboxed evaluation (`vm` module with no globals, never bare `eval`) if it is not strict JSON. When it is missing or unparseable, fall through to the YAML parser. Keep both behind one interface so callers never know which fired.

**Pros.** A 3.5KB near-JSON parse is dramatically cheaper than a full state YAML parse, which matters directly to C2's cold-start cost over hundreds of tasks. Its schema is flatter, already normalised (`phases[]` with `id/name/status/summary/decisions/risks/artifacts/gate`), and free of the `phase_summaries` keying inconsistency — it is the *easier* shape to consume. Maister rewrites it at every meaningful state change, so freshness is equivalent for monitoring purposes.

**Cons.** Lossy — the domain extension blocks and anything the projection drops are simply unavailable, so the fallback path is not optional and both parsers must exist and be kept in agreement. Absent entirely under `html_output: false`. Executing model-authored JavaScript, even sandboxed, is a real risk surface that must be handled by strict extraction plus `JSON.parse` first, treating `vm` evaluation as a reluctant last resort. Two code paths means two sets of bugs and a subtle class of "works on my task" failures.

## Recommendation — Area E

**E3 for presentation, E4 for data acquisition, with E1's tolerant YAML parser as the mandatory foundation beneath both.**

E2 is tempting and is the fastest route to a good-looking task view, but it fails on three counts that matter more than speed: theme clash with the editor (visible quality defect, every session), per-task version drift (inconsistent UI by task age), and its inability to serve the portfolio and Now surfaces. Phase 2 already framed the dashboard as "a design reference, not a droppable asset," and E3 is that framing carried through.

E4 is worth taking for the index fast path specifically, but only with `JSON.parse`-first extraction and a hard requirement that the YAML path be complete and independently correct — never a degraded stub. If the cold-start measurement shows YAML parsing is not actually a bottleneck at the target scale, E4 should be dropped as unnecessary complexity under the project's minimal-implementation standard.

**Coupling.** E2 requires a webview (rules out A1) and shares its entire rewrite machinery with B3, making the pair much cheaper together than either alone. E4 materially improves C2's cold-start budget. E1's parser is required regardless of any other choice.

---

# Cross-Area Coupling Summary

| If you choose… | You foreclose… | Because |
|---|---|---|
| A1 (tree-first) | B2, B3, B4; D2, D3; E2 | No webview exists to render documents or roll-ups in |
| B1 (delegate rendering) | The self-sufficiency property | Reading always leaves the extension's surface |
| B3 (re-host companions) | Nothing, but requires a B2 fallback | `html_output: false` removes all companions |
| C1 (lazy, in-memory) | D3; most of Irena's requirements | Facets and roll-ups need an index that exists before you look |
| D3 (portfolio home) | The stated primary job ordering | Live monitoring becomes a tile |
| E2 (host the dashboard) | A1; consistent theming; portfolio reuse | Needs a webview; styles itself outside VS Code's theme; is single-task by construction |

Two pairs are cheaper together than apart: **B3 + E2** share one HTML rewrite pass, and **C2 + E4** share one parse pipeline.

---

# Scope Guardrails

The two largest cost drivers identified across Phases 1–3 are **full-text search** (four search modes at once, over hundreds of tasks) and **portfolio aggregation** (every roll-up computed by globbing and parsing, with no Maister support). Both are deferrable. Neither is in the universal floor.

## Minimum viable — the spine that satisfies the floor

- **A2** tree + one reusable webview panel.
- **B2** in-extension markdown rendering, with the **§ 7 block extracted and pinned** (the narrow B4).
- **C2 tier 1 only** — metadata index, persisted, watcher-invalidated. No full-text.
- **D2's Now and Task surfaces** — Browse present as a flat, type-filterable list without facets or roll-up.
- **E1 + E3's `HERO_MAP` idea** — tolerant YAML parser plus per-type hero artifacts. No `dashboard-data.js` fast path.
- Workflow launching by composing `/maister:*` and sending to the integrated terminal via `Terminal.sendText` — cheap, and central to two personas.

This clears all four success criteria except "recall in seconds," which it partially clears via type/status/recency filtering and title matching.

## First release — the credible increment

Add to the spine:
- **C4** free-text search, facet-narrowed first (Browse filters reduce the candidate set, then text-match within it). Ship whichever ripgrep strategy proves robust; if spawning the vendored binary is unreliable, ship search over the indexed § 7 blocks only and state that limitation plainly in the UI.
- **B3** companion re-hosting for the 13 artifact kinds that have companions, behind an explicit "styled report" affordance, with B2 as the default.
- **Staleness and verification outcome** as tier-1 facets — both are nearly free once tier 1 exists, and they are what Irena needs most.
- **D4 Quick Picks** (`Go to Task`, `Find Decision`) — very cheap on top of tier 1, large recall gain.

## Expansive — defer and justify with usage

- **C3** full inverted index with ranking and fuzzy matching.
- **D3's** full portfolio dashboard with counts, distributions, and drill-down tiles.
- Throughput and duration metrics — these depend on model-authored timestamps that Phase 3 flagged as possibly missing or malformed in older tasks, and they are the single easiest place to violate constraint 4 by asserting what cannot be observed.
- **E2** hosting the real dashboard — only worth revisiting if E3's reimplementation proves to drift badly from Maister's evolving output.
- Git-derived attribution — genuinely useful to Irena, but it is a `git log` child process per task directory, it fails for uncommitted tasks, and it attributes to the committer rather than the operator. It belongs after the floor is solid.

## Explicit non-goals restated

Repository/git change viewing as a browsable surface, any write to task files or `orchestrator-state.yml`, and answering orchestrator gates from the UI all remain out of scope per Phase 2. No alternative above crosses those lines; anything that appears to (attribution via git) is a data source only.
