# Reality Check — Maister Lens VS Code extension

## TL;DR
The suite is real and the claims hold: 37 unit + 28 trusted + 1 untrusted integration + 5 DOM = **71 passing, 0 failing, lint and tsc clean**, re-run independently. The tests I sampled assert substance, not tautologies.
Run against this repository's own two real task folders, the production parser, recognizer, renderer and next-action derivation all behave correctly — no parse errors, both dashboards hostable, all 25 registered artifacts present, real commands composed correctly.
But three defects the work log's gap list misses: **`maister.revealInExplorer` is contributed to two user-visible menus and never registered** (error toast on click), **`vsce package` fails today** (CHANGELOG link + missing `repository`), and **markdown linkify manufactures 133 bogus `http://<filename>.md` external links** across the two real tasks, sending the user to the system browser — the one place criterion 2 actually breaks on real data.
Status: **⚠️ Issues Found — not ready to hand to the three personas**, but much closer than most work at this stage. None of the three defects is architectural; all are hours of work.
Criteria 2, 3 and 4 are substantially met in the automated half; criterion 1 cannot be claimed at all until the unsigned checklist is executed, because no human has yet seen a single surface render in a live host.

## Key Decisions
- I accept group 12's placement of AC3's insertion assertions in unit rather than integration. I read the test: it asserts nonce freshness and entropy, positional placement after `<meta charset>`, removal of the source CSP, exact policy text, script count, and byte-equality of everything else. Moving it to integration would weaken it, not strengthen it. Gap-list item 6 can be closed as "agreed, no action".
- I accept `taskOf()` (gap item 2) as a residual risk rather than a defect. I read it — 12 lines, one shape check, one map lookup, one logged miss. The untested surface is trivial and its failure mode is a logged no-op.
- I treat the linkify behaviour as a defect rather than a cosmetic nit, because it is the extension telling the user that a word is a link to somewhere it is not — which is the honesty criterion, applied to navigation.

## Open Questions / Risks
- Was `maister.revealInExplorer` ever intended to ship, or should the manifest lose the two menu rows? feature-spec § 4.3 lists it as a real command, so "delete it" needs an owner's decision, not an implementer's.
- `publisher: "maister"` is a placeholder and `repository` is absent. Someone has to own the marketplace identity before 0.1.0 is installable by anyone but its author.
- The benchmark's generated tasks are 20–40× smaller than this repo's real ones. The conclusion survives (I measured 340 ms of parse cost for 300 real-sized tasks against a 5 s budget) but the published 229.3 ms figure is not representative of real Maister output.

---

## 1. Independent verification of the claims

Everything below was re-run by me, not taken from the work log.

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | clean |
| Types | `npx tsc --noEmit` | exit 0 |
| Unit | `npm test` | **37 passing**, 0 failing (52 ms) |
| Integration | `npm run test:integration` | **28 passing** trusted (4 s) + **1 passing** untrusted |
| DOM | `npm run test:dom` | **5 passed** (1.9 s) |
| Runtime deps | `npm ls --prod --depth=0` | exactly `markdown-it@14.3.2`, `yaml@2.9.1` |
| **Package** | `npx @vscode/vsce package` | **FAILS** — see finding R2 |

**The 71-test claim is true.** The work log's numbers match mine exactly.

### Are the tests asserting real behaviour?

I read four of the load-bearing ones rather than trusting the count.

