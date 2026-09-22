# Design Decisions — Maister Viewer VS Code Extension

## TL;DR
The extension combines sidebar tree views with one reusable webview panel, plus a compact Overview webview view. The sidebar stacks two natively collapsible views, **Now** and **Overview** (counts, filters and the task list; Browse merged in at Phase 7), and the panel switches between **Task** and **Dashboard** modes.
Task mode hosts each task's own Maister `dashboard.html`, unmodified in styling, loading its own data natively inside the webview sandbox, with links intercepted for in-panel navigation. Tasks with no hostable dashboard get a minimal native summary instead.
A tolerant `orchestrator-state.yml` parser powers everything else: Now, Overview, Dashboard mode, and a persisted two-tier index of metadata plus the TL;DR/decision/risk blocks.
Artifacts render in-extension as markdown with the TL;DR block pinned. Maister's styled HTML companions open on request. Full-text search over artifact bodies is deferred.

## Key Decisions
- A2 presentation (tree + reusable webview panel), extended with a sidebar Overview webview view — the floor requires a webview and live monitoring requires an always-visible surface.
- B2 + B3 + narrow B4 rendering — markdown rendered in-extension by default, § 7 block pinned, companions re-hosted on request; the markdown-only degraded mode is the default path.
- C2 only for data — persisted metadata index including § 7 blocks, lazy bodies, no full-text search in the first release.
- D2 + D3 merged navigation — Now and Overview collapsible in the sidebar (Browse merged into Overview at Phase 7); Overview tiles filter its own task list; panel toggles Task ⇄ Dashboard; no Quick Pick accelerators. Every task carries a one-click next action.
- E2 + E1 — each task's own `dashboard.html` hosted for the Task view with Maister's styling unmodified; the tolerant YAML parser is the source for every other surface and for the native fallback Task view.

## Open Questions / Risks
- The hosted dashboard themes itself from the OS `prefers-color-scheme`, not the VS Code theme — a light dashboard can appear in a dark editor (and ignores high-contrast themes).
- Each task carries the `dashboard.html` vintage that created it; the rewrite pass must recognise every structural variant present, and an unrecognised variant silently degrades to the native fallback.
- Two Task views exist (hosted dashboard and native fallback); users must be able to tell which they are seeing and why.
- The hosted dashboard's accessibility is unaudited against the project's frontend accessibility standard and cannot be fixed without modifying it.
- Full-text search deferral narrows Phase 2's four requested search modes to three; success criterion 3 ("recall in seconds") is met for titles, metadata and decisions/risks, not for artifact bodies.
- Three distinct VS Code surface types (TreeView, WebviewView, WebviewPanel) each need their own accessibility and theming work.

---

## 1. Selected Approach

> **Revised at Phase 7 (mockup review):** the Browse tree was merged into Overview, which now also lists the filtered tasks. The sidebar is **Now + Overview**, with **Open Dashboard** as a native Overview title-bar action. Launching also became task-contextual: every task carries a **next action** (Resume · Start development · Continue from research), one click away on its row, task view and dashboard row. See feature-spec § 4 and § 7.2.

The design splits into **sidebar navigation** and **one reading panel**, with two data sources that each do what they are best at.

### Sidebar — one view container, two stacked, natively collapsible views

| View | Surface type | Job | Data source |
|---|---|---|---|
| **Now** | `TreeView` | Every unfinished task in this working copy (in progress, pending, blocked), newest activity first: current phase, last recorded decision, artifacts as they land, next action. No time cutoff (revised at Phase 7: colleagues' tasks arrive completed, so unfinished tasks are effectively the user's own). | YAML parser + `FileSystemWatcher` |
| **Overview** | `WebviewView` | Counts by status and type, attention tiles, search, and the **filtered task list** grouped by type (the former Browse), with each task's next-action button. The title-bar action opens Dashboard mode in the panel. | Tier-1 index |

VS Code persists each user's collapse state per view, so the layout adapts: Marek collapses Overview and lives in Now; Irena keeps Overview expanded; Ada uses Overview tiles as her daily starting point.

### Panel — one reusable `WebviewPanel`, two modes

- **Task mode** — hosts the task's own `dashboard.html`. An injected shim adds the CSP nonce to the dashboard's own `<script src="dashboard-data.js">` loader, so the data file loads natively inside the webview sandbox (the extension host never parses or evaluates it); watcher-driven refresh signals trigger immediate re-renders; artifact link clicks are intercepted so they navigate *within the panel*, where the artifact renders. *(Refined in Phase 6, feature-spec § 5.3 — originally specified as data fed by `postMessage`, which would have required parsing a non-JSON JavaScript literal in the extension host.)*
- **Artifact rendering (within Task mode)** — markdown rendered in-extension with the § 7 block extracted and pinned as a header card; a "styled report" affordance re-hosts the `.html` companion where one exists.
- **Native fallback Task view** — for tasks with no hostable dashboard (`html_output: false`, or an unrecognised dashboard vintage): header, phase list, § 7 decisions and risks, artifact list, all from the YAML parser. Clearly labelled as the fallback.
- **Dashboard mode** — full-width portfolio roll-up built on the tier-1 index, drilling into Task mode.

### Data

- **Tolerant YAML parser** over `orchestrator-state.yml` — the single source of truth for every surface except the hosted dashboard's own rendering. Normalises the known drift (semantic vs `phase-N` summary keys, `options` at two nesting levels, list-where-map-expected, unknown fields preserved).
- **Tier-1 index** — task metadata plus the § 7 block of every artifact (first ~40 lines read), persisted in extension storage, invalidated per file by `mtime` + `size`, with a schema version stamp. Rebuilt off the activation path behind a loading state.
- **Tier-2** — artifact bodies parsed on open, held in a bounded in-memory cache, never persisted.
- **`dashboard-data.js`** is loaded only by the hosted dashboard itself, inside the webview sandbox — never parsed by the extension and never an index source. The extension only stats it to track activity.

