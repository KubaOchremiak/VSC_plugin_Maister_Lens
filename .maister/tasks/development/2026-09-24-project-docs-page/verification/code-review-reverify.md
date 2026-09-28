# Code Review Re-verification

**Date**: 2026-09-24
**Scope**: all (uncommitted diff + untracked src/test files)
**Status**: Clean of prior warnings; 3 new info items

## TL;DR
- W1, W2, W3, I1, I3 are resolved. I4 is partially addressed (behaviour correct; intent still implicit). I2 is an accepted design trade-off.
- The debounce is now a per-folder Map. Watchers are reconciled on `onDidChangeWorkspaceFolders` and removed folders are disposed. Everything is cleared in `dispose`.
- No regressions found. `DocRenderPayload` de-duplication type-checks through `Pick` + `satisfies`.
- New: 0 critical, 0 warnings, 3 info (vision-goal heuristic, no test for watcher reconciliation, silent docs watcher under watcherExclude).

## Prior findings
| ID | Status | Evidence |
|----|--------|----------|
| W1 per-folder debounce | Resolved | panel.ts:340 `docsTimers: Map`, 1619-1633 keyed per folder; timer deletes itself; dispose clears all (509-512) |
| W2 watchers rebuilt | Resolved (folders) | panel.ts:355 subscribes to `onDidChangeWorkspaceFolders`; 1589-1617 disposes removed folders' watchers and timers, adds new ones idempotently |
| W3 broad exclude guard | Resolved (guard removed) | No `watcherExclude` check left in panel.ts; see N3 |
| I1 dead openFile branch | Resolved | reader.ts:266-287 doc mode posts only `openDoc` |
| I2 lexical containment / symlinks | Still present (accepted trade-off) | messages.ts:226-243 unchanged |
| I3 log string | Resolved | strings.ts:224 `PANEL.docUnreadable`, used at panel.ts:1365 |
| I4 validateDoc intent | Partially | messages.ts:233 still calls `resolveInside(docsFolderUri, …)` without a clarifying comment; `a.md?x` still normalises silently |

## Regression check
- `DocRenderPayload` (render.ts:90-101) is the single definition; panel.ts:1329 uses `Pick<…>` and `satisfies`, and reader.ts imports it. OK.
- `watchDocs` reconciliation deletes from the Map while iterating it. That is safe for JS Maps.
- Project-mode refresh is triggered by any folder, and doc mode only by its own folder. OK.
- `parseVisionGoal` falls back to INDEX.md's tldr when vision.md is missing or empty (the `visionGoal ?` guard). OK.

## New findings (Info)

### N1: The vision goal takes the first `##` section, whatever its heading
- **Location**: src/model/parseProjectDocs.ts:~88-97 (`parseVisionGoal`)
- **Description**: For this repo it picks "Problem Statement", which works. A vision.md that opens with "Target Users" or a bullet list would show that text as the Goal. `firstParagraph` also joins list lines into one string.
- **Suggestion**: Prefer a heading that matches /goal|vision|problem/ and fall back to the first section.
- **Fixable**: true

### N2: No test covers watcher reconciliation or the per-folder debounce
- **Location**: test/integration/projectMode.test.ts, test/unit (no reference to `docsTimers` or `onDidChangeWorkspaceFolders`)
- **Description**: The W1 and W2 fixes are not locked in by tests. Only `parseVisionGoal` got new unit tests.
- **Suggestion**: Add an integration test: change docs in two folders within 200 ms and assert that both refresh.
- **Fixable**: true

### N3: With the exclude guard gone, live refresh fails silently under an excluding `files.watcherExclude`
- **Location**: src/panel/panel.ts:1589-1617
- **Description**: When a user's exclude covers `.maister/docs`, the watcher never fires. The index watcher's one-time notice (src/index/watcher.ts:152-172) covers this whenever it matches `.maister`, so users are mostly informed. Changes to `files.watcherExclude` still do not rebuild the watchers (the config half of W2), which matters less now that no guard reads the setting.
- **Suggestion**: None required. Optionally note this in the README.
- **Fixable**: false (accepted behaviour)

## Metrics
- Max function length: ~55 lines (`buildDoc`)
- Max nesting depth: 3
- Potential vulnerabilities: 0 new
