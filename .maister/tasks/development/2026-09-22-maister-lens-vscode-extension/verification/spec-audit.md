# Specification Audit: Maister Lens — VS Code Extension

## TL;DR
**pass-with-concerns** — the spec/feature-spec pair is unusually well-grounded: every VS Code API claim, the Claude Code command signature, the Copilot extension id, the `HERO_MAP` line range and the hosted-dashboard shim scheme check out against the real installed software and the real assets.
Two findings gate implementation planning: the tolerant-parsing rules **lose four real decisions** from this repo's own designated N9 fixture, and **six of eighteen ACs are assigned to a harness that cannot execute them**.
Nine warnings are spec-level contradictions the delta left open — chiefly `navigate` containment vs § 5.3's cross-task row, `openInBrowser` escaping the untrusted-workspace posture, and an enforcement assertion in A6 with no stated mechanism.
Counts: **2 critical · 9 warning · 9 info**. Nothing found is a design failure; all are closable by spec edits before planning.

## Key Decisions
- Audited the pair as instructed: a requirement counts as covered when feature-spec states it and the spec inherits or amends it. Findings are only raised where the delta leaves a contradiction, an orphan, or a silently invalidated feature-spec section.
- Severity anchored on *implementability and verifiability*, not completeness — the spec is deliberately terse by design, so brevity is never itself a finding.
- All 13 gap-analysis decisions were cross-checked against `analysis/scope-clarifications.md`; the two places where the spec departs from the gap analysis's *default* (I-1 hide-from-palette, I-3 exempt-Maister-wording + `strings.ts`) are **user-ratified** and are not findings.
- Claims were re-derived from primary sources: `anthropic.claude-code-2.1.278/extension.js`, the bundled `copilot` extension manifest, VS Code 1.138.0, the Maister 2.2.3 `dashboard.html` asset, and both live `orchestrator-state.yml` files.

## Open Questions / Risks
- The hosted dashboard depends on `asWebviewUri` tolerating the `?t=<epoch>` cache-buster the dashboard appends (W9). Unverified here and unverifiable without a running host; AC3 and AC4 both rest on it.
- AC11's pre-fill path remains manual by design, and Claude Code 2.1.278 declares `engines.vscode: ^1.94.0`, so the optional `test:min` run against the 1.90.0 engine floor can never exercise the `claudeCode` target (I6).
- Forcing an untrusted workspace inside `@vscode/test-electron` for AC15 has no stated method (I8).

---

## What was independently verified (and holds)

These are the load-bearing external claims. Each was re-derived from the real artifact, not from the spec's assertion.

