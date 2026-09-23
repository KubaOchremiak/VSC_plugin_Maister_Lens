# Spec Audit — Dashboard Navigation Affordances

## TL;DR
Verdict: **pass-with-concerns**. 0 critical, 4 warning, 6 info. Every operator-approved constraint is honoured and every load-bearing technical claim (existing command, existing message allowlist, CSP asymmetry, five DOM surfaces, nine palette commands) verified true against the codebase. The concerns are a falsified assumption, a wrong rationale in FR4, a mislocated/unregistered new test, and six drifted file:line references.

## Key Decisions
- Verdict is not `fail` — no finding blocks implementation; all four warnings are correctable during execution without re-specification.
- Line-number drift is graded info, not warning, where the cited symbol is unambiguous and nearby.

## Open Questions / Risks
- FR4 AC5's stated reason for `stopPropagation()` is factually wrong; the call is harmless but the spec teaches the implementer a false model of the shim.
- The nav-provider test cannot live in `test/unit` (it needs the `vscode` API) and must be registered in `test/integration/index.ts`, which the spec does not say.
- `contributes.views` order governs only first-install layout; existing users' persisted view state may not place the nav view first. No test can catch this.

---

## Verified claims (all TRUE)

| Claim | Evidence |
|---|---|
| `maister.openDashboard` already declared, registered, dispatched | `package.json:122-126` (icon `dashboard`); `src/panel/panel.ts:1489-1491`; dispatch `src/panel/panel.ts:513` |
| `{type:'openDashboard'}` already allowlisted + validated | `src/panel/messages.ts:59` (union), `:299-300` (validator accept), `:363` (allowlist set), `:378` (OverviewMessage) |
| Not trust-gated | `src/panel/messages.ts:81` — `TRUST_GATED = {startWorkflow, runNextAction, openInBrowser}` |
| Native CSP omits `'unsafe-inline'` for styles | `src/panel/panel.ts:1305` — `style-src ${webview.cspSource}` only |
| Hosted CSP allows inline styles | `src/panel/hostDashboard.ts:93` — `style-src ${cspSource} 'unsafe-inline'` |
| `hostDashboard.ts` "exactly three insertions" contract | `src/panel/hostDashboard.ts:6` |
| `surfaces.spec.ts` enumerates exactly five surfaces with blanket a11y loop | `test/dom/surfaces.spec.ts:189-195` (array), `:199-212` (tag/name/tabindex/tab-order loop) |
| `manifest.test.ts` asserts exactly nine palette-visible commands | `test/unit/manifest.test.ts:89-96` |
| `navigation@1`/`@2` literals present | `test/unit/manifest.test.ts:106,110,115` |
| `OVERVIEW.title` is at `src/strings.ts:138` | exact match |
| Its two consumers are `src/views/overviewView.ts:535,538` | exact match |
| `test/dom/harness.ts:56` uses `OVERVIEW.title` and follows automatically | exact match |
| `RISKS.breadcrumb`/`breadcrumbLabel` at `src/strings.ts:329-330` | exact match |
| `FALLBACK` block at `src/strings.ts:226-258` | exact match |
| Local `post()` helper at `src/webview/fallbackTask.ts:75-77` | exact match |
| `vscodeApi` handle at `src/webview/shim.ts:20` | exact match |
| `fallbackTask.render()` starts at `:296`, `banner(payload)` at `:298` | exact match |
| `strings.ts` has **no imports** → shim import is bundle-safe | no `^import` in `src/strings.ts`; `esbuild.mjs:18-23` bundles `src/webview/*.ts` as IIFE with `bundle:true`, so `strings.ts` is inlined and tree-shaken, no new bundle and no extension-host code pulled in |
| No new esbuild entry needed; surface count stays five | `esbuild.mjs:6-8` globs `src/webview/*.ts`; no new file is added there |
| `dashboard` is a valid codicon | already consumed as a manifest command icon (`package.json:125`); it is a standard codicon id, valid for `new vscode.ThemeIcon('dashboard')` |
| Adding a third view disturbs no `when` clause, context key or ordering assertion | `test/unit/manifest.test.ts` contains **no** assertion on `contributes.views` at all (only `view/title` menus, `:104-115`); `viewsWelcome` entries (`package.json:60-71`) are both scoped to `maister.now` |
| `maister.openDashboard` is not trust-gated, so no trust gate needed on the new view | confirmed above |
| "Project" entry absent from the spec | grep-confirmed: appears only in Out of Scope / deferral prose |
| `panel.ts:1342` untouched | spec lists it as out of scope; `:1342` is the `ViewColumn.Active` line |

---

## Findings

### W1 — WARNING — FR4 AC5's rationale for `stopPropagation()` is false
**Spec claim** (FR4 AC5, line 69): the click handler "calls `stopPropagation()` so the shim's own capture-phase `interceptLink` handler … never converts it into a `navigate` message."