- `test/unit/hostDashboard.test.ts` (AC3) — asserts the nonce is a fresh 32 random bytes and differs between renders, that the CSP meta lands *immediately* after `<meta charset>` (positionally, by string index), that the source file's own CSP is gone, that exactly two `<script`s exist afterwards, and then reconstructs the original document by reversing the five declared edits and compares it byte-for-byte to the input. This is one of the stronger tests I have seen in a verification pass. Not a tautology.
- `test/integration/panel.test.ts` (AC4) — counts editor tabs before and after a `navigate`, asserts the count is unchanged, asserts the log contains no `openExternal`/browser line, then fires an out-of-folder `../elsewhere/dashboard.html` and asserts the panel did **not** move and that the refusal was logged. Real behaviour, real negative cases.
- `test/dom/surfaces.spec.ts` — I confirmed the fixture it drives (`test/fixtures/tasks/dev-real/dashboard.html`) is **byte-identical** (`cmp`) to this task's real `dashboard.html`. The AC4 DOM half therefore clicks a link in Maister's actual dashboard, not a mock of one.
- `test/unit/manifest.test.ts` — genuine (it reads the real `package.json` and asserts palette `when: false` per command), but see finding R1: it enumerates `maister.revealInExplorer` and still never notices it is unimplemented.

I found **no vacuous test** in what I sampled. Group 5's mutation run and group 12's fixture-side red→green corrections are consistent with what I read.

---

## 2. The sharpest test: the two real task folders

I ran this repository's own `.maister/tasks/development/2026-09-22-maister-lens-vscode-extension/` and `.maister/tasks/product-design/2026-09-22-maister-viewer-vscode-plugin/` through the **production modules** (`parseState`, `parseSummary`, `deriveNextAction`, `collectRisks`, `renderArtifact`, `companionHtml`, `DashboardRecognizer`'s signature rules), outside the test suite.

| What | development task | product-design task |
|---|---|---|
| Type / status / verdict | `development` / `in_progress` / none | `product-design` / `completed` / none |
| Title | read from state, correct | read from state, correct |
| Phases | 14 derived, `phase-11` current, gaps marked `not_recorded` | 9, all completed, no current |
| Decisions / risks | 32 / 27 (27 open) | 34 / 41 (40 open) |
| Artifacts registered | 11, **all 11 present on disk**, heroes flagged | 14, **all 14 present**, `.html` companions all present |
| Parse issues | **none** | one honest warning: *"Recorded started phase is phase-8, while the phases on disk point to no current phase; the phases on disk are shown."* |
| Next action | `resume` → `/maister:work .maister/tasks/development/2026-09-22-maister-lens-vscode-extension` | `startDevelopment` (brief present) → `/maister:development .maister/tasks/product-design/2026-09-22-maister-viewer-vscode-plugin` |
| Dashboard hostable? | **yes** — all four signature signals present, no iframe | **yes** |
| Tier-2 summaries | parsed on every `.md` I sampled (TL;DR + decisions + risks counts non-zero) | same |

