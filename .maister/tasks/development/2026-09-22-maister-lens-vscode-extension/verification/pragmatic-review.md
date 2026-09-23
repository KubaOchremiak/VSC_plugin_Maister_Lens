# Pragmatic Review — Maister Lens

## TL;DR
The spec-audit's worry did **not** materialise: 9,409 src lines / 30 modules is proportionate to what was built, all seven "extra" modules have real callers (most 3–18), and there is essentially no dead code or speculative abstraction.
Status: ⚠️ **Appropriate with specific excess.**
One real defect: `maister.revealInExplorer` is contributed in `package.json` with three menu rows and never registered — invoking it errors, and `test/unit/manifest.test.ts` locks the broken state in.
The one place complexity outruns the problem is the **persisted index**, and that was the spec's (R10) call, not the implementer's: its own benchmark proves it saves ~230 ms at 300 tasks, i.e. ~8 ms at real scale, for ~200 lines and a class of staleness/corruption failure modes.
Four harnesses are justified (two by concrete documented platform obstacles); the Playwright one is oversized, not unnecessary.

## Key Decisions
- Module count was judged by counting **actual import sites**, not by the work-log's claims. All seven extras verified: `strings.ts` (18 src importers), `webview/components.ts` (5), `index/query.ts` (3 + unit tests), `views/relativeTime.ts` (3), `panel/messages.ts` (2, and it was a MOVE not a copy), `model/risks.ts` (2), `launch/host.ts` (1, the vscode adapter that keeps `launch.ts` testable).
- "The code over-engineered this" was separated from "the spec asked for this". The index machinery is the latter, reported as a spec-level recommendation rather than an implementation fault.