| Claim | Source checked | Result |
|---|---|---|
| `claude-vscode.editor.open(sessionId, prompt, …)` signature | `~/.vscode/extensions/anthropic.claude-code-2.1.278-darwin-arm64/extension.js` — `registerCommand("claude-vscode.editor.open",async(M,D,j,R,E,x)=>{…}` where `M` is the session and `D` the prompt | ✅ confirmed |
| Claude Code registers a URI handler for `/open?prompt=` | same file — `registerUriHandler`, `case"/open":{let j=D.get("session")…,R=D.get("prompt")…}` | ✅ confirmed (see I4 for the routing nuance) |
| Copilot Chat id is `GitHub.copilot-chat` | `/Applications/…/app/extensions/copilot/package.json` → `publisher: GitHub`, `name: copilot-chat`, v0.66.0 | ✅ confirmed |
| `workbench.action.chat.open` registered by the workbench itself (weak availability check) | string present in `app/out/main.js`, not in the extension manifest | ✅ the spec's "weak check" caveat is accurate |
| VS Code version / API surface | 1.138.0. `env.uriScheme`, `WebviewPanelSerializer`, `localResourceRoots`, `activeWebviewPanelId`, `commandPalette: {when:"false"}`, `viewItem =~ /…/`, `untrustedWorkspaces: limited`, `treeView.badge`, `withProgress({location:{viewId}})` all exist at or below the ^1.90.0 floor | ✅ no API claim is invented |
| `HERO_MAP` at `dashboard.html` lines 249–276 | asset file | ✅ exact; § 2.2's hero table transcribes it faithfully for all five types |
| Both task folders' `dashboard.html` are the unmodified 2.2.3 asset | `diff -q` against the plugin cache — no output, twice | ✅ hosting one file covers both |
| `recognize()` structural signature | asset contains `dashboard-data.js`, `MAISTER_DATA`, exactly one inline `<script>` (line 245) with no `src`, and zero `<iframe` | ✅ the real dashboard is `recognized` |
| Shim `appendChild` patch reaches the real loader | `loadData()` does `s.src="dashboard-data.js?t="+Date.now()` then `document.body.appendChild(s)` → `Node.prototype.appendChild` | ✅ patch point is correct |
| `target="_blank"` link interception | `aLink()` emits `target="_blank" rel="noopener"`; a document-level **capture** `click`/`auxclick` listener calling `preventDefault()` suppresses `_blank` navigation including Ctrl/middle-click | ✅ scheme is sound |
| Nonce regex safety | `<script(?![^>]*\bsrc=)([^>]*)>` skips the shim's own `src=` tag when insertion 2 runs after insertion 1 | ✅ ordering is correct as written |
| `window.loadData` exists as a global for the refresh bridge | top-level `function loadData(initial)` in a classic script | ✅ |
| A8 claim: PD `dashboard-data.js` is an unquoted JS object literal | PD file starts `window.MAISTER_DATA = { generated: "…", task: {` (bare keys); the dev file is fully quoted | ✅ both drift shapes exist in this repo |
| Phase derivation (§ 2.4) against real data | dev state: `completed_phases: [phase-1, phase-2, phase-5]`, `status: in_progress` → phases 3–4 `not_recorded`, phase 6 `current` = "Audit specification" / "Auditing specification". Maister's own `dashboard-data.js` independently reports `current_activity: "Auditing specification"` | ✅ derivation reproduces Maister's own answer |
| N8 (`phase_summaries` under a `*_context` key) | dev → `task_context.phase_summaries`; PD → `design_context.phase_summaries`; exactly one each | ✅ |
| N11 (`resolved:` prefix) | PD file contains `"resolved: git-backed 'repository changes' feature — declared out of scope…"` | ✅ rule matches real data |
| N12 (artifact tuples) | `{path: analysis/codebase-analysis.md, label: Codebase analysis, html: null}` and `{path: implementation/spec.md, …, html: implementation/spec.html}` | ✅ |
| Repo hygiene premise (A11) | `git ls-files .playwright-mcp` → `.playwright-mcp/console-2026-09-22T15-36-49-376Z.log` is tracked; `README.md` is one line; no `.gitignore` | ✅ A11's premises are real |
| CSP reference implementation exists | `~/.vscode/extensions/42crunch.vscode-openapi-5.9.0` installed | ✅ |

---

## Critical

### C1 — Tolerant parsing silently drops decisions from a list-shaped `phase_summaries` entry (the spec's own designated fixture)

**Spec reference:** A8 row *"A summary entry that is a **list**, not a map — N9 — accepted; this task's own `phase_summaries.clarifications` is the fixture"*; feature-spec N9, N10, N11, N12.

**Evidence** — `.maister/tasks/development/2026-09-22-maister-lens-vscode-extension/orchestrator-state.yml`:

```yaml
    clarifications:
      - {decision: "Scope: full spec AC1-AC18", rationale: user choice}
      - {decision: "Tests: mocha unit + test-electron integration; perf as benchmark script", rationale: user choice}
      - {decision: "Claude Code launch: editor.open then URI fallback then next target", rationale: user choice}
      - {decision: "publisher placeholder maister, MIT", rationale: user choice}
```

N10 reads decisions **"from every entry's `decisions`"**; N11 from `entry.risks`; N12 from `entry.artifacts`. A list-shaped entry has no `.decisions` key — the list *is* the decision array. N9 says such an entry is "accepted", but neither N9 nor A8 states **what is extracted from it**. Implemented literally, `clarifications` contributes **zero** decisions and the four above are lost.

**Category:** Incomplete (rule stated as a tolerance but with no extraction semantics)

