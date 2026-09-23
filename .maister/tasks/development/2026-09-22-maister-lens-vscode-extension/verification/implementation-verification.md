# Implementation Verification — Maister Lens

## TL;DR
**Overall status: ⚠️ Passed with issues** (post-fix). All **6 critical findings are closed and re-verified by execution** across two fix rounds — containment, CSP nonce classification, no-CSP hosting, the YAML alias bomb, an unregistered command, and a shim that laundered the nonce to remote scripts.
The suite grew from 71 to **87 passing** (48 unit, 31 trusted + 1 untrusted integration, 7 DOM), including two Chromium-level security regression tests that assert the policy is *enforced*, not merely unviolated. Lint and typecheck clean, runtime dependencies still exactly two.
`npx vsce package` now exits 0 and produces an installable `.vsix`.
**Remaining**: 8 known non-critical issues (W1–W5, N2–N4), logged by user decision rather than fixed.
All 7 manual checklist items remain unsigned, so the manual halves of AC3, AC4, AC11 and AC14 are still unverified — the one thing no automation closes.

## Open Questions / Risks
- **All 7 manual checklist items are unsigned.** This is the largest outstanding item and the only blocker no automation can close.
- **8 known issues remain open by decision** — see "Known issues carried forward" below. W2 is the most notable: it is the last surviving instance of C1's root cause, and `revealInExplorer` added a sink to it, though exploiting it needs write access to the extension's global storage.
- **The strict prefix grammar narrows what counts as a dashboard.** Legacy doctypes are now refused. All 21 committed HTML files in this repo still host, but a future Maister dashboard that changes its opening bytes would silently fall back to the native view.
- **`eval()` cannot be asserted from Playwright** — CDP bypasses `script-src` for eval, so the C3 runtime test proves enforcement with a DOM-inserted unnonced script, an inline event handler, and the `securitypolicyviolation` event instead.
- **C1–C3 assumed a hostile task-authored `dashboard.html`.** That is exactly the threat model spec § 8.3 adopts. If the team's posture is instead "the dashboard is always ours", C2 and C3 drop to warnings — **C1 does not**, because `navigate` from a hosted page is the intended untrusted channel.
- The **persisted index (R10)** is spec-mandated but the benchmark it shipped with undermines it: ~215 ms saved at 300 tasks, ~5 ms at real scale, for ~200 lines and a class of staleness failures. A v0.2 spec amendment, not a fix here.
- **AC13's scan covers only `strings.ts`**, while `workflows.ts:66` ships the user-visible `activeForm: 'Running E2E tests'`. This is what A6 specified (Maister's phase names are constant input, shown verbatim), so it is not a false completion — but the claim is broader than the check.
- **Benchmark fixtures are 20–40× smaller than real tasks.** Measured parse cost for 300 real-sized tasks is ~340 ms, so AC9's conclusion survives, but 229.3 ms is not representative.

---

## Executive summary

Five verifications ran: completeness, code review, pragmatic review, production readiness and reality assessment. The test suite was verified green by the orchestrator immediately before the phase and re-verified independently by two of the subagents. Every reviewer judged the implementation substantively sound — the reality assessor called it "a strong implementation with an incomplete final mile, not one that merely appears to work" — while the code review found four critical security defects that share a root cause: containment and CSP enforced through string and regex manipulation rather than parsing.

## Implementation plan verification

**99/101 steps (98%).** 111 `[x]` marks across 12 groups, 2 `[~] DEFERRED` (11.6 needs user approval for `/maister:standards-update`; 11.7 needs a human at a live host), 7 `[ ]` — all seven are the manual checklist items, accurately represented as unmet rather than waived.

Spot checks confirmed every sampled claim landed in code (checkboxes were not trusted): no status-bar item anywhere (A12); `execFile` with no shell; `setGroupBy` refused by both validators; CSP meta spliced after `<meta charset>`; `html:false` with a 2 MB cap and scheme allowlist; zero hex literals in the stylesheet; screen-reader counterpart text for every glyph; the trust re-check inside the launch layer; the DRY fold of `isQuiet`/`quietDaysSetting`; dead placeholder HTML deleted. No TODO/FIXME, no `any`, no empty catch across `src/`.

## Test suite results

