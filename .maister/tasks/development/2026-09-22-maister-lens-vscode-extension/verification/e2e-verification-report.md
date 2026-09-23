# E2E Verification Report

## TL;DR
All five webview surfaces render live in a browser from their real built bundles with zero implementation console errors, and every structural claim the implementation makes held up.
Ten runtime scenarios executed, ten passed; two passed with issues. No Critical or Major findings.
Two Minor defects, both in `src/webview/fallbackTask.ts`: the status glyph the payload carries is never rendered, and the status word is duplicated into an `sr-only` span that a screen reader will read twice.
Four Cosmetic findings, none user-blocking. Verdict: **GO WITH CAVEATS**.

## Key Decisions
- Runtime verification was done by loading each built bundle's generated HTML over `http://localhost` with `acquireVsCodeApi` stubbed and one payload posted — the technique `test/dom/harness.ts` already establishes (A10/A16) — because this extension has no server and no URL to navigate to.
- Screenshots are served from a plain HTTP origin rather than `file://` because the Playwright MCP browser blocks the `file:` protocol; the shell document is otherwise byte-equivalent to the harness's.
- Colour, contrast and theme fidelity are declared **not assessable** in this harness and were not judged: outside the VS Code host every `--vscode-*` variable falls back, so all screenshots render near-monochrome. This is a harness property, not an implementation defect.
- The existing DOM suite's AC14 coverage (semantic tags, accessible names, tab order) was **confirmed by re-running it plus one live spot-probe**, not re-derived, per the task brief.

## Open Questions / Risks
- The fallback view's missing status glyph (§ 5.1, MIN-1) is also an unused `FallbackPayload.statusGlyph` field — it reads as a dropped `glyph()` call rather than a design choice. Someone should confirm intent before this ships.
- Nothing here touches the seven unsigned manual-checklist items (`verification/manual-checklist.md`). The manual halves of AC3, AC4, AC11 and AC14 remain unverified by any agent, including this one.

## 1. Identifier
- **Task**: 2026-09-22-maister-lens-vscode-extension
- **Task path**: `/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/.maister/tasks/development/2026-09-22-maister-lens-vscode-extension`
- **Spec**: `implementation/spec.md` (authoritative, amendments A1–A18)
- **Date**: 2026-09-23
- **Git ref**: `ad976ab` on `main` (implementation uncommitted in the working tree)
- **Tester**: e2e-test-verifier (maister)

## 2. Test Environment
| Field | Value |
|---|---|
| Base URL | `http://localhost:8777/` — a static server over a scratch dir holding the five generated shell documents, `dist/webview/*.js` and `media/webview.css` (no app server exists; see Key Decisions) |
| Browser | Chromium via Playwright MCP |
| Viewport | 250×900 and 400×900 (sidebar), 1100×900 (panel) |
| Auth context | n/a — webview bundles render from one posted payload; no auth surface |
| Test data | Fixtures exported by `test/dom/harness.ts` (`overviewPayload`, `fallbackPayload`, `readerPayload`, `dashboardPayload`, `risksPayload`), plus two payload variants posted at runtime |

## 3. Executive Summary
**Verdict**: ⚠️ GO WITH CAVEATS

| Metric | Count |
|---|---|
| Scenarios planned | 10 |
| Scenarios executed | 10 |
| Passed | 10 |
| Failed | 0 |
| Blocked | 0 |
| Pass rate | 100% |
| Critical issues | 0 |
| Major issues | 0 |
| Minor issues | 2 |
| Cosmetic issues | 4 |

`npm run build` regenerated all five bundles cleanly, and every surface rendered its payload on first post with no implementation-originated console output — the only console entry across the whole run was a `favicon.ico` 404 from the static server, which the real webview host never requests. Section order, field order and copy match `src/strings.ts` and the spec on all five surfaces; the Dashboard's chart→table toggle produced numbers identical to the bars it replaced, Risks' **Show resolved** revealed exactly one struck-through row with a visible "Resolved" label and appended the resolved clause to the heading, and every focusable control on every surface is a `button`/`a`/`input` with a non-empty accessible name and no positive `tabindex`. The two Minor findings are both in the fallback view's header meta line: the `statusGlyph` the host populates is never drawn, and the status word is echoed into a redundant `sr-only` span. Nothing found here blocks merge; both Minor items are one-line fixes in one file.

