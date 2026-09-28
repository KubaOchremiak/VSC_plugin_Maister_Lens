# Spec Audit: Project Docs Page

## TL;DR
Verdict: **pass-with-concerns** (Mostly Compliant). The spec can be implemented and fits the single-`TaskPanel` architecture, but four of its claims about how existing code behaves are wrong. Each would cause a silent failure unless the spec is amended before planning.
Counts: Critical 0 · High 4 · Medium 6 · Low 5.
The High issues are: task links are not classified by the current link rules (R10); reload restore depends on state that no bundle persists (R2/R7); `openDoc` does not validate `folderUri` (security); and the reader's Source and link buttons post messages that will be refused in doc mode.

## Key Decisions
- **No Critical issues.** The blocking problems are specification errors that can be fixed with one paragraph of spec text each, and none of them touches the architecture.
- **Missing `folderUri` validation rated High, not Critical.** Containment of `docRelPath` is specified. Only the root (`folderUri`) is unvalidated, and reads go through `vscode.workspace.fs` with no write path.
- **Reload restore rated High.** It is a success criterion, and the mechanism the spec cites (`readLocation`) never receives a location today.

## Open Questions / Risks
- Q1: Should a link from a doc into `.maister/tasks/<task>/…` open the rendered artifact (this needs new, index-aware classification) or the editor (the current behaviour)?
- Q2: Is restore-after-reload really in scope, given it does not work for any mode today? If it is, which state key carries the location?
- Q3: Is `docRelPath` relative to the workspace folder or to `.maister/docs`? The spec uses both readings (R7 "docRelPath", R9 "contained in `<folder>/.maister/docs`").
- Q4: "Tech chips where it contains enumerable items". What makes an item enumerable? The INDEX.md Tech Stack paragraph in this repo is prose, not a list.

---

## Verification of code claims

| Claim | Result | Evidence |
|---|---|---|
| `PanelLocation` union in `panel.ts` | Correct | `src/panel/panel.ts:49-59` |
| `buildView`, `bundleHtml`, `dashboardPayload`, `readerPayload`, `readLocation` exist | Correct | `panel.ts:664`, `:1290`, `:693+`, `:1155`, `:1525` |
| "~12 mode-branch sites" | Roughly correct but the list is incomplete | Sites: `show` 369/375, `sourceUri` 451/458, `workspaceRootUri` 607, `render` 634, `buildView` 665-685, `resourceRoots` 1334, `onIndexChange` 1397/1401, `onFilterChange` 1413, `republish` 1420, `applyContextKeys` 1433-1439, `dispatch` 499+, `readLocation` 1525-1555, `registerPanel` commands 1470+. The spec's list omits `onIndexChange`, `republish`, `dispatch` and `registerPanel`. |
| `risksMode.ts:431` back-control pattern | Correct | Lines 430-432: `crumb` button posting `openDashboard` |
| `esbuild.mjs` bundles every `src/webview/*.ts` | Not re-verified; also asserted in codebase-analysis | — |
| `validate()` allowlist and `resolveInside` / `containedRelPath` | Correct | `messages.ts:109-123, 286+`; `model/relPath.ts:16-35` |
| `classifyLink` with a link base "follows existing rules … link into an indexed task becomes openArtifact" | **Incorrect** | See H1 |
| `RenderTarget` has a link base to generalise | Correct: `artifactRelPath` + `taskRelPath` | `render.ts:20-27, 134-176` |
| `NavTreeProvider` / `DASHBOARD_NODE` | Correct | `views/navTree.ts:10-23` |
| Watcher pattern | Correct: `.maister/tasks/**` only | `index/watcher.ts:6, 56-57` |
| `BundleName` union in the harness | Correct | `test/dom/harness.ts:31` |

---

## High

### H1. R10 misstates the link rules: `classifyLink` has no task-link kind
- **Spec:** R10: "a link into an indexed task becomes `openArtifact`". Also "Links follow the existing `classifyLink` rules".
- **Evidence:** `render.ts:143-176`. Link kinds are `fragment | artifact | file | external`. `artifact` means "inside the current base". Everything else that is relative becomes `file` (`workspaceFile(...)`). `render.ts` has no access to the index. With base = `.maister/docs`, `../tasks/x/spec.md` classifies as `file` and opens in the editor.
- **Category:** Incorrect / Missing. **Severity:** High. The success criterion "links … into tasks behave per R10" cannot be met by generalising the link base alone.
- **Recommendation:** either (a) downgrade R10 so that task links open in the editor, or (b) specify a host-side step. For (b), when a `file` target lies under `.maister/tasks/<indexed task>/` and ends in `.md`/`.html`, the reader posts `openArtifact` (or the host rewrites the link). Add a unit test for it.