Skipped per `skip_test_suite: true` at phase entry — the suite was verified green by the orchestrator immediately before the phase, independently re-run by two subagents during it, and re-run again after each fix round.

| Harness | At verification | **After both fix rounds** |
|---|---|---|
| mocha unit | 37 passing | **48 passing**, 0 failing |
| `@vscode/test-electron` trusted | 28 passing | **31 passing**, 0 failing |
| `@vscode/test-electron` untrusted | 1 passing | **1 passing**, 0 failing |
| Playwright DOM | 5 passed | **7 passed**, 0 failed |
| **Total** | 71 | **87 passing, 0 failing** |

`npm run lint` clean · `npx tsc --noEmit` exit 0 · `npm ls --prod --depth=0` → exactly `markdown-it@14.3.2`, `yaml@2.9.1` · `npm audit --omit=dev` → **0 vulnerabilities**.

Test quality was sampled rather than assumed: `hostDashboard.test.ts` reverses the five declared edits and byte-compares to the source; `panel.test.ts`'s AC4 counts editor tabs, greps the log for browser calls and fires a negative out-of-folder case. No vacuous test was found.

**Benchmark** (non-gating): cold index 229.3 ms (target 5 s), warm 14.1 ms (target 300 ms), decision query 1.3 ms (target 100 ms), over 300 generated tasks.

## Standards compliance

✅ **Compliant** — 10 of 10 applicable standards followed, 2 info-level nits. Backend and Testing standards are genuinely not initialized (that is what deferred step 11.6 exists to fix), so no testing-standards gap is chargeable.

Passing: coding-style (real DRY folds, no dead code), commenting (2–9% density, 84 spec-citing comments), conventions (structure, README, CHANGELOG, two runtime deps), error-handling (single output channel, every refusal logged, clipboard floor), minimal-implementation, validation (allowlist with default-refuse, bounds, containment, trust gate), and the full frontend set (semantic controls with accessible names, VS Code variables as the only tokens, primitives defined once, intrinsically fluid layout).

## Documentation completeness

✅ **Complete.** `work-log.md` carries an entry for all 12 groups with standards-per-group, ambiguity rulings, accepted out-of-set edits and an honest residual gap list. README's five settings, types, defaults and bounds match `package.json` exactly; all scripts exist; the benchmark figures and 12 known limitations are recorded. CHANGELOG 0.1.0, LICENSE, `.gitignore`, `.vscodeignore` present. Project docs corrected and INDEX.md resynced.

## Real-data validation (reality assessment)

The sharpest available test: the extension was run against this repository's own two real Maister task folders.

- Correct type, status and phases for both; the development task's gaps correctly `not_recorded`.
- **0 parse issues** on the development task; one *honest* warning on the product-design task (`started_phase: phase-8` disagreeing with the phases on disk) — exactly the A17 behaviour.
- All **11 + 14 registered artifacts exist on disk**, including the `.html` companions.
- Both real dashboards pass the recognizer's four signature checks; `test/fixtures/tasks/dev-real/dashboard.html` is **byte-identical** to the live file, so the AC4 DOM test clicks a link in Maister's actual dashboard.
- Next actions compose correctly for both types.
- The 92 KB feature-spec rendered to 118 KB of body HTML; the implementation plan's checklist read **111/120 done, 2 skipped**; the real 70 KB `spec.html` companion re-hosted successfully.

## Optional review results

| Review | Verdict |
|---|---|
| Completeness | ⚠️ passed with issues — 0 critical, 1 warning, 6 info |
| Code review | ❌ critical issues — 4 critical, 5 warnings, 7 info |
| Pragmatic review | ⚠️ appropriate with specific excess — 1 high, 3 medium, 4 low |
| Production readiness | **GO WITH MITIGATIONS** — 3 blockers, 10 concerns, ~82% ready |
| Reality check | ⚠️ issues found — **NO-GO for distribution**, GO to continue verification |

---

## Issues requiring attention

### Critical

