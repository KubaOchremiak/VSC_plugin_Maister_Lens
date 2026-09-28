# Spec Audit: Lens nav fixes + Follow-ups view

## TL;DR
Verdict: **pass-with-concerns** (Mostly compliant / implementable). FR1–FR4 and FR9 are clear and match the code as it is today. FR5–FR8 have real gaps.
Counts: Critical 0 · High 3 · Medium 4 · Low 3.
The biggest problems: the yaml-based `dashboard-data.js` reader silently mis-parses or fails on 3 of the 7 real files in this repo; the Now-tree follow-ups node can never appear; and two Risks entry points (fallbackTask, overviewView) are missing from the rename list.

## Key Decisions
- The yaml mis-parse is rated High, not Critical. The failure degrades safely, because nothing is ever executed. But it silently drops or corrupts FR7(a) data on real Maister output.
- The Now-node contradiction is rated High. As specified, FR8's node is dead code, which the minimal-implementation standard forbids.
- The navigate containment design is sound. It gets a Medium only because the spec leaves the join order and the pre-join checks unspecified.

## Open Questions / Risks
- Q1: The Now tree lists only unfinished tasks, and Follow-ups count only completed tasks, so the node can never show. Should the node be dropped, or should it count something else?
- Q2: Should the fallback view's "Risks" heading link (it posts `openRisks` with a folderUri) open Follow-ups scoped to that task, or be removed? FR9 keeps the section but says nothing about this link.
- Q3: Which "completed" test applies: `status === 'completed'`, or any task with a verdict? A scoped `folderUri` for an unfinished task needs its own empty state.
- Q4: Is the JS-literal parsing of `dashboard-data.js` in scope (unquoted keys, `.map()` expressions)? If not, the accepted limitation must be documented.

---

## Verification of spec claims (file:line)
| Claim | Result |
|---|---|
| `resolveInside` messages.ts 113-127 | OK (113) |
| `validateNavigate` 246-251 | OK (245-258) |
| `containedRelPath` relPath.ts 16-35 | OK |
| `route()` panel.ts 587-607 maps DASHBOARD_FILE → task | OK (588-607; 593-594) |
| `buildArtifact`/`hostCompanion` 1125-1177 | OK (1125, 1152) |
| `risksPayload` ~947 | at 955 (close enough) |
| Dashboard KPI ~785-822 | OK (785, 817-822) |
| parseState verdict 566 | OK; VERDICTS at parseState.ts:32 = passed/passed_with_issues/failed, which matches the FR5 breakdown |
| nowTree risks node ~190, 353 | OK (190-195, 353-359) |
| dashboardMode "Open risks" 500-504 | OK |
| `MessageContext` has no `hostBaseRelDir` yet | Confirmed (messages.ts:66-80). The red test depends on adding it |
| `[hidden]` rule absent from media/webview.css | Confirmed |
| Extension never reads dashboard-data.js | Confirmed (only watcher/taskIndex/shim references) |

## Findings

### H1 — The `dashboard-data.js` parse strategy fails on real Maister output (High, Incorrect/Ambiguous)
**Spec**: Key Decisions and FR7(a) say to strip the `window.MAISTER_DATA =` prefix and `;`, then parse the rest with `yaml`, skipping the file on failure.
**Evidence**: I ran that exact strategy with the repo's `yaml` against every `dashboard-data.js` file in the repo:
- `test/fixtures/*` (2 files), `2026-09-22-maister-lens-vscode-extension`, `2026-09-22-maister-viewer-vscode-plugin`: parse OK (JSON style).
- `2026-09-23-dashboard-nav-buttons`: the file uses unquoted keys (`{severity:"warning", ...}`). The parse **succeeds but is corrupt**: keys come out as `severity:"warning"` with null values. So `fixed !== true` is true for every issue, `description` is missing, and no error is raised. Silent wrong data is worse than a skip.
- `2026-09-24-project-docs-page`: the file contains JS expressions (`[...].map(([id,...])=>({...}))`). The parse **fails**, so the file is skipped.
- This task's own file: unquoted keys, so keys come out mangled (e.g. `generated:"2026-..."`).

**Impact**: FR7(a) returns nothing or garbage for at least 3 of 7 real tasks. Only JSON-style fixtures would pass the planned tests.
**Recommendation**: Require a shape check after parsing: `verification` must be an object, `issues` an array, and each item must have a string `description`. Anything else is treated as "skip". Add fixtures for the unquoted-key and expression-based variants. Alternatively, choose a JSON5-style tolerant reader. That would need a dependency decision, because the standard requires minimal dependencies. The "never executed" property is preserved either way.

### H2 — The Now-tree follow-ups node can never render (High, Incorrect/Ambiguous)
**Spec**: FR8 says Now tree node "{n} follow-ups". The Risks section says "will therefore rarely appear".
**Evidence**: `src/views/nowTree.ts:10-11` limits membership to `UNFINISHED = ['in_progress','pending','blocked']`. FR5/FR7 count completed tasks only. A task in the Now tree therefore always has 0 follow-ups, so the node never appears ("never", not "rarely").
**Impact**: Dead code and a dead test, which violates `global/minimal-implementation.md`.
**Recommendation**: Get the stakeholder's decision (Q1). Either remove the Now node together with its `openRisks` wiring, or define a different count.