## 4. Verification Scenarios

### 4.1 Overview renders at sidebar width with no console errors — ✅ Passed
- **User story / acceptance criterion**: § 4.2 Overview webview; AC8, AC14
- **Preconditions**: `npm run build` current; `overviewPayload()` posted once into the shell document; viewport 400×900

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Navigate to `overview.html` | Bundle boots, posts `ready`, renders on payload | Rendered; `window.__posted` held the `ready` message | ✅ |
| 2 | Read console | No implementation errors | 1 entry, `favicon.ico` 404 from the static server only | ✅ |
| 3 | Read accessibility snapshot | Search → Scope → Status → Type → Attention → Tasks → groups → "Show all in Dashboard" | Exactly that order | ✅ |
| 4 | Inspect row anatomy | glyph · (expander) · title · description · ▶ next action; second row has no ▶ | Confirmed; `Pricing page research` (completed research) renders no action | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/01-overview-400px.png`
- **Acceptance criteria checklist**:
  - [x] Section order matches § 4.2
  - [x] Facet tiles are `aria-pressed` toggle buttons
  - [x] Exactly one next-action control per row, distinct from the title control

### 4.2 Overview is usable at 250 px with no visible horizontal overflow — ⚠️ Passed with issues
- **User story / acceptance criterion**: `standards/frontend/responsive.md`; group 5's claim of "0 horizontal overflow verified at 250 px and 400 px"
- **Preconditions**: same payload; viewport resized to 250×900

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Resize to 250 px | Layout reflows, all content legible | Reflowed; all facets, groups and rows legible, description truncates with ellipsis | ✅ |
| 2 | Measure `document.documentElement.scrollWidth` | == clientWidth (250) | 344 | ❌ |
| 3 | Identify the overflowing box | none | one `.sr-only` span (1×1, `position:absolute`, text "In progress") at x≈344 | ❌ |
| 4 | Check for a user-visible horizontal scrollbar | none | none — `body` carries `overflow-x:hidden`, so nothing is user-scrollable; only programmatic `scrollLeft` moves | ✅ |

- **Issues observed**: COS-1 (§ 5.4) — the visually-hidden span escapes its clipping ancestor and extends the document box by 94 px.
- **Evidence**: `screenshots/02-overview-250px.png` (the full-page capture is 344 px wide; everything past 250 px is empty)
- **Acceptance criteria checklist**:
  - [x] No user-visible horizontal scroll at 250 px
  - [x] No user-visible horizontal scroll at 400 px
  - [ ] Document box stays within the viewport at 250 px

### 4.3 Overview filtered state and row markers — ✅ Passed
- **User story / acceptance criterion**: § 4.2 list header and row markers
- **Preconditions**: amended payload posted at runtime (`matched: 5`, `total: 230`, `filterCount: 2`, two markers on row 1)

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Post the filtered payload | Header reads `Tasks 5 of 230 · 2 filters` | `Tasks5 of 230 · 2 filters` — matches the mockup's copy exactly | ✅ |
| 2 | Inspect row 1 | Markers render with their hidden words | `!failed verification` and `⏸quiet 5 days` present, glyph visible + word in `sr-only` | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/09-overview-filtered-markers.png`
- **Acceptance criteria checklist**:
  - [x] `{matched} of {total}` and `{count} filters` render
  - [x] No marker is carried by glyph or colour alone

### 4.4 Task fallback view — all § 5.4 sections in order — ⚠️ Passed with issues
- **User story / acceptance criterion**: § 5.4; AC6
- **Preconditions**: `fallbackPayload()` posted; viewport 1100×900

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Read heading order | Phases → Key artifacts → Decisions → Risks → All artifacts → Raw state | Exactly that order, preceded by the banner and the title/meta header | ✅ |
| 2 | Read the meta line | type · status (with glyph) · author · verification · dates · parse issues | Glyph absent; otherwise exact: `Development`, `Status: In progress`, `Author: Marek Nowak`, `Verification: none yet`, `Created 1 Sep 2026 · updated 22 Sep 2026`, `1 parse issue` anchor to `#raw-state` | ❌ |
| 3 | Inspect the status span's HTML | glyph (aria-hidden) + word | `<span>Status: In progress<span class="sr-only">In progress</span></span>` — no glyph, word duplicated | ❌ |
| 4 | Inspect phases | glyph + `{n} · {name}` + status word as text | `<span class="glyph" aria-hidden="true">✓</span><span class="fb-phase-name">1 · Specification</span><span class="dim">Completed</span>` | ✅ |
| 5 | Inspect risks | open first, resolved struck through with a visible label | `⚠ Open  Clock skew…`, then `Old sessions stay valid until expiry` struck with `Resolved` | ✅ |
| 6 | Inspect the Risks heading | it is an entry point into Risks mode | `<h2><button>Risks</button></h2>`, accessible name `Show the risks of Auth token rotation in the Risks view` | ✅ |