| # | Issue | Location | Fixable |
|---|---|---|---|
| 1 | **`resolveInside()` decodes after normalizing**, so `%2e%2e%2f` escapes every containment check. Reproduced: `%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd` → `../../../etc/passwd`. Reaches `navigate`, `openArtifact`, `openSource`, `openInBrowser`, `openFile` — a hosted dashboard can make the panel read and render a file outside the task folder. | `src/panel/messages.ts:102-124` | Yes |
| 2 | **Nonce granted to a remote `<script src>`** whose attributes contain a quoted `>`, defeating `default-src 'none'`. The only path by which a hosted page can reach the network. | `src/panel/hostDashboard.ts:27` | Yes |
| 3 | **A dashboard with no `<head>` is hosted with no CSP at all** — the meta lands in `<body>`, where Chromium ignores it. Fails open instead of degrading to the fallback view. | `src/panel/hostDashboard.ts:55-66,73-87` | Yes |
| 4 | **`maxAliasCount: -1` disables yaml's billion-laughs guard** on the file parsed for every task at activation, including in untrusted workspaces. Opening a repository is enough — no click. | `src/model/parseState.ts:407` | Yes |
| 5 | **`maister.revealInExplorer` is contributed with three menu rows and never registered** — clicking it in the Now tree or the panel title bar errors. `manifest.test.ts` certifies the broken state. | `package.json:82,183,280,322` | Yes |

### Warning

| # | Issue | Location | Fixable |
|---|---|---|---|
| 6 | `npx vsce package` **fails** (missing `repository`; relative link in CHANGELOG) — no installable artifact exists | `package.json`, `CHANGELOG.md:39` | Yes |
| 7 | `publisher: "maister"` placeholder, hardcoded a second time at `taskIndex.ts:777` where a rename would silently write `'0.0.0'` | `package.json:6` | Yes |
| 8 | **linkify manufactures bogus external links** — bare filenames become domains (`conventions.md` → `http://conventions.md` → system browser). **133 such pseudo-links measured across the two real tasks**, 97 in `work-log.md` alone | `src/panel/render.ts:201` | Yes |
| 9 | Multi-root attribution wipes itself — only tasks in the last workspace folder keep an author | `src/index/taskIndex.ts:658-676` | Yes |
| 10 | Persisted index and persisted panel location are trusted more than their comments claim — `artifactRelPath` never runs through containment | `panel.ts:1481`, `taskIndex.ts:232-260` | Yes |
| 11 | Existing-terminal launch branch skips the shell quoting the new-terminal branch applies | `src/launch/launch.ts:294` | Yes |
| 12 | Overview re-implements the trust gate the allowlist should own, and `JSON.stringify(undefined)` throws in its refusal log | `messages.ts:387,455`, `overviewView.ts:459-465` | Yes |
| 13 | Workspace folders added after activation are never watched | `src/extension.ts:33` | Yes |
| 14 | Spec's A2 table still lists `setGroupBy`, which both validators refuse | `implementation/spec.md:118` | Yes |
| 15 | No test asserts that every contributed command is registered — the gap that let #5 ship | `test/` | Yes |

### Info
`panel.ts` at 1,502 lines holds ~700 lines of pure payload logic behind a `vscode` import (highest-value refactor); `parseState()` is a single 208-line function; three dead strings and an unread `extensionVersion`; ~40 unnecessary `export`s; five duplicated webview bootstraps; `test/dom/harness.ts` keeps its own copy of the host shell; no `.vscode/launch.json`; undeclared Node floor (>=22.6 is required); orphan `prettier` dependency; no gallery `icon`/`categories`/`keywords`; unminified 679 KB bundle with a dangling sourcemap reference; the output channel is undiscoverable; unreadable state files vanish from the tree; parse issues surface only in the fallback view.

## Visual fidelity
Not produced in this phase — `verification/visual-fidelity.md` is written by the E2E verifier in Phase 12, which has not run yet. The DOM suite's structural comparison against all five screen mockups passed; the eye-level mockup comparison is manual checklist item 6.

## Overall assessment

| Dimension | Result |
|---|---|
| Implementation plan | 99/101 steps (98%) — 2 deferred to a human |
| Test suite | 87/87 passing (100%) across four harnesses — up from 71 |
| Standards compliance | Compliant (10/10 applicable) |
| Documentation | Complete |
| Code review | ❌ 4 critical at the time — **all closed and re-verified** |
| Pragmatic review | ⚠️ 1 high (false completion) — **closed** |
| Production readiness | GO with mitigations — **2 of 3 blockers closed**; the unsigned checklist remains |
| Reality check | NO-GO for distribution at the time — **the packaging and command blockers are closed**; the checklist still gates it |
| Fix rounds | 2 — all 6 criticals closed, each re-verified by execution |
| **Overall** | **⚠️ Passed with issues — 0 critical open, 8 known issues logged** |