**Severity:** Critical — it silently loses real data from the one fixture the spec singles out as proof of this rule; it violates § 2's governing contract ("anything guessed or skipped is recorded in `parseIssues`, never silently discarded"); and it corrupts the Now tree's **Last recorded decision** child (§ 4.1) and decision-text search (AC7) for this very task.

**Recommendation:** Extend N9 with the list case explicitly, e.g. *"a list-shaped entry is treated as its `decisions` array; each item may be `{decision, rationale}` or a plain string; `risks` and `artifacts` are empty for such an entry"* — and add the assertion to the A8 fixture row so the unit test pins the four extracted decisions.

---

### C2 — Six acceptance criteria are assigned to a harness that cannot execute them, and no amendment carves them out

**Spec reference:** Success Criteria 1 (*"All eighteen acceptance criteria … pass by their listed method (unit, integration, benchmark or the recorded manual checklist)"*); A10; feature-spec § 8.7.

**Evidence:**
- The spec's own **Acceptance Criteria Traceability** table (lines 331–351) has columns *AC · Spec section · Module(s)* — **no verification-method column**. It therefore defers to feature-spec § 8.7 for method, amended only where A10 speaks.
- A10 carves out exactly three: AC7 and AC9 become a non-gating benchmark, AC11 becomes manual + a mocked `executeCommand` unit test. Hosted-dashboard rendering and live refresh are moved to the **manual checklist**.
- § 8.7 assigns **Integration** to AC3, AC4, AC5, AC6, AC8, AC14, AC17, AC18 — all of which are assertions about behaviour *inside a webview DOM* ("clicking an artifact link inside the hosted dashboard…", "clicking a Dashboard chart bar toggles that facet…", "the next action is reachable in one click from a task's Now row, Overview row, task view and Dashboard row", "**Show resolved** reveals resolved risks struck through").
- `@vscode/test-electron` runs mocha inside the extension host. The extension host has **no handle on a webview's DOM** — it can post messages and receive them, but cannot click, query or assert rendered content.
- A10's only webview-rendering harness is the Playwright pass, and A10 scopes it explicitly: *"It covers layout, copy and field order only; extension-host behaviour stays in the integration suite."* So neither harness covers the click→message→host round-trip these ACs describe.
- A10 additionally moves AC3's automated half to manual, contradicting § 8.7's "Integration + manual" — the spec never states this downgrade, so AC3 quietly becomes manual-only.

**Category:** Incorrect / Ambiguous (traceability is stated but not satisfiable by the named method)

**Severity:** Critical — Success Criterion 1 is the spec's primary exit gate and it cannot be met as written for a third of the ACs. Discovering this during the verification phase would be late and expensive.

**Recommendation:** Add a **Verified by** column to the traceability table that names the real method per AC, and restate each webview AC as the pair that *is* executable — a host-side assertion on the posted payload and the handler's effect (panel location change, `executeCommand` call), plus a Playwright assertion on the rendered HTML. Where neither reaches (AC3's "no CSP violations", AC4's real click), say so and move it to the recorded manual checklist as A10 already does for AC11.

---

## Warning

### W1 — A2's `navigate` containment rule silently invalidates § 5.3's cross-task dashboard row

**Spec reference:** A2, `navigate` row — *"must normalize to a path **inside the hosting task folder**; else ignore + log. Routed per § 5.3's target table"*. Feature-spec § 5.3 target table row: *"`dashboard.html` of **this or another task** → Task mode for that task"*.

**Evidence:** the two rules are mutually exclusive — another task's `dashboard.html` is by definition outside the hosting task folder, so A2 drops it before § 5.3's routing table is ever consulted. A2 cites § 5.3 as the router in the same sentence that makes one of its rows unreachable.

**Category:** Incorrect (amendment silently invalidates an inherited section it also cites)

**Severity:** Warning — this is exactly the "silently invalidated section" class; it is a one-line fix but leaves the implementer to guess which rule wins.

**Recommendation:** Either delete the cross-task row from § 5.3 via a new amendment line, or widen A2's rule to *"inside the hosting task folder, or a `dashboard.html` whose `folderUri` is in the index"*. The first is preferable and matches the security posture.

---

### W2 — `openInBrowser` has no workspace-trust rule, defeating the § 8.1 untrusted posture