### H2. Reload restore (R2, R7, success criterion) has no persisted location to read
- **Spec:** "`readLocation` restores it after a reload."
- **Evidence:** `readLocation(state, …)` (`panel.ts:1525`) expects `{mode, folderUri, …}` in the webview state. No bundle ever writes that shape:
  - `reader.ts:201,223` store `{key, scrollY}`.
  - `dashboardMode.ts:137` and `risksMode.ts:125` store filter/UI state.
  - `bundleHtml` injects nothing.
  - No test covers `readLocation` or the deserializer.

  So restore already falls back to the dashboard for every mode. Adding `project`/`doc` branches alone changes nothing. In addition, `readLocation` rejects any `folderUri` that is not a task (`isIndexed`, line 1537), and a doc's `folderUri` is a workspace folder.
- **Severity:** High (stated success criterion).
- **Recommendation:** specify how the location is persisted (for example, the host includes `location` in each payload and each bundle merges it into `setState`), and give `readLocation` a workspace-folder predicate for doc mode. Otherwise, move restore out of scope.

### H3. `openDoc` validation does not constrain `folderUri`
- **Spec:** R9 checks only `docRelPath` through `resolveInside`.
- **Evidence:** `MessageContext` (`messages.ts:64-76`) carries `isIndexed`, `isTrusted`, `hostFolderUri` and `workspaceRootUri`. It has no list of workspace folders, and `resolveInside` only checks that `folderUri` parses as a URL (`messages.ts:110-114`). A compromised webview could post `openDoc{folderUri:'file:///', docRelPath:'etc/…​.md'}`. Only the "under `.maister/docs`" prefix limits this, and that prefix is relative to an arbitrary root.
- **Severity:** High (security boundary A2).
- **Recommendation:** add `isWorkspaceFolder(uri)` (or `workspaceFolderUris`) to `MessageContext`, and require `folderUri` to be an exact workspace-folder URI. State whether `docRelPath` is docs-relative (preferred, Q3). Then join it under `.maister/docs` and apply `containedRelPath` plus a `/\.md$/i` allowlist. Add tests for a foreign `folderUri`, `%2e%2e`, a backslash, an absolute path, `.html`, and an empty path. Consider saying explicitly that symlinks under docs are not resolved (Low).

### H4. Reader in doc mode posts messages that validation will refuse
- **Spec:** R7 "the Source button opens the `.md` file"; R8 covers only the breadcrumb.
- **Evidence:**
  - `reader.ts:150-153` posts `openSource{folderUri, artifactRelPath}`, and `validate` requires `isIndexed(folderUri)` (`messages.ts:329-343`), so the post is refused for a workspace-folder root.
  - `reader.ts:243-249` posts `openArtifact` for `data-artifact` links, also refused.
  - `reader.ts:54` breadcrumb posts `openTask`.
  - The payload type fixes `location.mode: 'artifact'` and requires `taskTitle` and `heroes` (`render.ts:42-70`).
- **Severity:** High. Doc-to-doc links and the Source button would silently do nothing.
- **Recommendation:** define a doc variant of `RenderPayload` (location kind `doc`, no heroes and no task title). In doc mode the reader must post `openDoc` for `data-artifact` links and use a doc-specific source message (for example, `openDocSource`) or a validated `openSource` variant. Show the "← Project" and "Project ›" crumbs in place of the task crumb.

---

## Medium

### M1. Silent-wrong mode branches for `doc`, which TypeScript will not catch
Several sites branch on `mode !== 'dashboard'` and then read `location.folderUri`. `project` has no `folderUri`, so the compiler flags those sites. `doc` does have `folderUri`, so they compile and behave wrongly:
- `resourceRoots` (`panel.ts:1334-1336`) would add the **entire workspace folder** as a `localResourceRoot`. This breaks the invariant "Nothing wider than a task folder is ever added" (comment at line 1323) and contradicts R7, which says the docs root.
- `sourceUri` (`panel.ts:451-461`) would open `<workspace>/orchestrator-state.yml`.
- `revealInExplorer` inherits the same wrong URI.

**Recommendation:** name the doc field something else (for example, `rootUri`) so the compiler forces every site to be handled explicitly. List all sites from the table above in the spec.

