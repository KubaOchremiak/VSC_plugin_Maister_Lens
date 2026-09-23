# Design Context Index

## TL;DR
Ingested from product-design task `2026-09-22-maister-viewer-vscode-plugin`: product brief, implementation-ready feature spec (§§ 1–8, AC1–AC18), design decisions, personas, Maister data inventory, and six approved HTML mockups (VS Code Dark+).
Mockups are binding inputs for layout, copy, field order and states.

## Sources
| File | Purpose |
|---|---|
| `brief.md` | Product brief — Maister Lens |
| `feature-spec.md` | Implementation-ready spec, acceptance criteria AC1–AC18 (§ 8.7) |
| `design-decisions.md` | Chosen direction and trade-offs |
| `design-context.md` | Inventory of Maister data (task types, state schema, artifacts, dashboard) |
| `personas.md` | Marek, Ada, Irena + requirements matrix |
| `design-resources.md` | Design-resource discovery (VS Code theming, tokens) |

## Screens / Components
| ID | Source mockup | Description |
|---|---|---|
| `screen:sidebar-now-overview` | `mockups/sidebar-now-overview.html` | Sidebar — Now tree (unfinished tasks, phase, last decision, artifacts, risks, ▶ next action) + Overview webview (search, Mine/Everyone, tiles, grouped task list) |
| `screen:task-fallback-view` | `mockups/task-fallback-view.html` | Task mode native fallback — phases, key artifacts, decisions, risks, raw state, next-action button |
| `screen:artifact-reader` | `mockups/artifact-reader-implementation-plan.html` | Artifact reader — rendered markdown, pinned summary card, checklist progress, artifact chips, HTML companion toggle |
| `screen:dashboard-mode` | `mockups/dashboard-mode.html` | Dashboard mode — 4 KPI tiles, 4 filter charts, filtered task table with Next column |
| `screen:open-risks` | `mockups/open-risks.html` | Risks mode — open risks grouped by task with source + next action; no severity/age |
| `screen:start-workflow-flow` | `mockups/start-workflow-flow.html` | Start Workflow… flow → pre-filled Claude Code prompt (target order Claude Code → Copilot → terminal → clipboard) |
| `component:hosted-dashboard` | *(not mocked — Maister's own dashboard.html hosted unmodified)* | Task mode primary view |