- **Issues observed**: MIN-1 and MIN-2 (§ 5.3).
- **Evidence**: `screenshots/03-fallback-task-view.png`
- **Acceptance criteria checklist**:
  - [x] All six § 5.4 sections render in order
  - [x] Phase glyphs always carry a text status word
  - [ ] The header status is drawn the way the mockup and the other surfaces draw it

### 4.5 Artifact reader — summary card, skip link, hero chips — ✅ Passed
- **User story / acceptance criterion**: § 6.3; AC5
- **Preconditions**: `readerPayload()` posted; viewport 1100×900

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Read document order | skip link → breadcrumb → hero chips → summary aside → `main#doc` | Exactly that order; skip link is first in tab order | ✅ |
| 2 | Inspect hero chips | current chip is `aria-pressed` | `Implementation Plan` pressed, `Specification` not | ✅ |
| 3 | Inspect the summary card | `aside[aria-label="Summary"]` with TL;DR → Key decisions → Open questions & risks → checklist | Exact; checklist `Checklist: 2 of 5 done · 1 skipped` is the card's last child | ✅ |
| 4 | Inspect the resolved risk | struck through with a visible "Resolved" label | `<s>` + `Resolved` chip present | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/04-artifact-reader.png`
- **Acceptance criteria checklist**:
  - [x] Summary card present when `summary !== null`
  - [x] Checklist line lives inside the card
  - [x] Skip link is the first focusable control

### 4.6 Dashboard mode — KPIs, charts, table — ✅ Passed
- **User story / acceptance criterion**: § 5.5; AC8, AC17
- **Preconditions**: `dashboardPayload()` posted; viewport 1100×900

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Read the KPI row | tile + value + label + context line, never colour alone | Both tiles carry glyph, value, label and context; the Open-risks tile is a `button` named `Show all 3 open risks in the Risks view` | ✅ |
| 2 | Read the filter bar | chips with a remove control, Clear all, charts note | `Filters` · `Completed ✕` · `Clear all` · `Charts show all tasks · click a bar to filter the table` | ✅ |
| 3 | Read the table header | Title, Type, Status / current phase, Verdict, Author, Created, Last activity, Next | Exact match, in order; each sortable header is a `button` named `Sort by {column}` | ✅ |
| 4 | Read the table body | charts count all tasks; only rows are filtered | Chart bars sum to 6 (`total`), table shows 2 rows, heading reads `Tasks 2 of 6 match the filters` | ✅ |
| 5 | Inspect row 1's Next cell | exactly one next-action control, distinct from the title | `Resume Auth token rotation` button beside the separate `Open Auth token rotation` title button | ✅ |

- **Issues observed**: COS-3 (§ 5.4).
- **Evidence**: `screenshots/05-dashboard-mode.png`
- **Acceptance criteria checklist**:
  - [x] KPI order, glyphs and tones match the § 5.5 table (verified against `src/panel/panel.ts`: ◈ blue, ✕ red, ⏸ orange, ⚠ purple)
  - [x] Exact column order including `Next`
  - [x] Charts are unfiltered while the table is filtered

### 4.7 Dashboard chart → data-table toggle — ✅ Passed
- **User story / acceptance criterion**: § 5.5 "Table" control; `standards/frontend/accessibility.md` (colour never the only encoding)
- **Preconditions**: Dashboard surface loaded

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Activate the Status card's **Table** control | A real table with scoped headers replaces the bars | Rendered `table.chart-table` with rows `Completed 2`, `In progress 4` | ✅ |
| 2 | Compare numbers to the bars | identical | Identical | ✅ |
| 3 | Read the control after toggling | it now offers **Chart** | Label flipped to `Chart` | ✅ |

- **Issues observed**: _None observed._
- **Evidence**: `screenshots/08-dashboard-chart-as-table.png`
- **Acceptance criteria checklist**:
  - [x] Every chart card exposes a Table view
  - [x] Table numbers equal the chart's

### 4.8 Twelve-week chart geometry — ✅ Passed
- **User story / acceptance criterion**: § 5.5 "Tasks created per week"
- **Preconditions**: amended payload posted with a full 12-week series

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Post 12 weeks | Chart is wider than tall and fits the card | `viewBox="0 0 480 130"`, rendered 505×137 px | ✅ |
| 2 | Read the accessible name | enumerates all twelve counts | `Tasks created per week over the last 12 weeks: W26 3, W27 7, …` | ✅ |
| 3 | Read the footnote | states the current week is in progress | `The current week is in progress (dashed)` | ✅ |

- **Issues observed**: _None observed._ The two-week fixture in `screenshots/05-dashboard-mode.png` renders an ~810 px tall chart because `viewBox` width is `weeks.length × 40`; production always publishes twelve weeks, so this is a fixture artifact and **not** a defect.
- **Evidence**: `screenshots/10-dashboard-12-week-chart.png`
- **Acceptance criteria checklist**:
  - [x] Chart fits its card at panel width
  - [x] One `role="img"` with an aria-label enumerating every count

### 4.9 Risks mode — default state and Show resolved — ✅ Passed
- **User story / acceptance criterion**: § 5.7; AC18
- **Preconditions**: `risksPayload()` posted; viewport 1100×900

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Read the default heading | `{open} open across {k} tasks`, no resolved clause | `1 open across 1 tasks` — clause absent, per the ruled mockup defect | ✅ |
| 2 | Read the filter bar | risk-text search · Type · Task status · Show resolved · Group by | Exactly that order (§ 5.7 item 3) | ✅ |
| 3 | Count rendered rows | resolved rows hidden | `li.risk-resolved` count 0 | ✅ |
| 4 | Check **Show resolved** | one resolved row appears, struck through, labelled; heading gains the clause | 1 row; `<s>Old sessions stay valid until expiry</s>` + `Resolved`; heading became `1 open across 1 tasks · 1 resolved shown struck through` | ✅ |
| 5 | Read the group header | title · type · status/activity/author · `{n} open` · next action | Exact; disclosure button and title button are separate controls | ✅ |
| 6 | Read a risk's source line | `from {artifact path}` opening the reader | `from implementation/spec.md`, a button named `Open implementation/spec.md` | ✅ |

- **Issues observed**: COS-2 and COS-4 (§ 5.4).
- **Evidence**: `screenshots/06-risks-mode.png`, `screenshots/07-risks-show-resolved.png`
- **Acceptance criteria checklist**:
  - [x] Show resolved is off by default
  - [x] Resolved rows carry a visible label, not strike-through alone
  - [x] No severity and no risk age anywhere

### 4.10 Accessibility and regression confirmation — ✅ Passed
- **User story / acceptance criterion**: AC14 (DOM half); `standards/frontend/accessibility.md`
- **Preconditions**: all five surfaces; the project's own DOM suite

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Run `npm run test:dom` | All DOM tests green on the freshly built bundles | 7 passed in 1.4 s (5 surfaces + 2 security) | ✅ |
| 2 | Live probe of focusables on the Dashboard | only `button`/`a`/`input`, every one named, no positive `tabindex` | 15 controls, 0 unnamed, 0 disallowed tags, 0 positive tabindex | ✅ |
| 3 | Read the Overview accessibility snapshot | facet groups exposed as named groups, toggles as `aria-pressed` buttons | `group "Scope"`, `group "Status"`, `group "Type"`, `group "Attention"`; `Mine` pressed | ✅ |

- **Issues observed**: MIN-2 (§ 5.3) — one redundant `sr-only` duplicate on the fallback surface, outside what the DOM suite asserts.
- **Evidence**: `screenshots/03-fallback-task-view.png`
- **Acceptance criteria checklist**:
  - [x] Every interactive element is `button`/`a`/`input` with an accessible name
  - [x] Tab order follows document order (confirmed by the DOM suite's `tabOrder` probe)
  - [x] No regression from the rebuild

## 5. Discrepancies

### 5.1 Critical
_None observed._

### 5.2 Major
_None observed._

### 5.3 Minor

**MIN-1 — the fallback header never renders the status glyph the payload carries**
- **Spec requirement**: `screen:task-fallback-view` mockup, header meta line: `Status: ◯ In progress`. `FallbackPayload.statusGlyph` is declared at `src/webview/fallbackTask.ts:54` and populated at `src/panel/panel.ts:1246` (`STATUS_GLYPHS[task.status]`).
- **Expected**: `<span><span class="glyph" aria-hidden="true">◯</span>Status: In progress…</span>`, matching how `dashboardMode.ts:451` and `risksMode.ts:360` draw the same value.
- **Actual**: `src/webview/fallbackTask.ts:129-134` emits `format(FALLBACK.status, …)` plus `hidden(payload.statusText)` and nothing else. `statusGlyph` has no reader anywhere in the bundle (grep: only the interface declaration).
- **Evidence**: `screenshots/03-fallback-task-view.png` (header reads "Status: In progress", no glyph); live DOM read of `p.fb-meta`.
- **Root cause hypothesis**: a dropped `glyph(payload.statusGlyph)` call — the surrounding code (phase rows in the same file) uses the glyph+word pattern correctly, and the payload field is otherwise dead.
- **User impact**: the fallback view is the one surface where status is not scannable by glyph, so it reads differently from Overview, Dashboard and Risks. It also leaves an unused payload field, which `standards/global/minimal-implementation.md` calls debt.
- **Recommended fix**: prepend `glyph(payload.statusGlyph)` to the status span in `src/webview/fallbackTask.ts`; or, if the omission is deliberate, delete `statusGlyph` from `FallbackPayload` and its producer.
- **Workaround**: none needed — the status word is present, so no information is lost.

**MIN-2 — the fallback header duplicates the visible status word into an `sr-only` span**
- **Spec requirement**: `standards/frontend/accessibility.md` — hidden text supplements a glyph that carries meaning; it does not repeat visible text.
- **Expected**: a screen reader announces "Status: In progress" once.
- **Actual**: `<span>Status: In progress<span class="sr-only">In progress</span></span>` — the computed accessible text is "Status: In progress In progress".
- **Evidence**: live DOM read of `p.fb-meta` on `screenshots/03-fallback-task-view.png`'s surface.
- **Root cause hypothesis**: the same dropped `glyph()` call as MIN-1 — `hidden(payload.statusText)` is the correct partner for an aria-hidden glyph, and became redundant once the glyph was not drawn.
- **User impact**: screen-reader users hear the status stuttered on every task fallback view.
- **Recommended fix**: fixing MIN-1 by adding the glyph makes `hidden()` correct again; otherwise drop the `hidden()` call.
- **Workaround**: none needed — content is correct, only repeated.

### 5.4 Cosmetic

**COS-1 — a visually-hidden span escapes its clipping ancestor and extends the document box by 94 px at 250 px**
- **Spec requirement**: `standards/frontend/responsive.md`; group 5's work-log claim of "0 horizontal overflow verified at 250 px and 400 px".
- **Expected**: `documentElement.scrollWidth === clientWidth` at 250 px.
- **Actual**: 344 vs 250. The single offender is the status `.sr-only` span inside `.trow-description`; that ancestor is `overflow:hidden` but `position:static`, so it is not the containing block for an absolutely-positioned child and does not clip it.
- **Evidence**: `screenshots/02-overview-250px.png` (full-page capture is 344 px wide, with 94 px of empty space).
- **Root cause hypothesis**: the `.sr-only` rule uses `position:absolute` with no offsets, so the span sits at its static position — past the truncated text — instead of at a fixed corner.
- **User impact**: none observed. `body` carries `overflow-x:hidden`, so no scrollbar appears and the user cannot scroll; only programmatic `scrollLeft` moves.
- **Recommended fix**: add `left:0; top:0;` to the `.sr-only` rule in `media/webview.css`, or give `.trow-description` `position:relative`.
- **Workaround**: n/a — nothing is user-visible today; the risk is that a future layout change turns this into a real scrollbar.

**COS-2 — the Risks heading has no singular form: "1 open across 1 tasks"**
- **Spec requirement**: § 5.7 item 1 specifies `{open} open across {k} tasks` verbatim; `RISKS.summary` in `src/strings.ts:331` implements it exactly.
- **Expected**: grammatical output for k = 1.
- **Actual**: `1 open across 1 tasks`.
- **Evidence**: `screenshots/06-risks-mode.png`.
- **Root cause hypothesis**: faithful implementation of a spec string that was written for the plural case; the codebase does have the singular pattern elsewhere (`RISKS.openCountOne`, `FALLBACK.parseIssuesOne`, `OVERVIEW.filterCountOne`).
- **User impact**: a small copy blemish on a headline line, in a workspace with one affected task.
- **Recommended fix**: add `RISKS.summaryOne` following the existing `…One` convention; this is a spec copy change, not a behaviour change.
- **Workaround**: none needed.

**COS-3 — the Dashboard scope line drops the mockup's workspace-name prefix**
- **Spec requirement**: `screen:dashboard-mode` mockup shows `payments-platform · 230 tasks · counts only, no durations`. `feature-spec.md` § 5.5 does not specify the prefix.
- **Expected** (per mockup): the working-copy name leads the scope line.
- **Actual**: `6 tasks · counts only, no durations` (`DASHBOARD.scope = '{total} tasks · counts only, no durations'`).
- **Evidence**: `screenshots/05-dashboard-mode.png` vs `screenshots/m4-mockup-dashboard-mode.png`.
- **Root cause hypothesis**: the spec text won over the mockup, which is the documented precedence rule.
- **User impact**: negligible in a single-root workspace; in a multi-root workspace the panel gives no hint of which root it summarises.
- **Recommended fix**: optional — decide whether the spec should adopt the mockup's prefix.
- **Workaround**: the panel title (`Maister · Dashboard`) and the VS Code window title still name the working copy.

**COS-4 — the Risks order note reads "no severity, no date" where the spec and mockup read "no severity and no date" / "no severity or date"**
- **Spec requirement**: `feature-spec.md` § 5.7 honesty constraint: "no severity and no date"; the mockup renders "no severity or date".
- **Expected**: one of the two source wordings.
- **Actual**: `Maister records risks as text only — no severity, no date — so groups are ordered by the task's last activity.`
- **Evidence**: `screenshots/06-risks-mode.png` vs `screenshots/m5-mockup-open-risks.png`.
- **Root cause hypothesis**: paraphrase during implementation; meaning is unchanged.
- **User impact**: none — the constraint is communicated correctly.
- **Recommended fix**: align `RISKS.orderNote` to the mockup wording, or leave as is.
- **Workaround**: none needed.