## 2. Decisions by Area

### A — Presentation Architecture → **A2, extended**

**Chosen:** tree views for navigation and live state, one reusable webview panel for reading. Extended during Area D convergence with a compact `WebviewView` (Overview) in the sidebar.

**Rationale:** the universal floor (rendered reading) requires a webview somewhere, ruling out A1. The primary job (live monitoring) requires an always-visible surface, ruling out A4 as a spine. A2 meets both without rebuilding tree behaviour in HTML (A3's cost), and degrades gracefully — the trees are useful on their own.

**Rejected:** A1 (fails the floor), A3 (narrow sidebar, rebuilds free tree behaviour), A4 (no always-visible surface; may be added later as an extra entry point).

### B — Artifact Rendering → **B2 + B3 + narrow B4**

**Chosen:** in-extension markdown rendering (`markdown-it` with GFM tables and task-list checkboxes, sanitised, links rewritten) as the default; the § 7 TL;DR / Key Decisions / Open Questions block extracted and pinned as a structured header; the `.html` companion re-hosted through a CSP rewrite pass on explicit request.

**Rationale:** makes the markdown-only mode — which `html_output: false` forces — the default path rather than a fallback. The § 7 block is the one structure guaranteed across every workflow, so extracting only it avoids the schema-coupling risk of full structured extraction.

**Rejected:** B1 (breaks self-sufficiency), B3-first (theme clash and vintage inconsistency as default), full B4 (fragile per-kind parsers that can hide content), B2-only (discards Maister's styled reports).

### C — Data Layer & Indexing → **C2 only**

**Chosen:** two-tier persisted index — eager metadata plus § 7 blocks, lazy artifact bodies. No full-text search over artifact bodies in the first release.

**Rationale:** every requirement above single-task level depends on a metadata index; persistence makes daily use near-instant. Deferring full-text avoids both the inverted-index cost (C3) and the unsupported vendored-ripgrep path (C4).

**Consequence:** of Phase 2's four search modes, three ship — task lookup by metadata, decision/risk recall, faceted filtering. Full-text search is deferred.

**Rejected for now:** C1 (fails recall-in-seconds and Irena's portfolio), C3 (largest single cost), C4 (unsupported binary path or breaks self-sufficiency).

### D — Navigation Model → **D2 + D3 merged (user-originated)**

**Chosen:** Now and Overview stacked and natively collapsible in the sidebar (Browse merged into Overview at Phase 7); Overview tiles and search filter Overview's own task list; panel toggles between Task and Dashboard (plus Risks mode, added at Phase 7). No Quick Pick accelerators.

**Rationale:** the user proposed merging the three-surface model with the portfolio dashboard so the dashboard is revealed on demand rather than being the front door. This resolves D3's core flaw (demoting live monitoring) while giving Irena a real portfolio surface and Ada an at-a-glance starting point. All three personas still converge on the identical Task surface.

**Constraint carried:** Overview and Dashboard show only observable facts — counts, verdicts, "quiet for N days" — never throughput, durations or "abandoned" in the first release.

**Rejected:** D1 (one dimension at a time; live and browse compete), D3 as home (inverts priority), D4 as model (discovery-hostile). Quick Picks declined for the first release.

### E — Relationship to `dashboard.html` → **E2 + E1 (user-originated)**

**Chosen:** host each task's own `dashboard.html` for Task mode, with Maister's styling left unmodified; the tolerant YAML parser (E1) powers Now, Overview, Dashboard mode, Risks mode, the index, and the native fallback Task view.

**Sub-decisions:**
- **Which copy:** each task's own copy — true to what that task's Maister version produced, and automatically follows Maister's evolution.
- **Theming:** left as Maister styles it (OS `prefers-color-scheme`), not mapped to VS Code theme variables.

**Rationale:** maximum fidelity to Maister's own per-task view, including `HERO_MAP`, decision/risk drawers and verification rendering, at the cost of a rewrite pass. Shares its rewrite machinery with B3 companion re-hosting.

**Consequence:** tasks with no hostable dashboard need a native fallback view built from the YAML parser.

**Rejected:** E3 (reimplementation — build cost and drift), E4 (fast path not needed since the index reads YAML directly; model-authored JS risk), bundled pinned copy and latest-from-install alternatives for the copy sub-decision.

## 3. Trade-Offs Accepted

1. **Theme inconsistency.** The hosted dashboard follows the OS light/dark setting and ignores VS Code theming, including high-contrast.
2. **Vintage handling.** The rewrite pass must recognise every `dashboard.html` version present in the repository; unrecognised versions fall back to the native view.
3. **Two Task views.** The hosted dashboard and the native fallback coexist; which one is shown must be explicit to the user.
4. **Unaudited accessibility** in the hosted dashboard, which cannot be corrected without modifying it.
5. **No full-text search** over artifact bodies in the first release.
6. **Three surface types** in the sidebar and panel, each needing separate accessibility and theming work.
7. **No keyboard Quick Pick accelerators** in the first release.

## 4. Coupling Consequences Realised

- A2 with webview-based B2/B3 keeps the universal floor intact.
- B3 + E2 share one HTML rewrite pass — nonce injection, link rewriting, CSP emission — so the pair is cheaper together than apart.
- D2 + D3 merged requires C2's eager tier 1 for Overview counts, which is the chosen data layer.
- E2 per-task copies plus `html_output: false` means the native fallback view is mandatory, not optional.

## 5. Alternatives Considered

Full detail of all twenty alternatives, their pros, cons and persona impact is in `analysis/alternatives.md` (companion: `analysis/alternatives.html`).
