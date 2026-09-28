## TL;DR
- Status: Appropriate. 3 of the 8 earlier findings are resolved (#1, #2, #5). Four info items still stand (#3, #4, #6, #7). #8 was optional and is unchanged.
- The fixes added a little complexity that is justified: a per-folder watcher Map rebuilt on folder change (about 30 LOC, correct for multi-root) and `parseVisionGoal` (10 LOC, which answers the reality-check finding).
- New (info): spec R4 still says the goal is taken "verbatim from INDEX.md", but the code now prefers vision.md, so the spec is out of date. `goalSource` is hard-coded to `project/vision.md`.
- Nothing blocks the merge.

## Earlier findings

| # | Earlier issue | Status | Evidence |
|---|---|---|---|
| 1 | `watchDocs` copied the `watcherExclude` check | Resolved | The exclude check is gone and `src/` has no `watcherExclude` reference outside `index/watcher.ts`. |
| 2 | `DocRenderPayload` stored `docsFolderUri`/`docRelPath` twice | Resolved | `render.ts` `DocRenderPayload` keeps only `location` + `docLabel`. `reader.ts` `docHeader` reads `payload.location.docRelPath`. |
| 3 | The `empty` flag is redundant with `sections.length === 0` | Still stands (info) | `panel.ts` `projectPayload` sets `empty: sections.length === 0`, and `projectMode.ts:31,118` reads it. |
| 4 | The three-way `mode === 'task' \|\| 'artifact' \|\| 'risks'` check is repeated | Still stands (info) | It appears at least 3 times in `panel.ts`: the folderUri getter, `workspaceRootUri` and the context-key site. A `folderUriOf(location)` helper would still remove about 10 LOC. |
| 5 | The `try/catch` in `projectPayload` set `indexText = ''` twice | Resolved | It was replaced by `readDoc()` (6 LOC), which INDEX.md and vision.md now share. It is a net improvement. |
| 6 | `RenderPayload.kind?: 'artifact'` is optional | Still stands (info) | `render.ts` still has `readonly kind?: 'artifact'`. The fix is trivial. |
| 7 | "← Project" back control plus a "Project › path" breadcrumb | Still stands, but the spec requires it | Spec summary line 4 asks for both explicitly, so this is not a code issue. Remove one only if the spec changes. |
| 8 | `row()` receives empty `statusGlyph`/`statusText`/`markers` props | Unchanged (optional) | `projectMode.ts:79-81`. This is acceptable reuse. |

## Complexity added by the fixes

### Watcher Map and folder-change rebuild (`panel.ts` `watchDocs` / `onDocsChange`, about 45 LOC)
- It is justified. One watcher per folder, keyed by folder URI, with a matching debounce-timer Map, is the minimum needed to (a) debounce per folder, (b) refresh only the open doc's folder, and (c) handle folders that are added or removed. `dispose()` clears both Maps, and a removed folder disposes its watcher and clears its timer.
- It could be simpler: a single `**/.maister/docs/**` glob watcher with one timer, which refreshes on any change. That would save about 20 LOC, but a doc view would then also refresh when a different folder changes. That cost is minor. The current version is fine and not worth reworking.
- No leak or dead branch was found.

### `parseVisionGoal` (`parseProjectDocs.ts:88-97`, 10 LOC plus unit tests)
- It is proportional. It answers reality-check #2, where the goal read as a description of vision.md rather than of the project. It falls back to INDEX.md's entry. It reuses `firstParagraph` and `SECTION_END`, so it has no new helpers.
- New issue N1 (info): the spec was not updated. Spec R4 and line 4 still say the goal is "taken verbatim from the Vision ... entries in INDEX.md", and only `work-log.md:83` records the change. Update R4 so the spec matches the code.
- New issue N2 (info): in `panel.ts` `projectPayload`, `goalSource: DOCS_VISION` is hard-coded, while INDEX.md's own backticked source is ignored whenever vision.md supplies the goal. In practice the two agree. It is only a concern if a project keeps vision.md somewhere else.
- The page now reads 2 files per folder instead of 1. That cost is negligible.

## Other observations
- The diff is now 16 files (+620/−66) plus the 2 new source files. It grew by about 20 LOC net since the first review, mostly from the watcher rebuild. No new dependencies or abstractions were added.
- `markdownUnder` recursion and `buildDoc` are unchanged and remain appropriate.

## Remaining issues (all info, none blocking)
1. #3: derive `empty` from `sections` (−2 fields, update 2 integration assertions).
2. #4: add a `folderUriOf(location)` helper (about −10 LOC).
3. #6: make `kind: 'artifact'` required.
4. N1: update spec R4 to say "vision.md first, INDEX.md as the fallback".
5. N2: optionally derive `goalSource` rather than hard-coding it.

Estimated effort: under 30 minutes.