## 6. Console & Network Errors
| Source (file:line) | Message | Frequency | Severity | Impact |
|---|---|---|---|---|
| `http://localhost:8777/favicon.ico` | `Failed to load resource: the server responded with a status of 404 (File not found)` | 1 per fresh browsing context | Cosmetic | Harness-only. A VS Code webview never requests a favicon; no bundle emitted a single console message across all five surfaces. |

## 7. Spec Alignment
- **Fully implemented** (as observed at runtime): § 4.2 Overview layout, facets, grouping header and row anatomy; § 5.4 fallback section order and content, including the Risks-mode entry point; § 5.5 KPI tiles, filter bar, chart cards with Table views and the exact eight-column task table; § 5.7 breadcrumb, heading, filter bar, group cards, risk rows, source lines and Show resolved semantics; § 6.3 reader skip link, breadcrumb, hero chips, summary card and checklist placement; AC14's DOM half across all five bundles; AC17's "one next-action control per row, distinct from the title" on Overview, Dashboard, Risks and the fallback header; AC18's resolved-risk treatment on both the reader and Risks.
- **Partially implemented**: § 5.4's header meta line — every field renders except the status glyph (MIN-1).
- **Not implemented**: _None observed._
- **Extra (unspecified) behavior**: _None observed._ The two apparent additions were checked and are spec-mandated: the fallback view's **All artifacts** section is one of § 5.4's six (the mockup draws only five), and Risks mode's risk-text search box is § 5.7 filter-bar item 1 (the mockup omits it).

