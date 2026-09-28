## TL;DR
- Status: Appropriate, with minor fat. No critical over-engineering; about 25–40 LOC could go.
- The feature reuses what already exists: the reader bundle, `renderArtifact`, `RenderCache`, `components.ts` and the message validator.
- Warnings: `watchDocs` copies the `watcherExclude` check and adds a skip that does nothing useful. `DocRenderPayload` stores `docsFolderUri`/`docRelPath` twice.
- Info: the `empty` flag can be derived from `sections`, the `mode` checks are repeated across `panel.ts`, and `projectPayload` catches errors twice.
- All findings can be fixed. None blocks the merge.

## Scope and scale
Scope: an uncommitted diff to 14 files (+598/−64) plus 2 new source files: `src/model/parseProjectDocs.ts` (135 LOC) and `src/webview/projectMode.ts` (141 LOC). It also adds 4 new test files. The product is a read-only VS Code extension with two runtime dependencies. The added complexity matches the feature: one new page, one new reader variant, and one new validated message.

What works well:
- The reader bundle serves both modes through a `kind: 'doc'` discriminator. No second reader was written.
- `RenderTarget` was generalised from `taskRelPath` to `baseRelPath` + `kind` instead of being copied. `classifyLink` got shorter: two branches became one expression.
- `validateDoc` follows the existing `validateArtifact` pattern: an allowlist of workspace folders, `resolveInside`, and the `.md` and `ANCHOR` checks.
- The INDEX parser is a small line scanner. It does not pull in a full markdown AST.

## Findings

| # | Severity | Location | Issue | Fixable |
|---|----------|----------|-------|---------|
| 1 | warning | `src/panel/panel.ts:1575-1597` (`watchDocs`) | Copies the `watcherExclude` predicate from `src/index/watcher.ts:156-157`. It also skips creating the watcher when `.maister` is excluded, which `TaskWatcher` does not do. An excluded watcher just never fires, so the skip adds a branch and a config read for nothing. It also checks per-folder config, while the original checks global config, so the two can now disagree. | Yes. Remove the exclude check, or export and reuse one `isMaisterWatcherExcluded()` (−6 LOC). |
| 2 | warning | `src/panel/render.ts` `DocRenderPayload`; `panel.ts` `buildDoc` | `docsFolderUri` and `docRelPath` are stored both at the top level and inside `location`. The reader uses `payload.location` for the key and the anchor, and `payload.docRelPath` for the breadcrumb, so two sources of truth can drift. | Yes. Keep `location` and drop the 2 duplicated fields. |
| 3 | info | `src/webview/projectMode.ts` `ProjectPayload.empty`; `panel.ts` `projectPayload` | `empty` always equals `sections.length === 0`. It is redundant state on the wire. | Yes. Derive it in `render`. Tests at `test/integration/projectMode.test.ts:84,105` need updating. |
| 4 | info | `src/panel/panel.ts` (about 5 sites: `folderUri` getter, `workspaceRootUri`, `localResourceRoots`, `onIndexChange`, context keys) | `location?.mode === 'task' \|\| 'artifact' \|\| 'risks'` is repeated wherever the old `!== 'dashboard'` check was. It is correct but noisy, and every future mode means touching every site. | Yes. Add a `folderUriOf(location)` helper (−10 LOC). |
| 5 | info | `src/panel/panel.ts` `projectPayload` | The `try/catch` around reading INDEX.md sets `indexText = ''` twice: once at the declaration and once in the catch. It is minor noise. | Yes. Use `.then(decode, () => '')` or an empty catch. |
| 6 | info | `src/panel/render.ts` `RenderPayload.kind?: 'artifact'` | The discriminator is optional on one arm, so narrowing only works because the doc arm's `kind` is required. This is acceptable, but a required `kind` on both arms is clearer. | Yes. Trivial. |
| 7 | info | `src/webview/reader.ts` `docHeader` | It renders a "← Project" back button and a "Project › path" breadcrumb, which are two controls that do the same thing. This is a minor UI redundancy; check whether the spec asks for both. | Yes, if the spec allows. |
| 8 | info | `src/webview/projectMode.ts` `row({... statusGlyph: '', statusText: '', markers: [] })` | The task-row component is reused for doc rows and fed empty props. This is pragmatic reuse, but it signals that `row` could make those props optional. | Yes, optionally. Not needed now. |

No critical issues. There are no new dependencies, infrastructure, speculative abstractions or dead code in the new modules. Every export in `parseProjectDocs.ts` is used.

## Developer experience
The changes read well and follow the existing patterns (strings in `strings.ts`, `el()` builders, validation-first messages). The main DX cost is finding #4: adding a mode means touching several scattered `mode` checks in the 1,700-line `panel.ts`.

## Requirements alignment
The requirement tags in the code (R2–R7, R11) map to the implementation. Nothing appears to go beyond spec, and the tech stack is shown verbatim with no inference.

## Top 3 simplifications
1. Drop the `watcherExclude` branch in `watchDocs`, or share one helper with `index/watcher.ts` (finding #1).
2. Remove the duplicated fields from `DocRenderPayload` and the `empty` flag (findings #2 and #3).
3. Add a `folderUriOf(location)` helper to replace the repeated three-way mode checks (finding #4).

Total estimated effort: under 1 hour; about 25–40 LOC removed.