### H3 — Rename list misses Risks entry points (High, Missing)
**Spec**: FR8 and the Success Criteria require no `openRisks` or `risks` mode references in `src/` or `package.json`.
**Evidence**: The spec's reuse and technical sections do not name these consumers:
- `src/webview/fallbackTask.ts:82-90` has a button that posts `{type:'openRisks', folderUri}`, with label `FALLBACK.openRisksLabel` (strings.ts:274). This conflicts with FR9 ("fallback keeps its risks section") and is left unresolved (Q2).
- `src/views/overviewView.ts:490-494` handles `openRisks` and runs `maister.openRisks`. Line 127 has a comment referencing Risks mode.
- `package.json:4` description ("…and risks"), plus the menus at 251 and 330 (the spec says "contributions and menus", which is fine) and command title 140.
- panel.ts: the other mode checks at 466, 646, 1571, 1638 and 1660; the command at 1726; the deserializer at 1761-1764; the second KPI `openRisks` in `risksPayload` at 1020; strings `titleRisks` (201) and the whole `RISKS` block (354-395).
- `src/index/taskIndex.ts:479` has a comment referencing `collectRisks`.
- Tests: `test/unit/risks.test.ts`, `test/integration/risksMode.test.ts`, `test/dom/themes.spec.ts`, `test/dom/harness.ts`, `test/unit/strings.test.ts`, `test/integration/dashboardMode.test.ts`, `test/integration/fallbackTask.test.ts` and `test/integration/nowTree.test.ts`. The spec only names the "navTree/nowTree node test" and a generic "update or remove".
- README: lines 5, 47, 61 (Now node), 81 (Risks row, "Show resolved"), 141.

**Recommendation**: Add an explicit consumer checklist to the spec or plan, and add a grep-based acceptance check (`openRisks|mode: 'risks'|RISKS\.`).

### M1 — Navigate join order and pre-join checks are unspecified (Medium, Ambiguous, security)
**Spec**: "`validateNavigate` joins the base and the href, normalizes, applies `containedRelPath` against the task root."
**Evidence**: `resolveInside` (messages.ts:113-127) removes `#`/`?`, then decodes, then calls `containedRelPath`. The scheme, absolute-path and backslash checks in `containedRelPath` (relPath.ts:17) only inspect the *start* of the string. If the implementer joins `base + '/' + href` before those checks, `https://x`, `/etc/x` and `C:\x` are no longer refused as such. They become in-folder paths like `implementation/https:/x`. That is not an escape, but it hides the refusal and differs from today's behaviour. If the join happens *before decoding*, `%2e%2e` segments are evaluated after the join; that is still safe only if decoding precedes normalization.
**Recommendation**: Specify the order: strip the tail, decode, run the scheme/absolute/backslash refusal on the decoded href alone, join with `hostBaseRelDir`, then run `containedRelPath`. Tests should cover: `../dashboard.html` accepted; `../../x` refused; `%2e%2e/%2e%2e/x` refused; `https://…` refused; `/abs` refused. `hostBaseRelDir` must come from the panel, never from the message (the spec implies this; make it explicit).

### M2 — The definition of "completed" and the scoped empty state are unspecified (Medium, Ambiguous)
FR5 does not say whether "completed" means `status === 'completed'` or a task having a verdict, and what `folderUri` scoping shows for an unfinished task (e.g. from a fallback view). See Q3.

### M3 — The KPI and Now counts read `dashboard-data.js` on each refresh; the caching decision is deferred (Medium, Ambiguous)
Technical Approach leaves "per-refresh read, or mtime cache if the planner judges" undecided, and says reads must not be synchronous. The spec should fix async reads, and should fix when the count changes: the watcher already fires on `dashboard-data.js` writes (taskIndex.ts:572), so say whether that write triggers a KPI recount.

### M4 — Verdict breakdown source is unspecified (Medium, Ambiguous)
The breakdown could come from `Task.verdict` (state `verification_context.last_status`) or from `verification.status` in dashboard-data.js. These can disagree. Recommend `Task.verdict`, which is already parsed and typed.

### L1 — Row target for sources (b)/(c)/(d) is unspecified
FR6 says "artifact when known". Only `verification.issues` has a location (`location:"src/…"`, which is a workspace file, not an artifact). Clarify whether Issue rows open the task or the file (the latter goes through `openFile` containment).

### L2 — Deferred-phrase regex is not pinned
Give the exact pattern, e.g. `/\bdefer\w*\b[\s\S]*?\bfollow[- ]?up/i`, so that the match and non-match tests are deterministic.

### L3 — `e2e_followup` shape
FR7(c) says "string or a list". The real data (2026-09-23 state) is a long prose string. Define whether a string is one row or is split, and add a length or truncation rule for display.

## Extra features
None. The scope is tight and the out-of-scope list is explicit.

## Standards check
- Error handling: FR3 warning and graceful parse degradation are covered. H1 shows that "graceful" is currently *silent corruption* in one variant.
- Validation: the allowlist containment approach is correct (M1 refines it). The requirement for type checks on parsed fields is stated, and H1 makes it mandatory.
- Minimal implementation: H2 conflicts with it.
- Conventions: no new dependencies is respected, unless H1 is solved with a JSON5 reader.

## Recommendations
1. Resolve Q1–Q4 before planning.
2. Add the consumer checklist from H3 and a grep acceptance check.
3. Pin the navigate processing order and its test matrix (M1).
4. Add non-JSON `dashboard-data.js` fixtures and a shape-validation requirement (H1).
