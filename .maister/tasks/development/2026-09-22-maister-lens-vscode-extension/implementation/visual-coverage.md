# Visual Coverage Matrix

## TL;DR
All six approved screens and the one component in `analysis/design-context/INDEX.md` are covered by at least one implementing task group, with a second structural pass in group 10 and a human comparison pass in group 11.
No screen is uncovered; nothing in the INDEX is out of scope.
Three known mockup defects are deliberately **not** reproduced and are named per screen below.

## Key Decisions
- Coverage is recorded twice on purpose: the implementing group owns the layout contract, group 10 asserts it structurally in a browser, group 11 compares it by eye — the three are different guarantees, not duplicates.
- `component:hosted-dashboard` is covered by group 6 as a *verbatim-hosting* contract, not as an implemented layout: the only permitted change is the three security insertions.
- `screen:start-workflow-flow` is a flow reference, so group 9 binds it to prompt order and copy rather than to rendered markup — there is no webview to assert.

## Open Questions / Risks
- If the group 1 A18 probe takes contingency (2), `component:hosted-dashboard` stops rendering at all and its coverage collapses into `screen:task-fallback-view`. Group 11's AC3/AC4 checklist items must be rewritten in that case.
- Four of the six mockups are declared *approximate layout* and all six render full VS Code window chrome, so there is no common DOM to diff — pixel comparison is impossible by construction and is not attempted anywhere.

---

Source: `analysis/design-context/INDEX.md`

| Screen/Component ID | Covered By Task Group(s) | Status |
|---------------------|--------------------------|--------|
| `screen:sidebar-now-overview` | **Group 5** (Now tree + Overview webview — implements), Group 10 (DOM structural), Group 11 (manual comparison) | ✅ |
| `screen:task-fallback-view` | **Group 7** (fallback view — implements), Group 10 (DOM structural), Group 11 (manual comparison) | ✅ |
| `screen:artifact-reader` | **Group 7** (render pipeline + reader — implements), Group 10 (DOM structural), Group 11 (manual comparison) | ✅ |
| `screen:dashboard-mode` | **Group 8** (Dashboard mode — implements), Group 10 (DOM structural), Group 11 (manual comparison) | ✅ |
| `screen:open-risks` | **Group 8** (Risks mode — implements), Group 10 (DOM structural), Group 11 (manual comparison) | ✅ |
| `screen:start-workflow-flow` | **Group 9** (Start Workflow flow + target chain — implements), Group 11 (manual comparison) | ✅ |
| `component:hosted-dashboard` | **Group 6** (verbatim hosting + three insertions), Group 11 (fidelity checklist item) | ✅ |

## Per-Screen Binding Detail

| ID | Implementing group | Mockup region bound | Binding strength |
|---|---|---|---|
| `screen:sidebar-now-overview` | 5 | Now section lines 318–331; Overview section lines 332–360 | Approximate layout, **exact copy and field order** |
| `screen:task-fallback-view` | 7 | lines 296–332 (banner → header → Phases → Key artifacts → Decisions → Risks → Raw state) | Approximate layout, **exact section order** |
| `screen:artifact-reader` | 7 | lines 286–320 (breadcrumb, hero chips, `<aside aria-label="Summary">` at 289, body from 299) | Approximate layout, **exact card contents** |
| `screen:dashboard-mode` | 8 | lines 322–340 (KPI row, filter chips, 2×2 chart grid 331–334, task table 336) | **Pixel-guide** for the tile/chart grid; **exact column order** |
| `screen:open-risks` | 8 | lines 323–365 (breadcrumb/heading 323, KPI tiles, filter bar, group cards 341–365) | Approximate layout, **exact field order** |
| `screen:start-workflow-flow` | 9 | lines 321–345 (type prompt 321, description input 333, target outcome 338) | Flow reference |
| `component:hosted-dashboard` | 6 | `test/fixtures/tasks/pd-real/dashboard.html` (no mockup) | **Verbatim — no restyling** |

## Defects Deliberately Not Reproduced

Carried from `spec.md` § Visual Design; each is assigned to the group that would otherwise copy it.

| Defect | Where | Owning group | Correct behaviour |
|---|---|---|---|
| `/screen/*` links are preview-server leftovers, non-navigable | all six mockups | 5, 7, 8, 9 | Not rendered at all |
| "Browse" / "from the Now or Browse title bar" wording is stale | sidebar and start-workflow mockups | 5, 9 | Browse was merged into Overview; the spec's wording wins |
| Resolved rows and the `· {n} resolved shown struck through` clause rendered while **Show resolved** is off | `open-risks.html` line 323 | 8 | Default heading is `{open} open across {k} tasks`; resolved rows and the clause appear only while Show resolved is on |
| `◈ Maister: 2 unfinished` status-bar element | `sidebar-now-overview.html` | 5 | Not implemented (A12) — the `maister.now` view badge carries the count |

## Uncovered Items

All screens covered. Every row of `analysis/design-context/INDEX.md` has at least one implementing task group.