## Recommendations

**Must fix before this can ship or be checklist-verified** (~3–4 h, all mechanical):
1. `resolveInside` — decode before normalizing; reject `..`/absolute/backslash segments; add the three encoded cases to `messages.test.ts`. One fix closes five message types.
2. Remove `maxAliasCount: -1`; cap state-file size before read.
3. Require a `<head>` insertion point in `signatureOf` so an unplaceable CSP degrades to the fallback.
4. Decide `src`-ness by attribute parsing, not regex lookahead.
5. Register or delete `maister.revealInExplorer`, and add the registered ⊇ contributed test.
6. Add `repository`, fix the CHANGELOG link, re-run `vsce package` to exit 0.
7. Fix linkify — resolve a bare in-task filename to artifact navigation, plain text otherwise.

**Then**: run and sign all 7 manual checklist items, exercising one real end-to-end launch during item 3.

**Follow-ups, not blocking**: extract `panel/payloads.ts`; widen the AC13 scan; re-benchmark on realistically sized fixtures; drop A2's `setGroupBy` row; complete step 11.6 with the user; raise R10 as a v0.2 spec amendment.

## Verification checklist
- [x] Completeness check — passed with issues
- [x] Test suite — verified green (skipped per options; re-run independently twice)
- [x] Code review — critical issues found
- [x] Pragmatic review — appropriate with specific excess
- [x] Production readiness — GO with mitigations
- [x] Reality assessment — issues found, NO-GO for distribution
- [ ] Manual checklist (7 items) — **unsigned; requires a human at a live VS Code host**

---

## Fix & Re-Verification History

Two fix rounds were run inside Phase 11. Every fix carries a regression test that was confirmed failing before the fix.

### Round 1 — the five criticals from the first pass, plus packaging

| Issue | Fix | Re-check outcome |
|---|---|---|
| **C1** containment bypass (`resolveInside` decoded after normalizing) | Strip `#`/`?` tail → decode → normalize → contain, extracted to a shared `src/model/relPath.ts` (`containedRelPath`) that `parseState` also uses | **Resolved.** Re-verified with a 45-case battery: the three original traversals, two more the implementer found (`%2e%2e%5c…`, `%2f%2f…`), mixed case, overlong and surrogate UTF-8 (decode throws → fails closed), UNC, absolute and scheme forms, double encoding (safe — nothing decodes twice), bare `..`. All refused; legitimate paths still normalize. N12 not weakened. |
| **C2** nonce granted to a remote `<script src>` | Regex lookahead replaced by a tag-by-tag attribute-parsing scanner | **Resolved.** 10 tag-syntax variants now classified as Chromium classifies them: slash- and newline-separated attributes, spaces around `=`, unquoted/single-quoted, duplicate `src`, casing, unterminated quote (document refused). The `EXISTING_CSP_META` sibling bug is closed too. |
| **C3** a document hosted with **no CSP at all** | *Round 1 fix did not hold* — see round 2 | **Initially NOT resolved.** Re-verification proved in real Chromium that five task-authored documents were still hosted with zero policy: `<head>` inside `<noscript>`, inside `<template>`, plainly in `<body>`, inside an attribute value, and inside live script text (because `/<\/script/gi` matched `</scriptx`). |
| **C4** `maxAliasCount: -1` | Library default restored; a 2 MiB cap checked before `readFile` on both read paths; the swallowed YAML error reason now surfaced | **Resolved.** Four bomb shapes fail in 4–21 ms with the library's own "Excessive alias count" message, RSS delta ≤ 30 MB. Deep nesting without aliases is caught as a recorded `RangeError`. |
| **C5** `maister.revealInExplorer` contributed but never registered | Registered with a shared `sourceUri()` helper; a named `folderUri` with no artifact targets that task's state file | **Resolved.** `openSource` not regressed. The required test — `getCommands(true)` ⊇ every contributed id, read from the live manifest — was confirmed failing when the registration was removed. |
| **Packaging** `vsce package` failed | `repository`/`bugs`/`homepage` added, CHANGELOG link absolutized, the unread `extensionVersion` dropped | **Resolved.** Exits 0, produces a 16-file / 196 KB `.vsix`. `extensionVersion` confirmed to have zero readers repo-wide. |
| **`openFile`** (found during the fix pass, not in the original review) | The validated message now carries its own `folderUri`; dispatch joins against that folder, not `folders[0]`; the path is decoded and normalized | **Resolved**, both halves. The producer's frame of reference was checked too — `render.ts`'s `workspaceFile()` and the consumer now agree, which they did not under `folders[0]` in a multi-root workspace. |