### M2. The docs watcher has no owner or wiring
`watcher.ts` feeds `TaskIndex`, and the panel only subscribes to `index.onDidChange` (`panel.ts:336`). The spec does not say where the `.maister/docs/**` watcher lives, how it reaches `TaskPanel`, or whether it honours the `files.watcherExclude` check (`watcher.ts:152-161`). Nor does it say whether a doc-mode republish must keep the scroll position (the reader restores scroll by `locationKey`).
**Recommendation:** specify the owner (for example, `TaskPanel` creates one watcher per folder and disposes it), the debounce value, and that republishing keeps the same `location` object.

### M3. The `onIndexChange` and `republish` behaviour is not stated for the new modes
Line 1401 dereferences `location.folderUri`. The spec should state that project and doc modes ignore index changes, or that they republish so that task-link resolution stays current (see H1).

### M4. `openDoc` payload-to-location mapping and the `anchor` rule
R9 lists `anchor?` but does not say to reuse the `ANCHOR` regex (`messages.ts:16`) or how fragments from `data-artifact` split into `anchor`. State that it mirrors `validateArtifact`.

### M5. TL;DR parser heading contract
In this repo the headings are `#### Vision (\`project/vision.md\`)` and `#### Tech Stack (\`project/tech-stack.md\`)` (`.maister/docs/INDEX.md:19,22`), with a suffix and nested under `### Project Documentation`. The spec says "`#### Vision` entry". Specify the following: a prefix match that ignores case, scoped to the `Project Documentation` section; the paragraph ends at the next heading; and the source path comes from the backticked suffix. The rule for tech chips (Q4) is undefined.

### M6. Title-bar menus in the new modes
In `package.json:334-337`, `revealInExplorer` shows whenever `mode != 'dashboard'`, so it will appear on the Project page, where it does nothing (because `sourceUri` returns undefined). `openArtifactSource` is limited to `mode == 'artifact'`, so doc mode gets no title-bar Source button. Specify the intended `when` clauses.

---

## Low

- **L1. Stale manifest test.** `manifest.test.ts:154-162` counts only non-hidden commands (still 9, because `openProject` is hidden). The spec's "update pinned count" is therefore unnecessary there. The test title "without declaring a new command" becomes stale. Add a new assertion that `openProject` has `when: false`.
- **L2. Nav test not listed.** `test/integration/navTree.test.ts:11` pins `roots.length === 1`, and the spec does not list it among the pinned tests to update (it becomes 2).
- **L3. Surfaces list.** `surfaces.spec.ts:25-29` enumerates surfaces without a count. The change adds a `projectMode` entry, and a doc-mode reader payload fixture is advisable.
- **L4. `.html` links.** `.html` files under docs classify as `artifact` (`MD_OR_HTML`, `render.ts:17`). `openDoc` would then refuse them. State that they fall back to `openFile`.
- **L5. `imageUri` parameter name.** `RenderTarget.imageUri` is named `taskRelPath`. When generalising it, rename it to keep the code honest. The `RenderCache` key (`uri, mtime, size`) works for docs unchanged.

---

## Completeness and ambiguity summary
- These parts of the spec are clear: the requirements (R1-R13), the user stories, the group order, labels, empty and partial states, strings, reuse targets and mockup mapping.
- These parts are ambiguous: Q1-Q4, the watcher ownership (M2) and the doc payload shape (H4).
- Implementability: yes. No new dependencies are needed, the bundle is picked up automatically, and the model and render modules can stay free of `vscode`.

## Security (path containment)
- `docRelPath` containment is specified correctly in intent. The `folderUri` root is not (H3).
- `resourceRoots` scope risk (M1).
- CSP from `bundleHtml` is unchanged and adequate.
- The reader's link rendering (`render.ts:266-277`) already drops non-http(s) schemes and `//` links. That stays true with a docs base.

## Test impact
Tests the spec lists that must change:
- `harness.ts:31` `BundleName`
- `surfaces.spec.ts` entries
- `manifest.test.ts`: new assertion (see L1)

Tests the spec does not list but that must change:
- `navTree.test.ts:11`

New tests to add:
- parser and grouping (unit)
- `openDoc` validation, including a foreign `folderUri` (unit)
- `classifyLink` with a docs base (unit); the existing `render.test.ts` must stay byte-identical for artifacts
- a doc-mode reader DOM test (crumbs, and links posting `openDoc`)
- integration: project mode, doc mode, and a docs-watcher republish
- `readLocation` tests, if H2 remains in scope

## Recommendations (ordered)
1. Resolve Q1-Q3 and amend R9, R10, R2 and R7 as described in H1-H4.
2. Rename the doc location's root field and list every branch site (M1, M3).
3. Specify the watcher owner and wiring (M2) and the parser heading contract (M5).
4. Add L1, L2 and the new tests to the Testing Approach.