**Spec reference:** A2 `openInBrowser` row — validation is *"`folderUri` ∈ index; path normalizes inside the task folder **and** ends `.html`; dispatched via `env.openExternal` on the file URI"*. Only `startWorkflow` and `runNextAction` carry *"requires `isWorkspaceTrusted`"*.

**Evidence:** the sender is the § 5.4 fallback banner's **Open dashboard in browser** button. In an untrusted workspace, § 8.1 forces Task mode to *always* use the fallback view — so the banner and its button are **more** reachable, not less. One click then hands model-authored HTML+JS to the user's default browser, where it runs outside the webview sandbox. § 8.1's guarantee ("the hosted dashboard and HTML companions are **not executed**") and § 8.3's threat-control row ("Disabled entirely in untrusted workspaces") both become inaccurate.

**Category:** Incomplete (missing validation rule) / Incorrect (security claim overstated)

**Severity:** Warning — bounded blast radius (local `file://`, no network in the spec's own model), but it is a stated control that does not hold, and A2 is explicitly "the security allowlist".

**Recommendation:** Add *"requires `isWorkspaceTrusted`"* to the `openInBrowser` row, and hide the button in the untrusted fallback banner. Consider the same decision for `openExternal` from the reader (currently relies on VS Code's trusted-domain prompt — acceptable, but the spec should say so rather than leave it unstated).

---

### W3 — A6's second enforcement assertion has no stated mechanism, and re-adds the option the gate rejected

**Spec reference:** A6 *Enforcement* — *"A second assertion guards the boundary: `src/**/*.ts` and `media/**` outside `strings.ts` and `workflows.ts` contain no user-facing string literals passed to `window.show*Message`, `TreeItem` labels/descriptions or webview templates."*

**Evidence:**
- Deciding whether a string literal is "passed to `TreeItem` labels/descriptions or webview templates" is a type-and-dataflow question. Answering it reliably needs a TypeScript AST pass (`typescript` is already a dev dependency, so this is possible) or an ESLint rule; a regex over source text will produce false positives on every log line, codicon id, CSS class and test string. **The spec names no mechanism and adds no tooling.**
- Gap analysis I-3 offered *(i)* a central `strings.ts` catalogue **or** *(ii)* a whole-tree literal scan, and the Phase-2 gate chose *(i)*: *"Maister Lens's own user-facing strings live in one module, and a unit test scans that module"* (`scope-clarifications.md`, I-3). A6's first assertion is *(i)*. The second assertion is *(ii)* — both are now specified, for one AC.
- AC13 as amended reads *"No user-facing string **authored by Maister Lens** contains…"*. The first assertion satisfies it. The second is a convention-enforcement tool, not an AC requirement.

**Category:** Ambiguous (no mechanism) / Extra (beyond the ratified decision and the AC)

**Severity:** Warning — an unimplementable-as-written test that a task group will be asked to deliver, and a direct hit on `global/minimal-implementation.md` ("Build What You Need").

**Recommendation:** Either drop the second assertion and rely on code review for the boundary, or specify its mechanism concretely (TS AST visitor over `src/**/*.ts`, allowlisted call sites, `workflows.ts` and `strings.ts` excluded) and accept it as a deliberate addition.

---

### W4 — `orchestrator.failed_phases` is observable, present in both real state files, and silently discarded

**Spec reference:** feature-spec § 2.1 — *"`PhaseStatus` deliberately has **no `skipped` or `failed` value**. Maister's state file does not reliably record skips, and **a phase-level failure is not observable from state**."* N15 — *"Unknown fields: ignored by the model."* The spec inherits both unamended (R5, R6).

**Evidence:** both live state files carry a top-level `orchestrator.failed_phases` key:
- dev task: `failed_phases: []`
- PD task: `failed_phases: []`

Maister's own `dashboard.html` renders a `failed` phase glyph (`const PH_GLYPH = { completed: "✓", failed: "✕", skipped: "⤼" }`, line 288) and a `.ph-icon.failed` style, so failure is a first-class phase state in the ecosystem. The justification "not observable from state" is therefore factually wrong — the field exists and is named. N15 then drops it **without a `ParseIssue`**, which conflicts with § 2's governing contract that nothing is silently discarded. The same applies to `orchestrator.auto_fix_attempts` (per-phase map, populated in the PD file) and `orchestrator.started_phase` (see I7).

**Category:** Incorrect (stated rationale contradicted by the data) — the *behaviour* may still be the right call

**Severity:** Warning — it does not break AC2 on today's fixtures (both arrays are empty), but "Honest state" is the success criterion AC2/AC13/AC18 map to, and the spec's honesty argument rests on a false premise. A task whose phase genuinely failed would render as `not_recorded` with no trace.

**Recommendation:** Keep `PhaseStatus` as is if desired, but correct the rationale and make the discard visible: record a `warning` `ParseIssue` when `failed_phases` is non-empty, and add a hazard fixture with a populated `failed_phases` to the A8 matrix.

---

### W5 — The Playwright visual E2E pass is required by no AC and has no definable pass criterion

**Spec reference:** A10 *E2E (visual)* — *"Playwright renders the generated webview HTML … in a plain browser and compares it to the approved mockups. It covers layout, copy and field order only."* Visual Design table: fidelity is *"**Approximate layout**, exact copy and field order"* for four of the five screens, and *"Pixel-guide for the tile/chart grid"* for Dashboard mode.

**Evidence:** "compares it to the approved mockups" is not executable against a target declared *approximate*. The mockups are also full VS Code window chrome (title bar, activity bar, status bar, terminal pane, annotation gallery — see `sidebar-now-overview.html`), not isolated webview bodies, so there is no common DOM to diff. The enforceable half — exact copy and field order — is a text assertion that needs no browser, and would be better served by snapshot tests on the HTML the generators already produce. Meanwhile A10 introduces a **third** test harness (Playwright, plus its browser download) into a project whose ratified test strategy is "mocha unit + `@vscode/test-electron` integration" (`clarifications.md` Q2), and whose stated dependency discipline is two runtime deps.

**Category:** Extra / Ambiguous

**Severity:** Warning — a whole harness and a task group's worth of work with no AC behind it and no objective pass condition. Direct tension with `global/minimal-implementation.md` and the conventions standard's "Build What's Needed".

**Recommendation:** Replace with HTML snapshot assertions in the mocha unit suite over each bundle's generator output (section order, headings, field order, exact copy), and keep visual comparison to the mockups as a line on the manual checklist. If Playwright is kept, define the pass criterion explicitly (which selectors, which text, what tolerance) rather than "compares it to the approved mockups".

---

### W6 — The `maister.now` view-title menu is specified nowhere, while § 1.6 claims manifest completeness

**Spec reference:** R2 — *"Contributions: … all commands, menus, context keys, `viewsWelcome`, five settings | § 1.3, § 1.6 + A3, A4"*. Feature-spec § 1.6 header: *"contributions introduced in Sections 5–8, consolidated here **so § 1 is a complete `package.json` source**."*

**Evidence:**
- § 4.2 gives a full `menus["view/title"]` table for `view == maister.overview` (five entries with icons and `navigation@N` positions).
- § 1.3's command table says `maister.refresh` appears on *"Now and Overview title bars"* and `maister.startWorkflow` on *"Now/Overview title bars"* — but **no table anywhere gives the `when`, `group`, icon or order for `view == maister.now`**.
- § 1.6's menu addenda cover only `editor/title` and one `view/item/context` entry. A3 adds `maister.openRisks` placements. A4 lists palette visibility. None supplies the Now title bar.
- The binding mockup `sidebar-now-overview.html` renders it: `▾ Now  2  ＋ ↻` — i.e. two title-bar actions (Start Workflow, Refresh) plus the badge.

**Category:** Missing

**Severity:** Warning — R2 is a checklist item a task group will be marked complete against, and its cited sources do not contain the information. Low effort to close, but it will otherwise be invented at implementation time.

**Recommendation:** Add a one-line amendment: `menus["view/title"]` for `view == maister.now` → `maister.startWorkflow` at `navigation@1` (icon `add`, `when: … && isWorkspaceTrusted`) and `maister.refresh` at `navigation@2` (icon `refresh`), matching the mockup.

---

### W7 — The Risks mockup contradicts § 5.7's "Show resolved, off by default", and it is not among the two acknowledged mockup defects

**Spec reference:** Visual Design — *"Two mockup defects are **not** to be reproduced"* (the `/screen/*` links and the stale "Browse" wording), and `screen:open-risks` is binding for *"filter bar, group card header fields, risk row + source line"* at *"Approximate layout, **exact field order**"*. Feature-spec § 5.7 — *"**Show resolved** checkbox, off by default"*.

**Evidence** — `mockups/open-risks.html` renders, with the Show resolved control unchecked:
- heading: `Open risks — 38 open across 26 tasks · **11 resolved shown struck through**`
- inside the *Rate limiter rollout* group: `✓ Limits were tuned on staging traffic only  Resolved  recorded in scope_clarifications`

So the mockup shows resolved risks *and* dedicates heading copy to them while the toggle that reveals them is off. § 5.7's own heading copy is `{open} open across {k} tasks` — no resolved clause. A third contradiction, not on the spec's list of two.

**Category:** Ambiguous (binding input contradicts binding text; precedence unstated for this case)

**Severity:** Warning — the spec declares mockups binding for *copy* and then leaves an implementer to choose between two copy strings and two default states on the same screen.

**Recommendation:** Add this to the "defects not to be reproduced" note: the resolved rows and the `· {n} resolved shown struck through` clause are rendered only while **Show resolved** is on; § 5.7's heading copy wins by default.

---

### W8 — `setFilter` validation omits rules for two `TaskQuery` fields and caps no array

**Spec reference:** A2 `setFilter` row — *"each patch key is a known `TaskQuery` field; array values contain only enum members; dates parse; `text` ≤ 200 chars"*. Feature-spec § 3.7 `TaskQuery`.

**Evidence:** `TaskQuery` has seven fields. The rule covers `text`, the three enum arrays, and the two dates. It does **not** cover:
- `author?: 'me' | 'others' | { email: string }` — the object variant carries a free-form string from the webview straight into a query predicate. No enum check, no length bound, no shape rule for the object form.
- `quietAtLeastDays?: number` — no rule at all (type, sign, or bound).
- Array length is unbounded for `types` / `statuses` / `verdicts`.

A2 is explicitly *"the security allowlist"* and A2's generic rule only guarantees *"the right primitive type"*, which a union of string-literal and object is not.

**Category:** Incomplete

**Severity:** Warning — low exploitability (the query engine is an in-memory filter, and § 8.3's real controls are elsewhere), but it is a stated-complete allowlist that is not complete, and Success Criterion 4 asks a test to prove malformed messages are dropped.

**Recommendation:** Extend the rule: *"`author` is `'me'`, `'others'`, or `{ email }` with `email` a string ≤ 320 chars; `quietAtLeastDays` is a finite number in 0–3650; each enum array has ≤ 16 members."*

---

### W9 — The whole hosted-dashboard feature depends on an unverified `asWebviewUri` + query-string behaviour that the toolchain smoke-test does not cover

**Spec reference:** § 5.3 *Data loading* — *"The `<base>` tag makes the relative `src` resolve to the webview resource URI."* Technical Approach — *"Toolchain risk, handled first … proves esbuild bundling, one mocha test and one `@vscode/test-electron` launch all work before any feature code is written."*

**Evidence:** the real loader is

```js
s.src = "dashboard-data.js?t=" + Date.now();
```

so the URL the webview requests is `https://file+.vscode-resource.vscode-cdn.net/<taskFolder>/dashboard-data.js?t=1758…`. The spec never states that the webview resource resolver ignores the query component. If it does not, **AC3 (dashboard renders with its data) and AC4 (link navigation from the hosted dashboard) both fail**, and the only fallback is the § 5.4 native view — a large scope change discovered late. The same insertion scheme is reused for HTML companions (R23, § 6.4), so the blast radius is two of the four panel modes.

**Category:** Ambiguous (a critical dependency asserted without evidence)

**Severity:** Warning — not a defect, but the single highest-value thing to de-risk, and the spec's own "handled first" list omits it while covering lower-risk items (esbuild on Node 26).

**Recommendation:** Add to the first task group's smoke test: host the real `dashboard.html` from one of the two committed fixture snapshots in a webview and confirm `window.MAISTER_DATA` is populated with the `?t=` cache-buster intact. If the query breaks resolution, the shim's `appendChild` patch can strip it (it already rewrites the node) — worth pre-authorising that as the contingency.

---

## Info

| # | Finding | Evidence | Recommendation |
|---|---|---|---|
| I1 | The spec's Open Questions claims *"`orchestrator-state.yml` for this task carries `skip_test_suite: true` … it must be set to `false` before verification"*, and A10 repeats it. The live file already reads `skip_test_suite: false`. | dev `orchestrator-state.yml`, `orchestrator.options` | Stale carry-over from gap analysis I-7; drop the Open Question, keep A10's sentence as a statement of fact. |
| I2 | `setGroupBy` is in the A2 allowlist with sender "overview", but group-by is a **native title-bar command** (`maister.overview.groupBy`, § 4.2, single-pick prompt) resolved entirely host-side. No mockup shows an in-webview group-by control. | A2 vs § 4.2; `sidebar-now-overview.html` shows no group-by widget | Either name the webview control that sends it or remove it from the allowlist (an allowlist entry with no sender is attack surface, and contradicts "every module has an immediate caller"). |
| I3 | A3 says *"§ 5.6 and § 5.7 are renumbered so the message protocol (now A2) reads after Risks mode"* — but A2 already states it *replaces* § 5.6 wholesale. Renumbering a deleted section is an orphaned instruction. | A2 vs A3 bullet 3 | Reduce A3 bullet 3 to "§ 5.6 is superseded by A2; § 5.7 keeps its number." |
| I4 | § 7.4 says the URI handler *"routes to the same code path"* as `claude-vscode.editor.open`. It actually dispatches `claude-vscode.primaryEditor.open(session, prompt)` — a different placement command. Param names `session`/`prompt` are correct. | `extension.js`: `case"/open":{…h$.commands.executeCommand("claude-vscode.primaryEditor.open",j,R)}` | Correct the wording; behaviour is close enough that A7 stands, but the README limitation note should say "primary editor" not "new tab". |
| I5 | The three insertions go in *immediately after `<head>`*, i.e. **before** the existing `<meta charset="UTF-8">` (currently at byte 40). HTML requires the charset declaration within the first 1024 bytes; the first non-ASCII byte in the asset is at 210. | measured on the 2.2.3 asset | Measured safe today (~450 bytes of insertion leaves charset at ~490 and non-ASCII at ~660), but it is fragile against longer workspace paths. Insert **after** the existing `<meta charset>` instead — same effect, no hazard. |
| I6 | Claude Code 2.1.278 declares `engines: {vscode: ^1.94.0}`, above Maister Lens's `^1.90.0` floor. The optional `test:min` run against 1.90.0 therefore can never load Claude Code, so the `claudeCode` branch of AC11 is untestable there by construction. | `anthropic.claude-code-2.1.278/package.json` | Note it beside A10's `test:min` bullet so nobody chases it later. |
| I7 | `orchestrator.started_phase` is present in both real state files (`phase-6`, `phase-8`) and is a direct statement of the active phase, yet § 2.4's derivation ignores it entirely and N15 drops it without a `ParseIssue`. It happens to agree with the derivation on both real tasks. | both `orchestrator-state.yml` files | Either use it as a cross-check (disagreement → `warning` issue, derivation still wins) or state explicitly why it is not trusted. Same family as W4. |
| I8 | AC15 requires an **untrusted** workspace, but A10 names no method for forcing one under `@vscode/test-electron`. | A10 Integration bullet vs § 8.7 AC15 | Name the method (a fresh `--user-data-dir` with trust unset, plus host-side assertions on the `when`-clause context values) or move the UI half to the manual checklist. |
| I9 | A8 lists *"Missing `task_ids`"* as a hand-written fixture hazard; the real PD file carries `task_ids: {}` (present but empty). "Present and empty" is a third case the matrix does not name. | PD `orchestrator-state.yml`, `orchestrator.task_ids` | Widen the A8 row to "absent, empty, or partly filled". Cosmetic. |

---

## Extra features (implemented/specified beyond the requirement set)

| Item | Requirement behind it | Assessment |
|---|---|---|
| Playwright visual E2E harness | none | See W5 — the only genuine scope addition found. |
| `npm run test:min` against the 1.90.0 engine floor | none (AC-wise); justified by the declared `engines` value | Keep — cheap, and it is the only thing that validates the engine claim. See I6 for its limit. |
| `setGroupBy` message | no identified sender | See I2. |
| A6's second enforcement assertion | AC13 is already satisfied by the first | See W3. |

Everything else checked out: all four new modules named in A13 plus `webview/components.ts` have immediate, enumerated callers (`risks.ts` → nowTree + dashboardMode + risksMode; `messages.ts` → panel + overviewView; `components.ts` → five bundles; `strings.ts` → host + bundles, per the ratified I-3 decision). The **Deliberately not built** list (no chart library, no sanitizer, no syntax highlighter, no VS Code API abstraction layer, no plugin registry, no status-bar item, no Quick Pick, no write path) is an explicit and adequate over-engineering guard, and A12's removal of the mockup's status-bar item is correctly justified.

---

## Standards compliance

| Standard | Assessment |
|---|---|
| `global/minimal-implementation.md` | ⚠️ Mostly — modules are justified with callers, but W5 (Playwright harness) and W3 (second string assertion) are "just in case" additions the gate did not ask for. |
| `global/conventions.md` | ✅ Predictable `src/<domain>/` layout; exactly two runtime deps with documented rationale; README/CHANGELOG and testing standards scheduled in A11/A10; `.gitignore` and the tracked `.playwright-mcp` log addressed (premises verified). |
| `global/error-handling.md` | ✅ Parser never throws, per-item isolation, single output-channel sink, notifications limited to three actionable cases, `context.subscriptions` cleanup. ⚠️ One gap: N15's silent discard of `failed_phases` contradicts "nothing silently discarded" (W4). |
| `global/validation.md` | ⚠️ Mostly — host-side allowlist validation is the right shape and is well specified for 13 of 15 message types; W8 and W2 are the holes. |
| `global/coding-style.md` / `commenting.md` | ✅ Domain grouping, descriptive names, comments scoped to the two genuinely non-obvious places (the shim patch, the undocumented Claude command). |
| `frontend/components.md` | ✅ `webview/components.ts` gives tile/chip/row/summary-card single-responsibility primitives composed across five bundles rather than duplicated. |
| `frontend/css.md` | ✅ `--vscode-*` as the only design tokens; the spec correctly notes the mockups' Dark+ palette is a *rendering* of those variables, not literals to copy. |
| `frontend/accessibility.md` | ✅ Semantic elements, `aria-pressed`/`aria-sort`/`role="status"`, focus via `--vscode-focusBorder`, never colour alone, full spoken tree labels; the hosted dashboard is a *recorded* exception rather than an omission. |
| `frontend/responsive.md` | ✅ 250–400 px sidebar fluidity stated; panel surfaces reflow. |
| Testing standards | Not initialized for this project; A10/§ 8.6 propose them at finalization, as the conventions standard requires. |

---

## Clarification needed

1. **C1:** for a list-shaped `phase_summaries` entry, is the list the entry's `decisions`, or should each item be inspected for `decision`/`risk`/`artifact` shape? (The four real items are all `{decision, rationale}`.)
2. **C2:** for each of AC3, AC4, AC5, AC6, AC8, AC14, AC17, AC18 — what is the executable assertion, and which of them move to the manual checklist?
3. **W1:** should the hosted dashboard be able to navigate to *another* task's dashboard, or is the containment rule the intended final word?
4. **W7:** which copy wins for the Risks heading — § 5.7's `{open} open across {k} tasks`, or the mockup's `· {n} resolved shown struck through`?
5. **W5:** is the Playwright pass a firm deliverable, or may it be replaced by HTML snapshot assertions in the mocha suite plus a manual visual check?

---

## Compliance status

⚠️ **Mostly Compliant** — the specification is complete, internally traceable and, on every external contract this audit could check against live software, **accurate**. The two critical findings are localized spec edits (one parsing rule, one verification-method column), not design faults. They should be closed before implementation planning, because C1 ripples into `model/parseState.ts` and its fixtures and C2 ripples into every test-bearing task group's acceptance criteria.
