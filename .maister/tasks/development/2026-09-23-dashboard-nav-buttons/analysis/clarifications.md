# Phase 1 Clarifications

## TL;DR
Placement of the "Open Dashboard" affordance was the main ambiguity — there is no "Now button" in the UI; "Now" is a sidebar tree view. The user wants a NEW sidebar view, titled "Overview", positioned first (above Now), containing navigation entries: "Dashboard" (first) and "Project" (second, opening a page not yet designed). The back link goes in BOTH task renderers and shows unconditionally.

## Key Decisions
- New first sidebar view with header "Overview" holding nav entries — user rejected a Now title-bar icon and a row inside the Now tree; wants a distinct navigation section under the MAISTER LENS container title.
- Entry 1 = "Dashboard", entry 2 = "Project" — user stated the Project page will be designed later.
- Back link in both the native fallback task view and the re-hosted `dashboard.html` task view — consistency over minimal blast radius.
- Back link shown unconditionally, mirroring the existing risks breadcrumb — avoids threading an origin field through the message security boundary.

## Open Questions / Risks
- **Name collision**: a sidebar view titled "Overview" already exists (`maister.overview`, package.json:41-52). The requested new view would produce two "Overview" headers. Needs resolution at the Phase 2 decision gate — rename one, repurpose the existing view, or pick a different title.
- **"Project" entry has no destination**: the page is explicitly "designed later". Shipping a navigation entry that opens nothing conflicts with the project's minimal-implementation standard ("no future stubs"). Decide: defer the entry, or ship it pointing at a placeholder.
- Injecting the back crumb into the hosted `dashboard.html` requires a 4th insertion in `src/panel/hostDashboard.ts`, whose header comment documents "exactly three insertions, all security plumbing". Implementation should route it through `src/webview/shim.ts` instead, which already holds the page's `acquireVsCodeApi` handle.
- VS Code always renders a collapsible section header for a contributed view; the new view cannot be truly header-less.

## Q&A

**Q1 — Where exactly should the "Open Dashboard" button go?**
Offered: Now view title bar / first row inside the Now tree / top of the Overview webview.
User: "can it be above Now just below 'Maister Lens' title in the side bar?"

**Q1b — VS Code has no container-title contribution point; which shape?**
Offered: tiny webview strip above Now (own header) / Now title-bar icon / first row in the Now tree.
User: "like in first option but call it Overview (the header). First position will be Dashboard, second will be 'Project' which will open new page which i will design later."

**Q2 — Which task renderer gets the back link?**
User: **Both renderers** — native fallback task view plus the re-hosted `dashboard.html` (shim injection).

**Q3 — Always show the back link, or only when opened from the dashboard?**
User: **Always show**, matching the unconditional risks breadcrumb.