**Actual**: `interceptLink` (`src/webview/shim.ts:113-129`) bails out unless `event.target.closest('a[href]')` resolves (`:118-121`). A `<button>` injected as a direct child of `document.body` has no anchor ancestor, so `interceptLink` returns at `:120` and never posts `navigate`. The hazard does not exist.

**Impact**: the instruction is harmless but the justification is wrong; an implementer reasoning from it may draw further false conclusions about the shim (e.g. believing anchors are required, or adding defensive code elsewhere).

**Remediation**: reword AC5 to "attach the handler directly to the button; `stopPropagation()` is optional defence-in-depth — `interceptLink` only acts on `a[href]` ancestors (`shim.ts:118`)". Alternatively require the element be a `<button>` *precisely because* that sidesteps interception.

**Category**: Incorrect.

---

### W2 — WARNING — Assumption about `test/integration/overview.test.ts` is falsified
**Spec claim** (Assumptions, line 162; Test Plan row 4): "`test/integration/overview.test.ts` asserts the surface's title/aria-label; if it does not, FR2's test change reduces to a no-op."

**Actual**: no test anywhere asserts the literal `'Overview'`. A repo-wide grep for `'Overview'` / `"Overview"` across `test/` and `src/` returns exactly two hits: `src/strings.ts:138` (the value itself) and `package.json:55` (the manifest title). `test/integration/overview.test.ts` asserts only provider behaviour, filter sharing (`:52`) and row ordering.

**Impact**: the spec's fallback branch is the real one. FR2's test work collapses to the manifest assertion alone, and — more importantly — **the rename is untested end-to-end**. Nothing fails if `OVERVIEW.title` and `package.json` drift apart.

**Remediation**: resolve the assumption now. Either (a) state that FR2's only test is the `manifest.test.ts` `name: "Tasks"` assertion, or (b) add a positive assertion that `test/dom/harness.ts:56`'s rendered `<main aria-label>` equals `OVERVIEW.title` and that the manifest view name matches it — which is the only thing that would catch drift.

**Category**: Ambiguous / incomplete.

---

### W3 — WARNING — The nav-provider test is mislocated and would silently never run
**Spec claim** (Test Plan, last row): "New unit test for the nav provider (co-located with existing `src/views` tests)."

**Actual**: there are no `src/views` tests under `test/unit`. The only view-provider test is `test/integration/nowTree.test.ts`, run under `@vscode/test-electron` because `TreeDataProvider`, `vscode.ThemeIcon` and `createTreeView` need a live `vscode` module. Worse, `test/integration/index.ts:5-19` enumerates suite members by **hard-coded name**; a new `navTree.test.ts` not added to `SUITES.trusted` is never loaded and the suite passes green with zero coverage of FR1.

**Remediation**: specify `test/integration/navTree.test.ts`, mirroring `nowTree.test.ts`, **and** add `'navTree'` to `SUITES.trusted` in `test/integration/index.ts`. Add that file to the spec's in-scope test list.

**Category**: Incomplete.

---

### W4 — WARNING — View ordering is specified as an outcome but is not enforceable
**Spec claim** (FR1 AC1, Success Criterion 1): the sidebar shows "Overview", "Now", "Tasks" in that order.

**Actual**: `contributes.views` order (`package.json:46-58`) determines layout only on first install. VS Code persists per-user view order and collapse state in workspace/global storage; an existing Maister Lens user who updates gets the new view appended at the position VS Code chooses, not necessarily first. No test in the repo asserts runtime view order, and none can.

**Remediation**: restate AC1 as a manifest-order assertion (which `manifest.test.ts` can check, and currently does not check at all) and downgrade Success Criterion 1's ordering clause to "on a fresh profile". Optionally note that `view.visible`/order is user-controllable by design.

**Category**: Ambiguous.

---

### I1 — INFO — `package.json:129-134` does not point at the `maister.openDashboard` command
Cited in FR1 AC3 and the Reusable Components table. **Actual: `package.json:121-126`** (`"command": "maister.openDashboard"` at `:122`, `"icon": "dashboard"` at `:125`). Lines 129-134 are inside the `maister.openRisks` declaration. Fix the reference.

### I2 — INFO — `src/webview/risksMode.ts:429-433` is off by two
Cited in FR3 AC1 and Reusable Components as "the breadcrumb template". **Actual: `:431-433`** (`:431` crumb, `:432` listener, `:433` nav append). `:429-430` are the `fragment` declaration and a blank line. The quoted code itself matches the spec verbatim — only the range is wrong.

### I3 — INFO — `media/webview.css:260-275` starts one line late
Cited in FR3 AC5. The `.link` rule is the grouped selector `.hero, .link, .action` beginning at **`:259`** and closing at `:269`; the `:hover` rule is `:271-275`. Cite `:259-275`. (Confirms the substance: `color: var(--vscode-textLink-foreground)`, `background:none`, `border:none`, `cursor:pointer` — no new CSS needed.)