### Round 2 — C3, and a critical the first pass missed

| Issue | Fix | Re-check outcome |
|---|---|---|
| **C3** (reopened) | Best-effort scanning replaced by a **strict prefix grammar matched from byte 0**: `[BOM] → whitespace → optional doctype → <html …> → whitespace/comments → <head …>`. Anything else is refused to the § 5.4 fallback. `closingScriptAt` aligned with Chromium's RAWTEXT rule (`/<\/script(?=[\s/>])/gi`). `head` removed from the scanner, so the C2 attribute parsing is untouched. | **Resolved.** All five proven vectors refused, asserted against both `hostDashboardHtml` and `recognize()`. Confirmed red first by temporarily restoring the old lookup. **21 of 21 committed HTML files in this repo still host**, including both real task dashboards and the plugin's own asset — the feature is not dead. |
| **N1** (new, pre-existing, missed in pass 1) — `shim.ts` nonced any script whose `src` merely *contained* `dashboard-data.js`, so a remote `…/vendor/dashboard-data.js` executed under the policy. Proven in Chromium against the built shim. | `isDataScript()` compares the resolved URL's origin **and exact path** against the `<base>` the extension inserted; the query string is excluded so `?t=<epoch>` keeps working. | **Resolved.** Confirmed red first by restoring the substring check and rebuilding. **Deliberate deviation from the reviewer's suggested expression**: `origin === location.origin` would have broken production, where the webview document is `vscode-webview://<uuid>` and its resources are served from `vscode-cdn.net` — cross-origin by design. Comparing against the inserted `<base>` is strictly narrower in every other respect. |

### Test growth across the fix rounds

| | First pass | After round 1 | After round 2 |
|---|---|---|---|
| Unit | 37 | 46 | **48** |
| Integration (trusted + untrusted) | 28 + 1 | 31 + 1 | **31 + 1** |
| DOM (Chromium) | 5 | 5 | **7** |
| **Total** | **71** | **83** | **87** |

The two new DOM tests are the significant ones: they assert the CSP is *present and enforced* (an injected unnonced inline script does not run, an inline event handler does not run, `securitypolicyviolation` fires) and that a cross-origin `dashboard-data.js` gets no nonce while the legitimate one still loads. As the re-verification noted, the original AC3 check could not have caught any C3 vector, because in every one there was no policy to violate.

## Known issues carried forward (logged by user decision, not fixed)

| # | Issue | Severity |
|---|---|---|
| W1 | Multi-root attribution wipes itself — only the last workspace folder's tasks keep an author | warning |
| W2 | Persisted index entries skip containment on `artifactRelPath` — the last surviving instance of C1's root cause; needs write access to the extension's global storage; `revealInExplorer` added a sink | warning |
| W3 | The existing-terminal launch branch skips the shell quoting the new-terminal branch applies | warning |
| W4 | Overview re-implements the trust gate the allowlist should own; its refusal log throws on `undefined` | warning |
| W5 | Workspace folders added after activation are never watched | warning |
| N2 | The panel never restores its location — no bundle writes a `PanelLocation`, so a reloaded window always falls back to Dashboard mode (§ 5.1 unmet) | warning |
| N3 | Control characters survive containment (`a%00.md`); not exploitable today | info |
| N4 | A task-authored `<base href>` placed before ours wins; contained by the CSP | info |

Plus the pragmatic review's structural recommendations (extract `panel/payloads.ts`; split `parseState()`; three dead strings; ~40 unnecessary `export`s; five duplicated webview bootstraps; the DOM harness's copy of the host shell; no `.vscode/launch.json`; undeclared Node floor; orphan `prettier`), and the production reviewer's polish items (gallery `icon`/`categories`/`keywords`, minification, a discoverable output channel).