I also rendered the largest real artifacts through `renderArtifact`: `implementation/spec.md` (60 KB, summary + 33 headings), `implementation/implementation-plan.md` (checklist correctly counted **111 done / 120 total / 2 skipped** — matching the plan's own state), `analysis/feature-spec.md` (92 KB → 118 KB of body HTML), `outputs/product-brief.md`. No raw `<script>` survived any render. `companionHtml()` re-hosted the real 70 KB `spec.html` successfully. Every real artifact is far under the 2 MB ceiling (largest: 128 KB).

I also checked the real `dashboard.html` for CSP hazards the manual item 1 will hit: **no inline event handlers, no `fetch`/`XHR`/`WebSocket`, no external resource references.** The `default-src 'none'` policy with no `connect-src` will not break it. Its links are in-task relative paths (`implementation/spec.html`, `analysis/gap-analysis.md`), which `route()` maps to rendered artifact mode. The probability that manual items 1, 2 and 7 pass is high — but they are still unsigned, and "high probability" is not "verified".

**Verdict on the sharpest test: the extension would read these two folders correctly.** The model layer is genuinely production-quality on real, un-fixtured Maister output.

---

## 3. Findings not in the work log's gap list

### R1 — CRITICAL false completion: `maister.revealInExplorer` is contributed but never implemented

**Claim:** all 18 contributed commands ship; group 6 carried forward "groups 7/9 must register `maister.panel.toggleVariant` and `maister.openArtifactSource`" — both were.
**Reality:** `maister.revealInExplorer` is registered **nowhere**.

Evidence:
- `grep -rn "registerCommand(\s*'maister.revealInExplorer'" src/` → **0 hits**. Every other one of the 18 contributed commands → 1 hit.
- `grep -c revealInExplorer dist/extension.js` → **0**. It is absent from the built bundle.
- It is user-reachable from **two** surfaces:
  - `view/item/context`, `when: view == maister.now && viewItem =~ /^(task|artifact)\./`, group `2_open@2` — i.e. right-click on **every** task and artifact node in the Now tree shows a **Reveal in Explorer** item.
  - `editor/title`, `when: activeWebviewPanelId == 'maister.panel' && maister.panel.mode != 'dashboard'`, `navigation@8` — a `folder-opened` toolbar button on the panel in Task, Artifact and Risks modes. I confirmed `panel.ts:applyContextKeys()` really does set `maister.panel.mode`, so the button really will appear.
- It is specified: `feature-spec.md` § 4.3 line 91 (*"Reveal in Explorer | Context menu on tasks and artifacts"*), § 4.4 line 169 and § 8.4 line 744 (icon table). `spec.md` line 150 names it among the A4 palette-hidden commands.

**Failure scenario:** Marek right-clicks a task in Now and chooses *Reveal in Explorer*, or clicks the folder icon in the panel toolbar. VS Code raises the notification `command 'maister.revealInExplorer' not found`. This happens on the very first exploratory right-click a new user performs, in an extension whose entire pitch is "you never need the file explorer, but here is the door when you do".

**Why nothing caught it:** `test/unit/manifest.test.ts` enumerates the command in `TASK_ARGUMENT_COMMANDS` and asserts only that it is hidden from the palette. No test asserts the registered-command set equals the contributed-command set. That assertion is one `getCommands(true)` call in the existing integration harness.

Severity: **Critical** for a first impression, trivial to fix (either ~4 lines delegating to `revealFileInOS`, or delete the two menu rows and the spec line).

### R2 — HIGH: the extension cannot be packaged today (regression introduced by group 11)

`npx @vscode/vsce package` **fails**:

```
ERROR  Couldn't detect the repository where this extension is published.
The link 'README.md' will be broken in CHANGELOG.md.
```

Cause: `CHANGELOG.md:39` contains `[README.md](README.md)` and `package.json` has **no `repository` field**. Group 2's work log correctly reports `vsce package` producing `maister-lens-0.1.0.vsix` — that was before group 11 wrote `CHANGELOG.md` in step 11.4, and packaging was never re-run afterwards.

**Failure scenario:** the manual checklist's own preparation step offers "or install the packaged `.vsix`" as the alternative to F5. That path does not exist. More broadly, nobody but the author can install this. Also `publisher` is the placeholder string `"maister"` (flagged in tech-stack.md, absent from the residual gap list).

Severity: **High** — a release blocker, a two-line fix (`repository` field, or `--baseContentUrl`).

### R3 — HIGH: linkify manufactures bogus external links out of bare filenames

`render.ts:201` configures `new MarkdownIt({ html: false, linkify: true })`. `linkify` treats `conventions.md`, `feature-spec.md` and similar bare filenames as domain names (`.md` is a real TLD), producing:

```html
<a href="#" data-external="http://conventions.md">conventions.md<span class="sr-only"> (opens in browser)</span></a>
```

`reader.ts:257` posts `{type:'openExternal', url}` for `data-external`; `messages.ts` allows any `http(s)` scheme; `panel.ts:501` calls `vscode.env.openExternal`. **A click opens the user's system browser on a nonexistent domain.**

I measured it across the real artifacts of both real tasks: **133 such pseudo-links in 7 files** — `implementation/work-log.md` alone has **97**, `analysis/codebase-analysis.md` 20, `implementation/spec.md` 2, with the rest spread over the design-context documents.

**Failure scenario:** Ada opens the work log rendered — the surface built for her — and sees ~97 blue underlined document names. She clicks one expecting the standards document; Chrome opens on `http://conventions.md` and fails to resolve. She has left the editor, which is precisely what criterion 1 forbids, and she has been shown a link that nothing on disk justifies, which is what criterion 4 forbids.

The existing unit test *"escapes raw HTML, renders GFM tables and **linkifies**"* asserts the behaviour that causes this — a test passing while encoding the defect.

Severity: **High** on user experience, zero on security (the `http(s)` allowlist and the `(opens in browser)` screen-reader suffix both hold). Fix options: disable `linkify`, or restrict it to schemes/`www.` prefixes, or resolve an in-task filename match to an artifact navigation instead (which would be *better* than the mockups promise).

### R4 — MEDIUM: the AC13 forbidden-word scan is narrower than the criterion

`test/unit/strings.test.ts` greps `src/strings.ts` only — which is exactly what the spec's traceability table scopes it to, so this is **not** a false completion. But `src/model/workflows.ts:66` carries `activeForm: 'Running E2E tests'`, and `nowTree.ts:61`, `overviewView.ts:152` and `panel.ts:165` all render `phase.activeForm` as the user-facing phase line for in-progress rows. So a user-visible string containing "Running" ships while the AC13 test reports the word absent.

It is defensible on the merits — it is Maister's own registry phase name describing a recorded activity, not an invented task state — but the claim "none of the forbidden state words appear" is not true of all user-facing copy, and the scan should cover `workflows.ts` and the webview bundles or the AC should say it covers `strings.ts`.

### R5 — MEDIUM: the benchmark fixtures are not representative of real Maister output

`test/helpers/generateTasks.ts` writes ~30-line state files and ~15-line artifacts. This repository's real state files are **13 KB and 26 KB**, and real artifacts run to **60–128 KB**. The reported AC9/AC7 figures (229.3 ms cold, 14.1 ms warm, 1.3 ms query for 300 tasks) are therefore optimistic by a wide factor.

I measured the gap: parsing the **real** development state file plus two **real** artifacts 300 times costs **340 ms** of pure CPU. Adding file I/O, the realistic cold index for 300 real tasks is order-of-magnitude ~1 s against a 5 s budget. **The AC9 conclusion survives**; the published number does not describe real data and should be annotated.

### R6 — LOW: the four launch commands are aliases

`host.ts:registerLaunchCommands` maps `runNextAction`, `resumeTask`, `startDevelopmentFromDesign`, `designFromResearch` and `developFromResearch` onto the same `run()`, which always dispatches `task.nextAction.id` and ignores which command was invoked (the last two narrow only the research continuation). This is correct per A2 — no surface may supply command text — but it means a menu row labelled **Resume** will launch `/maister:development` if the index says the next action is `startDevelopment`. In practice the menus are gated by `contextValue`, so the mismatch is unlikely; it is unasserted either way.

---

## 4. The brief's four success criteria, judged

### 1. "A live answer without leaving the editor" — ⚠️ **cannot be claimed; automated half is strong**

What is proven: the watcher surfaces a new `orchestrator-state.yml` and a rewritten description in the Now tree **within 1.5 s, inside a real VS Code host** (AC1 integration, passing); tree nodes carry full labels; the panel re-renders and re-posts an open artifact on a watcher change at the same location. What is not proven: **no human has seen any surface render in a live host.** Manual items 1, 5, 6 and 7 are unsigned. The DOM suite renders the real bundles in Chromium, which is strong circumstantial evidence, but a webview is not Chromium-with-defaults and the theme pass has never been done.

Additionally, R3 punctures this criterion on real data: the most-read artifact in this very task launches the user's browser 97 different ways.

### 2. "Rendered, always" — ✅ **met in the extension's own navigation, with one real-data leak**

Proven and re-verified by me:
- `route()` maps in-task `.md` → artifact/md and `.html` → artifact/html; `dashboard.html` → Task mode. The real dashboards emit exactly these relative paths, so real links land rendered.
- AC5 integration asserts every artifact navigation goes through `render.ts` and that `vscode.open` is reached **only** via the explicit `openSource` command. A dedicated test asserts no Now-tree node carries `vscode.open` or `openArtifactSource`.
- `companionHtml()` re-hosts the real `spec.html` so HTML companions render instead of showing markup — the specific pain point in the brief.
- Non-`.md`/`.html` targets deliberately open in the editor. That is correct: a `.yml` has no rendered form.

The leak is R3: 133 filename mentions are presented as links and go to the browser rather than to the rendered artifact. AC4's one live click remains unsigned.

### 3. "Recall in seconds" — ✅ **met, with a fixture-realism caveat**

Query 1.3 ms and cold index 229 ms over 300 generated tasks, both far inside budget; the search haystack genuinely covers title, description, tags, decisions, risks and each artifact's `summary.tldr` (group 12 closed the one fixture that had left `decisions` empty). Overview offers search, Mine/Everyone, status/type/attention tiles and four grouping modes including `month`. The realism caveat (R5) shrinks the margin but does not consume it.

### 4. "Honest state" — ✅ **the best-supported criterion, with two small dents**

On the real product-design task the parser emitted exactly the right warning about `started_phase: phase-8` conflicting with the phases on disk, and showed the disk. `collectRisks` carries no severity and no age — asserted by test and confirmed by me in the payload shape. Degraded paths (unreadable, unrecognized, untrusted, oversized) all produce a stated reason and a log line. AC15 is genuinely automated on a genuinely untrusted host (group 6's `untrustedHost.ts` finding about `--disable-workspace-trust` is real and the test asserts `isTrusted === false` first).

Dents: R4 (`Running E2E tests` is displayed copy outside the scan) and R3 (a link displayed where no link exists).

---

## 5. The work log's honest gap list — audited

| # | Gap as stated | Verdict |
|---|---|---|
| 1 | All 7 manual items unsigned; AC3/AC4/AC11/AC14 manual halves unverified | **Confirmed and complete.** I read the checklist: it is specific, step-by-step, with expected results and blank signature lines. Nothing in it is dischargeable by automation. |
| 2 | `taskOf()` untested | **Confirmed, and I downgrade it.** 12 lines, one shape guard, one map lookup, a logged miss. Failure mode is a no-op with a log line. Risk: negligible. |
| 3 | No end-to-end launch path exercised in the host | **Confirmed, and this is the one I would weight highest of the six.** Dispatch is spied in every AC17 test; composition is unit-tested; the junction — `executeCommand('maister.runNextAction', {folderUri})` → `taskOf` → `runNextAction` → a real target — has never run. Manual item 3 is the only thing that closes it. |
| 4 | `test:min` untrusted pass runs on the pinned version | **Confirmed, cosmetic.** |
| 5 | Undated month bucket unasserted | **Confirmed, cosmetic.** |
| 6 | AC3 insertions in unit rather than integration | **Confirmed — and I agree with the implementer.** Close it as "no action"; the unit test is stronger than an integration equivalent would be. |
| 7 | Spec follow-up: A2's table should lose `setGroupBy` | **Confirmed.** Documentation-only. |
| **8** | *(missing)* | **R1 — `maister.revealInExplorer` contributed on two menus, never registered.** |
| **9** | *(missing)* | **R2 — `vsce package` fails; no `repository`; placeholder publisher.** |
| **10** | *(missing)* | **R3 — linkify produces 133 bogus external links across the two real tasks.** |
| **11** | *(missing)* | **R4 — AC13's scan misses user-facing copy in `workflows.ts`.** |
| **12** | *(missing)* | **R5 — benchmark fixtures are 20–40× smaller than real Maister tasks.** |

The list is honest in tone and correct in every entry it makes. It is incomplete by five entries, and the three substantive omissions (R1–R3) share a cause: **everything the groups verified, they verified well; nothing re-verified the whole at the end.** R1 falls between group 2 (contributed it) and groups 6/7/9 (registered the others). R2 is group 2's check invalidated by group 11's file. R3 is invisible to every fixture because no fixture contains prose that mentions a filename — and every real Maister artifact does.

---

## 6. Pragmatic action plan

### Before a human can usefully run the manual checklist (blocking, ~2–3 h)

1. **Fix or remove `maister.revealInExplorer`** (R1). Register it (`revealFileInOS` on the task folder or artifact path, `{folderUri}`/`{folderUri, artifactRelPath}` payload as the A2 contract requires), or delete the two menu rows plus the `feature-spec.md` § 4.3/4.4/8.4 entries. *Done when:* the command either works from both surfaces or appears in neither.
2. **Add a registered-equals-contributed assertion** (R1's root cause). One integration test: `getCommands(true)` ⊇ every `contributes.commands[].command`. *Done when:* deleting a `registerCommand` call turns the suite red.
3. **Restore `vsce package`** (R2). Add `repository` to `package.json` (and decide the real `publisher`), or make the CHANGELOG link absolute. *Done when:* `npx vsce package` emits a `.vsix` and installing it into a clean profile activates on this workspace.

### Before the personas get it (high, ~3–4 h)

4. **Fix linkify** (R3). Recommended: keep `linkify` but resolve a bare in-task filename to an artifact navigation, and fall back to plain text when it resolves to nothing — that turns the defect into a feature Ada would name as the best thing in the reader. Minimum: disable `linkify` or require an explicit scheme. *Done when:* rendering this task's `work-log.md` produces **zero** `data-external` attributes whose host ends in `.md`/`.js`/`.yml`, asserted by a test that reads a real committed artifact.
5. **Execute and sign the 7-item manual checklist** against a host with two real task folders (this repository qualifies — use its own two). *Done when:* every item carries a signature and a date, and each failure has been raised and re-run. **No other work closes criterion 1.**
6. **Exercise one real end-to-end launch** (gap 3) during checklist item 3, and record in the item's notes which target was reached and what the status bar said.

### Before 0.1.0 is called done (medium)

7. Widen the AC13 scan to `workflows.ts` and the webview bundles, or amend AC13's stated scope (R4).
8. Re-run the benchmark against fixtures sized from real Maister output — 10–25 KB state files, 50–120 KB artifacts — and republish the figures with the fixture profile beside them (R5). Keep it non-gating.
9. Close spec follow-up 7 (drop the `setGroupBy` row from A2) and, if desired, assert the undated month-bucket placement.
10. Complete step 11.6 (`/maister:standards-update` for the § 8.6 testing standards) with the user, which is also what closes INDEX.md's "Testing standards: not initialized".

### Persona readiness after the above

- **Marek** — best served today. Now tree, live freshness, hero artifacts and rendered verification reports are all built and asserted. Blocked only by item 6 (his re-launch loop has never actually run end to end) and item 4 (his work logs are the densest source of bogus links).
- **Ada** — most exposed to R3, since the reader is her entire experience and prose mentioning filenames is what she reads. Items 4 and 5 are hers.
- **Irena** — best served by what is already proven: Dashboard KPIs, four charts as filters, cross-task Risks with `openRiskCount`, quiet markers and git attribution all have real integration assertions. One honesty note she should be told rather than discover: attribution comes from git, so an **uncommitted** task has no author — and on this very repository the in-flight development task is untracked, so it shows as *Not committed* and is excluded from *Mine*. The behaviour is correct and documented in `personas.md`'s risks; it just means her "who is working on what" answer is blank for exactly the newest work.

---

## 7. Deployment decision

**NO-GO for packaging or distribution** — R2 means there is no artifact to distribute.

**NO-GO for handing to the personas** until R1, R3 and the signed checklist land.

**GO for continuing to verification/review without rework of the architecture.** The model, index, panel, render and launch layers are well built, honestly documented and genuinely tested; the defects found are peripheral to the design and none requires re-opening a decision. This is a strong implementation with an incomplete final mile, not an implementation that only appears to work.
