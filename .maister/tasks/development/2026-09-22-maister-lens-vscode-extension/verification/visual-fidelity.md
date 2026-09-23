# Visual Fidelity Report

**Mode**: Report-only — does NOT gate completion
**Comparison**: LLM-judged structural match (section order, field order, copy, control anatomy, explicit states) — not pixel diffing
**Source**: `analysis/design-context/INDEX.md`
**Captured**: `verification/screenshots/`

## TL;DR
Five of the seven INDEX entries are comparable; two are not comparable by design and were not forced.
Three screens match (`screen:artifact-reader`, `screen:open-risks`, `screen:sidebar-now-overview`'s Overview half), two carry minor deviation (`screen:task-fallback-view`, `screen:dashboard-mode`).
No substantive drift. The one genuine implementation defect surfaced here is the fallback header's missing status glyph, filed as MIN-1 in the E2E report.
`implementation/visual-coverage.md` claims every INDEX row is covered; this pass confirms that for the five webview screens and accepts its reasoning for the two that are not renderable.

## Key Decisions
- Each screen was judged against the panel/sidebar body of its mockup only — all six mockups render full VS Code window chrome, which has no counterpart in a bundle's DOM.
- The four documented mockup defects (`/screen/*` links, stale "Browse" wording, resolved rows shown while **Show resolved** is off, the `◈ Maister: 2 unfinished` status-bar element) were treated as mockup errors and never counted against the implementation.
- The four deviations already adjudicated in `implementation/work-log.md` (Dashboard's Table `<button>`, per-row title button instead of a row-wide handler, Overview's hero expander placement, the visually-hidden status word on in-progress rows) are recorded as **intentional** and excluded from the deviation counts.
- Colour and typography were not judged: outside the VS Code host every `--vscode-*` variable falls back, so the captures are near-monochrome. Palette fidelity remains the unsigned four-theme manual-checklist item.

## Open Questions / Risks
- `screen:task-fallback-view`'s missing status glyph is the one deviation that looks unintentional rather than ruled — see E2E MIN-1 before accepting it as a design choice.
- `screen:dashboard-mode`'s scope line drops the mockup's working-copy prefix. The feature spec is silent, so this is a copy decision nobody has explicitly made; it matters only in multi-root workspaces.
- Two INDEX rows (`screen:start-workflow-flow`, `component:hosted-dashboard`) can never be closed by this method. Their fidelity rests on the unsigned manual checklist and on `test/unit/hostDashboard.test.ts`'s byte-level hosting assertion.

## Summary
- Total INDEX entries: 7
- Comparable and compared: 5
- Not comparable by design: 2
- Match (✓): 3
- Minor deviation (⚠): 2
- Substantive drift (✗): 0

## Per-Screen Comparison

### screen:sidebar-now-overview (✓ Match — Overview half only)
- Mockup: `analysis/design-context/mockups/sidebar-now-overview.html` (captured as `screenshots/m1-mockup-sidebar-now-overview.png`)
- Screenshot: `screenshots/01-overview-400px.png`, `screenshots/02-overview-250px.png`, `screenshots/09-overview-filtered-markers.png`
- **Scope note**: only the Overview half is comparable. The **Now** half is a native VS Code `TreeView` (`src/views/nowTree.ts`), not a webview — it has no browser-loadable DOM and is asserted instead by `test/integration/nowTree.test.ts`. The mockup's `◈ Maister: 2 unfinished` status-bar element is a known mockup defect (A12 drops the status bar).
- Layout: single-column sidebar; section order Search → Mine/Everyone → Status → Type → Attention → Tasks → grouped list → "Show all in Dashboard" — matches the mockup exactly.
- Field order: facet tiles render `glyph · label · count`, group headers render `{group} ({count})`, rows render `glyph · title · description · ▶` — matches.
- Copy: `Tasks 5 of 230 · 2 filters` reproduces the mockup's `TASKS 5 of 230 · 2 filters` verbatim (verified by posting a filtered payload). `Show all in Dashboard` matches. The mockup's stale "Browse" wording is a known defect and is correctly absent.
- Primary actions: per-row `▶` next action present only where the task has one; completed research row renders none — matches the mockup's annotation.
- States covered: unfiltered, filtered (2 filters), row markers (`! failed verification`, `⏸ quiet 5 days`), 250 px and 400 px widths.
- Intentional deviations (already ruled, not drift): the hero expander `▸` sits between the status glyph and the title (§ 4.2 requires an expander the mockup does not draw); the status word is visually hidden on in-progress rows where the mockup shows the phase activeForm, and stays in the accessible name.

### screen:task-fallback-view (⚠ Minor Deviation)
- Mockup: `analysis/design-context/mockups/task-fallback-view.html` (captured as `screenshots/m2-mockup-task-fallback-view.png`)
- Screenshot: `screenshots/03-fallback-task-view.png`
- Layout: banner → title + next action → meta line → Phases → Key artifacts → Decisions → Risks → **All artifacts** → Raw state.
- Section order: matches the mockup for every section the mockup draws.
- **Deviation 1 (minor, and a defect)**: the mockup's meta line reads `Status: ◯ In progress`; the implementation renders `Status: In progress` with no glyph, although `FallbackPayload.statusGlyph` is populated by the host and unread by the bundle. Dashboard and Risks both draw the same value. Filed as MIN-1 (with MIN-2, a duplicated `sr-only` status word) in `e2e-verification-report.md` § 5.3.
- **Deviation 2 (minor, and correct)**: the implementation adds an **All artifacts** section between Risks and Raw state. § 5.4 specifies six sections; the mockup draws five. Group 12's adjudication #2 confirms the six-section reading. Spec wins over mockup — reported for completeness, not as a fault.
- Field order: type badge → Status → Author → Verification → Created · updated → parse-issue anchor — matches the mockup exactly, including the anchor into Raw state.
- Copy: banner text, `Verification: none yet`, `Created … · updated …`, `orchestrator-state.yml and 1 parse issue` all match.
- Control anatomy: `▶ Resume` sits in the header beside the title, as drawn; the Risks `<h2>` is additionally a button into Risks mode (§ 5.7 entry point, step 8.7) — an addition the mockup does not show.
- States covered: default with a next action and a parse issue; phase rows in Completed and Current; risks open-first with a resolved row struck through and labelled.

### screen:artifact-reader (✓ Match)
- Mockup: `analysis/design-context/mockups/artifact-reader-implementation-plan.html` (captured as `screenshots/m3-mockup-artifact-reader.png`)
- Screenshot: `screenshots/04-artifact-reader.png`
- Layout: skip link → breadcrumb → hero chips → pinned summary card → document body — matches the mockup's order exactly.
- Field order inside the card: TL;DR paragraph → Key decisions → Open questions & risks → checklist line as the card's last child — matches the mockup, which is what settled group 7's flagged ambiguity.
- Copy: `Skip to document`, `← {task} › {artifact}`, `TL;DR`, `Key decisions`, `Open questions & risks`, `Checklist: 2 of 5 done · 1 skipped` — all match (the mockup's `KEY DECISIONS` / `OPEN QUESTIONS & RISKS` caps are a CSS transform, not different copy).
- Control anatomy: hero chips are buttons with `aria-pressed` on the current artifact — matches the mockup's annotation ("one click moves between hero artifacts").
- States covered: summary present; summary `null` (card omitted, `main#doc` still rendered — asserted by the DOM suite); resolved risk struck through with a visible label.

### screen:dashboard-mode (⚠ Minor Deviation)
- Mockup: `analysis/design-context/mockups/dashboard-mode.html` (captured as `screenshots/m4-mockup-dashboard-mode.png`)
- Screenshot: `screenshots/05-dashboard-mode.png`, `screenshots/08-dashboard-chart-as-table.png`, `screenshots/10-dashboard-12-week-chart.png`
- Layout: heading + scope → KPI row → filter bar → chart grid → task table — matches.
- KPI order and anatomy: Tasks (◈ blue) → Failed verification (✕ red) → Quiet ≥ {days} days (⏸ orange) → Open risks (⚠ purple), each a disc glyph + value + label + one-line context. Verified against `src/panel/panel.ts:730-767`; identical to the mockup and to the § 5.5 table.
- Chart grid: Status / Verification / Workflow type / Tasks created per week, each with a **Table** control — matches. The 12-week column chart fits its card (`viewBox 0 0 480 130`); the squashed two-week rendering in `screenshots/05-dashboard-mode.png` is a fixture artifact, not the shipped geometry.
- Table columns: Title · Type · Status / current phase · Verdict · Author · Created · Last activity · Next — exact match, in order, with `Last activity` carrying the sort indicator as drawn.
- Copy: `Tasks 2 of 6 match the filters` matches the mockup's `Tasks 5 of 230 match the filters`; `Charts show all tasks · click a bar to filter the table` matches verbatim; `Clear all` matches.
- **Deviation 1 (minor)**: the mockup's scope line prefixes the working-copy name (`payments-platform · 230 tasks · counts only, no durations`); the implementation renders `{total} tasks · counts only, no durations`. The feature spec does not specify the prefix. Filed as COS-3.
- **Deviation 2 (minor)**: the mockup appends `· view all →` to the Open-risks KPI context; the implementation makes the whole tile a button named `Show all {k} open risks in the Risks view`. Same affordance, one activation target instead of a decorative arrow, and a better accessible name.
- Intentional deviations (already ruled, not drift): the **Table** control is a `<button>` rather than the mockup's no-op `<a href="#">`; rows expose a title button instead of a whole-row click handler, which is what keeps AC17/AC14's "exactly one next-action control, distinct from the title control" true.
- States covered: filtered (1 chip + Clear all), chart view and data-table view of the same card, a row with a next action and a row without.

### screen:open-risks (✓ Match)
- Mockup: `analysis/design-context/mockups/open-risks.html` (captured as `screenshots/m5-mockup-open-risks.png`)
- Screenshot: `screenshots/06-risks-mode.png`, `screenshots/07-risks-show-resolved.png`
- Layout: breadcrumb `← Dashboard` → heading + count line → KPI tiles → filter bar → order note → group cards — matches.
- KPI order: Open risks · In unfinished tasks · In completed tasks · In failed-verification tasks, with the mockup's context lines (`still actionable in the workflow`, `carried past the end of the workflow`) preserved verbatim in `src/strings.ts`.
- Filter bar: risk-text search → Type → Task status (Unfinished / Completed) → Show resolved → Group by (Task / Workflow type / Source). The search box is § 5.7 filter-bar item 1; the mockup simply omits it. Everything else matches in order.
- Group card field order: disclosure → title → type badge → status · activity · author → `{n} open` → next action — exact match.
- Risk row anatomy: ⚠ glyph → risk text → source line rendered as `from {artifact path}` (a button into the reader) or `recorded in {key}` — exact match.
- States covered: default (Show resolved off — resolved rows and the resolved clause both absent, per the ruled mockup defect); Show resolved on (heading gains `· 1 resolved shown struck through`, the resolved row appears struck through with a visible `Resolved` label).
- Copy nit (COS-2, COS-4): the heading has no singular form (`1 open across 1 tasks`), and the order note reads "no severity, no date" where the mockup reads "no severity or date". Neither changes meaning.

### screen:start-workflow-flow (— Not comparable)
- Mockup: `analysis/design-context/mockups/start-workflow-flow.html`
- Screenshot: none — and none is possible.
- This screen is a native VS Code QuickPick sequence (`src/launch/launch.ts`), not a webview. It has no DOM, no bundle and no URL, so there is nothing a browser can render or compare. `implementation/visual-coverage.md` binds it to prompt order and copy rather than to markup, which is the only workable binding.
- What is verified elsewhere: group 9's unit tests assert the three steps, the picker's verbatim one-sentence details, the verbatim step-2 prompt and the 5 s status line. The one recorded addition is a placeholder carrying the 1–2,000-character constraint, which the mockup renders as a step header VS Code has no equivalent for.
- Residual: the live Claude Code pre-fill is manual-checklist item AC11, unsigned.

### component:hosted-dashboard (— Not comparable)
- Mockup: none by design — this is Maister's own `dashboard.html`, hosted unmodified.
- Screenshot: none taken. Comparing it to a mockup would be meaningless: the contract is *verbatim hosting*, not a layout the team designed.
- What is verified elsewhere: `test/unit/hostDashboard.test.ts` asserts byte-level equality with the source file apart from the five declared changes (CSP meta after `<meta charset>`, `<base href>`, nonced shim script, nonce on the one inline script, removal of the file's own CSP meta), plus a script count. `test/dom/surfaces.spec.ts` and `test/dom/security.spec.ts` load the real committed dashboard through the production `hostDashboardHtml()` and prove the shim, the nonce and the policy behave.
- Residual: render fidelity in a live VS Code webview, and the accepted `prefers-color-scheme` mismatch, are manual-checklist items AC3/AC4 — unsigned.

## Cross-Reference with `implementation/visual-coverage.md`
| INDEX ID | Coverage matrix claim | This pass |
|---|---|---|
| `screen:sidebar-now-overview` | Group 5 implements; 10 structural; 11 manual | ✓ confirmed for the Overview half; Now half out of reach by construction |
| `screen:task-fallback-view` | Group 7 implements; 10 structural; 11 manual | ⚠ confirmed with one defect (MIN-1) the structural suite does not assert |
| `screen:artifact-reader` | Group 7 implements; 10 structural; 11 manual | ✓ confirmed |
| `screen:dashboard-mode` | Group 8 implements; 10 structural; 11 manual | ⚠ confirmed with two minor copy/affordance deviations |
| `screen:open-risks` | Group 8 implements; 10 structural; 11 manual | ✓ confirmed, including the ruled mockup-defect behaviour |
| `screen:start-workflow-flow` | Group 9 implements; 11 manual | — not comparable; the matrix's "flow reference" binding is the right one |
| `component:hosted-dashboard` | Group 6 verbatim-hosting contract | — not comparable; hosting contract verified by test, not by eye |

The matrix's claim that no INDEX row is uncovered holds. Its stated limitation — that four of six mockups are approximate and all six carry window chrome, so pixel comparison is impossible by construction — is confirmed and is why this report judges structure only.