## 8. Variances from Plan
- Surfaces were served over `http://localhost:8777` instead of `file://`, because the Playwright MCP browser blocks the `file:` protocol. The shell document is otherwise identical to `test/dom/harness.ts`'s: same stylesheet, same bundle, same `#root`/`main#root` split, same `acquireVsCodeApi` stub, same single posted payload.
- Two payloads were amended at runtime (Overview: filtered counts and markers; Dashboard: a full 12-week series) to reach states the committed fixtures do not cover.
- Colour, contrast, theme and high-contrast behaviour were **not** verified. Outside the VS Code host every `--vscode-*` custom property is undefined, so all screenshots render near-monochrome. This is the four-theme manual-checklist item, not something this harness can close.
- The native surfaces — the Now tree, the Start Workflow QuickPick flow, and the hosted Maister dashboard in a real webview — were not driven; none of them is a browser-loadable bundle.

## 9. Evaluation Against Exit Criteria
Only the success criteria this runtime pass can speak to are marked; the rest are outside a browser harness's reach and are left explicitly unevaluated.

| Criterion (from spec) | Status | Evidence |
|---|---|---|
| 1. All eighteen AC pass by the method A16 names | ❌ | Not closable here: the manual halves of AC3, AC4, AC11 and AC14 remain unsigned in `verification/manual-checklist.md`. The DOM halves of AC5, AC6, AC8, AC14, AC17 and AC18 were re-confirmed live (§ 4.4–4.10). |
| 2. `npm run build`, `lint`, `test`, `test:integration` succeed | ✅ | `npm run build` rebuilt all seven bundles cleanly at the start of this run; `npm run test:dom` 7/7. The unit/integration suites were not re-run here — `verification/implementation-verification.md` records 37 + 28 + 1. |
| 3. Benchmark targets | ✅ | Not re-measured; group 10 recorded 229.3 ms / 14.1 ms / 1.3 ms against 5 s / 300 ms / 100 ms. |
| 4. Every webview message appears in the A2 table | ✅ | Observed posts across all five surfaces were exactly `ready` and `setFilter`; no surface emitted an unlisted type. Negative-path coverage lives in `test/unit/messages.test.ts`. |
| 5. A14 fixture assertion | ✅ | Out of scope for a browser harness; covered by `test/unit/parseSummary.test.ts`. |
| 6. `openRiskCount(task)` equals rendered rows | ✅ | Risks group header read `1 open` and rendered exactly 1 open row; with **Show resolved** on, 1 additional resolved row (§ 4.9). |
| 7. Runtime dependency count is exactly two | ✅ | Not re-checked here; recorded green in the work log and `implementation-verification.md`. |
| 8. `vsce package` produces a `.vsix`; git clean of build output | ✅ | Out of scope for this pass. |
| 9. README, CHANGELOG, tech-stack, vision have no contradictions | ✅ | Out of scope for this pass. |