### I4 — INFO — `src/views/nowTree.ts` line references drift
Reusable Components cites `taskItem():273-300` and `registerNowTree():401-425`. **Actual: `taskItem()` at `:258`, `registerNowTree()` at `:402`.** `NOW_VIEW_ID:8` is correct.

### I5 — INFO — FR2 AC2 mischaracterises what `manifest.test.ts` asserts
FR2 AC2 lists "`maister.openDashboard` at `navigation@1`" among the assertions that must stay unchanged. The test only asserts `maister.openRisks` at `navigation@2` for `maister.overview` (`test/unit/manifest.test.ts:114-116`); `openDashboard`'s `navigation@1` (`package.json:231-234`) is present in the manifest but **not** asserted. The conclusion ("still passes unchanged") is right; the premise is not. This also means the test plan's "confirm the `navigation@1` literal still passes" is a no-op for `openDashboard`.

### I6 — INFO — `shim.ts` importing `strings.ts` inlines the whole module's reachable exports
Verified bundle-safe (W-free): `strings.ts` has no imports, and esbuild (`esbuild.mjs:26-31`, `bundle:true`, `format:'iife'`) tree-shakes unreferenced `export const` objects. Importing only `FALLBACK` pulls in `FALLBACK` alone. The spec's escape hatch (Assumptions, line 161) is unnecessary but not harmful. No action required; recorded so the implementer does not invoke the fallback needlessly.

---

## Spec file:line references that do NOT match the codebase

| Spec reference | Actual |
|---|---|
| `package.json:129-134` (openDashboard command) | `package.json:121-126` |
| `src/webview/risksMode.ts:429-433` | `src/webview/risksMode.ts:431-433` |
| `media/webview.css:260-275` (`.link`) | `media/webview.css:259-275` |
| `src/views/nowTree.ts` `taskItem():273-300` | `:258` |
| `src/views/nowTree.ts` `registerNowTree():401-425` | `:402-425` |
| `test/unit/manifest.test.ts:106,111` (navigation@1/@2) | `:106,110` for `maister.now`; `:115` for `maister.overview`/openRisks — and no `openDashboard` assertion exists |

All other references verified exact: `src/strings.ts:138`, `:226-258`, `:329-330`; `src/views/overviewView.ts:535,538`; `test/dom/harness.ts:56`; `src/panel/panel.ts:513`, `:1305`, `:1342`, `:1489-1491`; `src/panel/messages.ts:59,81,299-300,363,378`; `src/panel/hostDashboard.ts:6`, `:92-94`; `src/webview/fallbackTask.ts:75-77`, `:85-91`, `:296-307`; `src/webview/shim.ts:1-6`, `:20`; `src/webview/components.ts:9-27`; `test/dom/surfaces.spec.ts:186-213`; `test/unit/manifest.test.ts:89-96`.

---

## Constraint compliance

| Operator constraint | Status |
|---|---|
| `hostDashboard.ts` zero-line diff | HONOURED (FR4 AC7, Out of Scope, Success Criterion 4) |
| "Project" entry absent | HONOURED — appears only as an explicit deferral |
| `tree` view, no new bundle, five DOM surfaces | HONOURED and verified against `esbuild.mjs` and `surfaces.spec.ts:189-195` |
| Back link unconditional, no origin tracking / `PanelLocation` / `messages.ts` change | HONOURED (FR3 AC4, FR4, Out of Scope) |
| `panel.ts:1342` untouched | HONOURED |
| No inline `style` in native fallback | HONOURED (FR3 AC5), and CSP claim verified |
| Hosted link self-styles inline | HONOURED (FR4 AC4), and CSP claim verified |
| All user-facing text in `strings.ts` | HONOURED (FR5) |
| Accessible name, aria-label, button/a/input only, no positive tabindex | HONOURED (FR3 AC6, FR4 AC1, Accessibility Requirements) |

No spec content violates any operator-approved constraint.

---

## Implementability assessment

**A competent implementer could execute this spec with one genuine blocker and two low-cost lookups.**

- The blocker is W3: the spec names a test location that does not exist and omits the `test/integration/index.ts` registration step, so FR1's test would silently not run. An implementer following `nowTree.test.ts` as the stated pattern would probably find this, but the spec should not rely on that.
- W2 leaves the FR2 test scope genuinely undetermined until the implementer greps — cheap, but it is an unresolved fork in the spec.
- The six line drifts (I1-I4) are all recoverable by symbol name in seconds and none point at the wrong file or the wrong construct.
- Everything load-bearing — the reused command, the reused message type, the two CSP regimes, the `.link` class, the `el()` builder, the `post`/`vscodeApi` handles, the tree-provider pattern, and the two literal test counts — checks out exactly as specified.

Requirements coverage: FR1-FR5 from `analysis/requirements.md` are all addressed, and D1-D6 from `analysis/scope-clarifications.md` are all reflected faithfully in the spec's Key Decisions and acceptance criteria.