## Open Questions / Risks
1. **No test asserts that every contributed command is registered.** That ~6-line integration test (`vscode.commands.getCommands(true)` ⊇ the manifest's command ids) is the cheapest test in the suite and is the one that was missing — its absence is why finding 1 shipped.
2. Whether R10 (persistence) survives into v0.2 is a product call, not a code call. The data to make it is already in `work-log.md`.
3. `DashboardRecognizer`'s cache never evicts, while the other two caches are LRU(20) and LRU(30). Three caches, three policies, no stated reason for the difference.

---

## Findings

### 1 · HIGH — `maister.revealInExplorer` is a contributed command with no implementation
`package.json:82` declares it plus **three** menu rows — `view/item/context` (183), `editor/title` (280), `commandPalette` (322, hidden per A4). `grep -rn "revealInExplorer" src` returns **zero** hits. `src/panel/panel.ts:1415-1467` registers 17 commands; this is not one of them. A user right-clicking a task node and choosing "Reveal in Explorer" gets `command 'maister.revealInExplorer' not found`.

Worse, `test/unit/manifest.test.ts:42` lists it in `TASK_ARGUMENT_COMMANDS` and asserts it is contributed and palette-hidden — the test suite actively certifies the broken surface. This is what `minimal-implementation.md`'s "no future stubs" forbids, and it reached the manifest because manifest tests check *contribution* while nothing checks *registration*.

**Fix**: either register it (`vscode.commands.executeCommand('revealInExplorer', uri)` — ~4 lines beside `openArtifactSource`) or delete the command, its three menu rows and the test entry. **Plus** add the registration-coverage test.

### 2 · MEDIUM-HIGH — the persisted index layer does not earn its keep at real scale
`src/index/taskIndex.ts` spends ~200 lines on persistence alone: `readPersisted` (690–746), `persist` (759–791), `schedulePersist`/`flush`, `serializeTask`/`deserializeTask` (223–260), `Stat`/`sameStat`/`artifactStats` reconciliation, a `SCHEMA_VERSION` gate, a registry gate, containment re-validation, atomic rename, a retry timer and a corrupt-discard path.

Its own benchmark measures **cold index of 300 generated tasks at 229.3 ms**. A typical workspace holds a handful of task folders, so the cold scan this layer avoids costs single-digit milliseconds. The warm comparison (14.1 ms) is a saving of ~215 ms in a case that does not occur, and ~5 ms in the case that does. Against that, every failure mode it introduces is real and had to be coded for.

The two-tier design (R8) is fine and the LRU(20) is 12 lines. It is specifically **R10** — disk persistence — that buys nothing here.

**Recommendation (spec-level, follow-up)**: drop R10; keep tier-1/tier-2 in memory and rebuild on activation. Removes ~200 lines, the `storageUri` dependency, the persist-failure notification, the retry timer, `flush()` in `deactivate`, the version-gate branch, and the tests that exist only to prove the persisted file invalidates. **Do not do this inside the current task** — it contradicts the authoritative spec.

**Immediate, uncontroversial part**: `taskIndex.ts:777` writes `extensionVersion` into the persisted payload and **nothing ever reads it**. That is a future stub in the literal sense. Delete it.

### 3 · MEDIUM — `src/panel/panel.ts` is 1,502 lines and holds the largest body of pure logic behind a `vscode` import
`TaskPanel` owns webview lifecycle, history, message dispatch, hosted-dashboard insertion, artifact rendering **and** all three payload builders: `dashboardPayload` (654–810), `createdPerWeek`, `dashboardRow`, `risksPayload` (854–881), `riskGroup`, `risksKpis`, `riskTypeFacets` (955–1008), `buildFallback` (1167, 71 lines), `heroesFor`, plus module-level `filterChips` (180, 65 lines), `groupDecisions`, `listedFiles` and four ordering tables. That is roughly **700 lines of pure `Task[] → Payload` transformation with no VS Code dependency**.

This contradicts the convention the project otherwise applies rigorously: `panel/messages.ts`, `index/query.ts`, `model/workflows.ts`, `views/relativeTime.ts` and `launch/launch.ts` were all extracted so plain mocha could test them. The largest pure surface is the one that did not get that treatment, and the cost shows — `dashboardMode.test.ts` (252 lines) and `risksMode.test.ts` (230) boot an Electron host to assert arithmetic.

**Recommendation**: extract `src/panel/payloads.ts` taking `(tasks, query, now, quietDays)`. `TaskPanel` drops to ~800 lines and several integration tests become unit tests. Mechanical — the builders already take `now` as an injectable parameter. **Highest-value single refactor in the codebase.**

### 4 · MEDIUM — four harnesses: three earn it, the DOM harness is oversized and duplicates the host shell

| Harness | Infra lines | Tests | Verdict |
|---|---|---|---|
| mocha unit | ~64 | 37 | Clearly right. Zero ceremony. |
| trusted integration | ~500 | 28 | Justified — the host is the only place the index, trees and panels exist. |
| untrusted integration | 84 | 1 | **Justified and well-reasoned.** `runTests()` appends `--disable-workspace-trust` unconditionally, so AC15 is unassertable any other way. 84 lines to genuinely test a security gate is a bargain. |
| Playwright DOM | **568** + 224 spec | 5 | Justified in kind, oversized in degree (~158 infra lines per test). |

Two of the five DOM tests genuinely need a browser (the shim executing real `dashboard-data.js` under a nonce; tab order, which jsdom does not implement). The other three are structure assertions a browser is a heavyweight way to reach — though nearly free once the harness exists.

The concrete problem is **duplication, not cost**: `test/dom/harness.ts:53` defines its own `shellHtml()`, a second copy of the document `panel.ts` `bundleHtml()` and `overviewView.ts` build for real, with a different root element, no CSP and no nonce. Nothing keeps them in sync, so the DOM suite can stay green while the shipped document changes.

**Recommendation**: export the shell builder from `panel.ts` (or `panel/shell.ts`) and have the harness call it. Do not cut the harness — A10/AC14 need it.

**On the benchmark**: it paid for itself once, by retiring AC7/AC9 and by producing the number that undermines finding 2. Keep it, but treat it as a one-shot artifact.

### 5 · MEDIUM — `parseState()` is a single 208-line function
`src/model/parseState.ts:398-606`. The only clear violation of "focused functions". Mitigating: it is sectioned by spec rule with comments (`// N3 — status.`, `// N7`, `// A17`…), each section 10–25 lines, and it reads well.

**Recommendation**: the comment boundaries are already the function boundaries. Extract `parseStatus`, `parseTags`, `parsePriority`, `parseCompletedPhases`, `parseDomainContext`, `parsePhaseSummaries`. `parseState` becomes ~50 lines of orchestration and each N-rule becomes independently unit-testable.

### 6 · LOW — dead strings and an over-exported surface
Three strings in `src/strings.ts` have no reader anywhere: `FALLBACK.typeBadge: '{type}'` (222, additionally a no-op format string), `READER.checklistLabel` (377), `READER.documentLabel` (378). Delete all three. (The other 28 "unreferenced" keys are dynamically indexed lookup maps and are fine.)

Separately, ~40 symbols are `export`ed but referenced only inside their defining file. None is dead code, but each is public API nobody asked for. ESLint will not catch this; it is a one-time sweep.

`RenderCache<T>` (`render.ts:376`) is generic with exactly one instantiation. Make it concrete.

### 7 · LOW — five duplicated webview bootstraps
`overview.ts:371`, `fallbackTask.ts:306`, `reader.ts:263`, `dashboardMode.ts:542`, `risksMode.ts:479` each carry a near-identical message listener with the same shape guard, an identical `post()` and an identical 3-line `saveState` — ~60 lines of copy.

The work-log's reason for not sharing (`components.ts` cannot call `acquireVsCodeApi()` twice) is correct but only rules out the naive fold. A factory — `bootstrap<T>(type, onPayload)` called once per bundle with the bundle's own `api` — shrinks each file by ~12 lines and puts the message-shape guard in one place.

The per-bundle `readState()` implementations are **correctly** not shared — each validates a different shape, which `validation.md` requires.

### 8 · LOW — developer-experience gaps in the repo, not the code
- **No `.vscode/launch.json`.** For a VS Code extension this is the primary dev loop; without it a contributor cannot press F5. README never mentions debugging either. ~15 lines, highest DX return here.
- **The Node floor is undeclared.** `engines` names only `vscode`, but `npm test` relies on native TypeScript stripping and every import carries a `.ts` specifier. On Node 20 the unit suite fails opaquely. Add `"node": ">=22.6"` and a README line.
- **`prettier@^3.3.3` is an orphan dev dependency** — no config, no script, no plugin, no reference. Either wire it up or remove it; today it satisfies neither `conventions.md` nor `coding-style.md`.

---

## What the code got right
- `src/extension.ts` is **47 lines** and reads like a table of contents.
- Runtime dependencies are exactly two. Charts are hand-written SVG. `markdown-it`'s `html:false` *is* the sanitization strategy — no sanitizer dependency. `@types/markdown-it` was avoided with a 57-line hand-written `.d.ts` covering only the used API.
- **No enterprise patterns.** Four launch targets behind one `switch` — no Strategy, no registry, no plugin interface. `LaunchHost` is an interface with one real implementation and one test fake, which is the correct use of an interface.
- **Settings are five and all load-bearing.** No feature flags, no unused config.
- Debounce/throttle in `watcher.ts` is not premature — Maister rewrites state in bursts, an observed behaviour.
- **Honest reporting.** `work-log.md` records a skipped TDD gate with the mutation run used to compensate, two deferred steps, and a seven-item residual gap list. Unusual, and it made this review faster.
- Test-to-source ratio 0.58 (5,455 test lines, 71 tests). Group 12 was capped at ten new tests and wrote six, declining to pad.

## Recommended priority
1. **Register or delete `maister.revealInExplorer`, and add the contributed-commands-are-registered test.** ~30 min.
2. **Extract the payload builders into `panel/payloads.ts`.** ~2–3 h. 1,502 → ~800 lines; several integration tests become unit tests.
3. **Sweep the small debt in one pass**: delete the three dead strings and `extensionVersion`; de-generalise `RenderCache`; fold the five bootstraps; drop unreferenced `export`s; add `.vscode/launch.json` and the Node floor; resolve prettier. ~2 h, all mechanical.
4. **Fold `test/dom/harness.ts`'s `shellHtml()` into the real shell builder.** ~1 h.
5. **Raise R10 (index persistence) as a spec amendment for v0.2**, with the 229 ms benchmark as evidence. Not in this task.