## 10. Recommendations
- **Must fix before merge**: none.
- **Should fix soon**: MIN-1 and MIN-2 (§ 5.3) — one edit to the status span in `src/webview/fallbackTask.ts` closes both; COS-1 (§ 5.4) — two CSS properties in `media/webview.css`.
- **Nice-to-have**: COS-2, COS-3, COS-4 (§ 5.4) — copy decisions the spec owner should rule on rather than the implementer.

## 11. Artifacts
- **Screenshots**: `verification/screenshots/` (15 files — 10 rendered surfaces, 5 mockup captures used by the visual-fidelity report)
- **Visual-fidelity report**: `verification/visual-fidelity.md`
- **Console log dump**: inline in § 6

## 12. Conclusion
**GO WITH CAVEATS.** Every surface rendered correctly from its real built bundle with no implementation console errors, every section and field order matched the spec and `src/strings.ts`, and the accessibility contract held on all five bundles; the only defects found are two Minor ones in a single function of `src/webview/fallbackTask.ts` and four Cosmetic copy/CSS items. Nothing found here changes behaviour that users depend on, and nothing is a merge blocker — but the missing status glyph should be ruled on before release, because it leaves a payload field with no reader. Recommendation: **fix MIN-1/MIN-2 and COS-1, then merge**; the seven unsigned manual-checklist items remain the real outstanding gate, and no browser harness can close them.
