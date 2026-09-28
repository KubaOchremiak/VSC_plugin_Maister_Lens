# Code Review Report

**Date**: 2026-09-24
**Path**: uncommitted working tree (src/panel/{messages,panel,render}.ts, src/webview/{reader,projectMode}.ts, src/model/parseProjectDocs.ts, src/views/navTree.ts, src/strings.ts, package.json)
**Scope**: all
**Status**: Issues Found (no critical)

## TL;DR
- Security core is sound: `openDoc` requires an exact workspace-folder URI and a decoded, `containedRelPath`-normalized `.md` path; `..`, absolute, scheme and backslash paths are refused.
- Doc mode narrows `localResourceRoots` to extension media + `<folder>/.maister/docs`; project mode serves no workspace roots. `enableCommandUris: false` kept.
- Link classification in doc kind only emits `.md` as in-app links; everything else goes to contained `openFile`.
- Main issues sit in the docs watcher: one debounce timer shared by all folders, watchers never rebuilt when folders or settings change, and an overly broad `watcherExclude` check.
- 0 critical, 3 warnings, 4 info.

## Open Questions / Risks
- Symlinks inside `.maister/docs` are followed by `fs.readFile` and by the webview resource loader. That is acceptable for repo-authored content, but the containment is lexical, not a realpath check.
- Should the docs watcher follow `onDidChangeWorkspaceFolders`? Is there a spec requirement (R11) for folders added mid-session?
- Doc mode is not trust-gated. That is fine because rendering is read-only and markdown-it runs with `html:false`. Confirm this is intended.

## Summary
- **Critical**: 0
- **Warnings**: 3
- **Info**: 4

## Critical Issues
None.

## Warnings

### W1: A single debounce timer serves every workspace folder, so refreshes are lost
- **Location**: src/panel/panel.ts:1598-1609 (`onDocsChange`, `docsTimer`)
- **Description**: `clearTimeout(this.docsTimer)` cancels the pending callback, and that callback closed over the previous `folderUri`. If folder A's docs change and then folder B's docs change within 200 ms while a doc from A is open, the refresh for A is dropped.
- **Fix**: Keep one timer per folder (a `Map<string, Timeout>`), or have the callback check "any changed folder matches". Clear every timer in `dispose`.
- **Fixable**: true

### W2: Watchers are created once in the constructor and never rebuilt
- **Location**: src/panel/panel.ts:352 (`this.watchDocs()`), 1575-1596
- **Description**: Folders added later through `onDidChangeWorkspaceFolders`, and changes to `files.watcherExclude`, are not picked up. Watchers for removed folders stay alive until the panel is disposed. A Project page for a newly added folder never live-refreshes.
- **Fix**: Keep the docs watchers in their own disposable list. Rebuild it on `workspace.onDidChangeWorkspaceFolders` and on `onDidChangeConfiguration('files.watcherExclude')`.
- **Fixable**: true

### W3: The `watcherExclude` check is too broad
- **Location**: src/panel/panel.ts:1581
- **Description**: `pattern.includes('.maister')` turns off the docs watcher for any enabled exclude that mentions `.maister`, for example `**/.maister/tasks/**`. That pattern does not cover `.maister/docs`. The result is a silent loss of live refresh, which goes against the "honest state" criterion.
- **Fix**: Match the pattern against the actual docs path, for example with a glob test of `.maister/docs/x.md`, or only skip patterns that cover `.maister/**` or `.maister/docs/**`.
- **Fixable**: true

## Informational

### I1: Unreachable `openFile` branch in the reader's doc routing
- **Location**: src/webview/reader.ts:~271-280 (`openLinkedArtifact`, the non-`.md` arm)
- **Description**: For `kind: 'doc'`, `classifyLink` only emits `data-artifact` when the target matches `/\.md$/i` (render.ts:570-573). The `openFile` arm with the hand-built `.maister/docs/${relPath}` path can therefore never run. It is dead code and duplicates the path logic.
- **Fix**: Remove that arm, or keep it only as an explicit guard.
- **Fixable**: true

### I2: Containment is lexical, and symlinks are followed
- **Location**: src/panel/messages.ts:226-243 (`validateDoc`), src/panel/panel.ts:1322-1352 (`buildDoc`)
- **Description**: A symlinked `.md` inside `.maister/docs` can make the panel read a file outside the docs root. `markdownUnder` already skips symlinked directories, because the FileType is a bitmask and not equal to `Directory`, so there is no recursion loop.
- **Fix (optional)**: Resolve the realpath or check `FileType.SymbolicLink` on stat before reading.
- **Fixable**: false (design trade-off)

### I3: Log message template reused out of context
- **Location**: src/panel/panel.ts:~1346 (`buildDoc` catch)
- **Description**: `PANEL.commandFailed` is logged with the doc path as `command`, which produces "panel: standards/x.md did not run (...)".
- **Fix**: Add a dedicated `PANEL.docUnreadable` string.
- **Fixable**: true

### I4: The `validateDoc` refusal message says the root is `.maister/docs`, but the check runs against a bare relPath
- **Location**: src/panel/messages.ts:233-235
- **Description**: The check is correct: the path is contained relative to itself and later joined under `DOCS_ROOT`. But `resolveInside(docsFolderUri, …)` suggests the path is resolved against the workspace folder. A short comment or a `containedRelPath` call would make the intent clear. This also means the `?`/`#` stripping in `resolveInside` silently accepts `a.md?x`.
- **Fixable**: true

## Verified OK
- `validateDoc`: exact-match allowlist on `docsFolderUri` (`workspaceFolderUris.includes`). The path is decoded before it is normalized, `.md` only, and the anchor is checked against `ANCHOR`.
- `resourceRoots()`: doc mode serves `media`, `dist/webview` and `<folder>/.maister/docs` only. Project mode serves the two extension roots only. The roots are reapplied on every `render()` through `panel.webview.options`.
- `insideBase` / `normalizeRelative`: an image whose `..` climbs above `.maister/docs` returns null, so the image degrades to its alt text. `//` and non-http(s) schemes are dropped.
- The `openFile` root in doc mode is `docsFolderUri`, and non-md links resolve to `.maister/docs/...` inside that folder.
- The timer is cleared in `dispose`, and the watcher and its listeners are pushed to `subscriptions`.
- `projectMode.ts` builds the DOM only through `el()` text nodes, and there is no `innerHTML`.

## Metrics
- Max function length: ~55 lines (`buildDoc`)
- Max nesting depth: 3
- Potential vulnerabilities: 0 confirmed (1 informational symlink note)
- N+1 query risks: 0. `projectPayload` walks the directory recursively on every docs change. That is fine at this scale.

## Prioritized Recommendations
1. Use a debounce timer per folder (W1).
2. Rebuild the watchers when folders or settings change (W2).
3. Narrow the watcherExclude check (W3).
4. Remove the dead reader branch and fix the log string (I1, I3).
