# Specification: Project Docs Page (Maister Lens)

## TL;DR
Add a read-only **Project** page, opened only from a sidebar nav item directly below Dashboard. For each workspace folder, it shows a TL;DR card with the goal and the tech stack. Both are taken verbatim from the Vision and Tech Stack entries in `.maister/docs/INDEX.md`. The card is followed by grouped shortcuts to every `.maister/docs/**/*.md`. A doc opens in the existing reader through a doc variant of the payload. In that variant, a "← Project" back control and a "Project › path" breadcrumb post `openProject`, doc-to-doc links post `openDoc`, and there is no Source button. `openDoc` requires an exact workspace-folder URI, and its path must be docs-relative, contained and end in `.md`. Restore after reload is out of scope.

## Key Decisions
- **Entry point:** the nav item is the only way in. `maister.openProject` is hidden from the palette (`when: false`), and no title-bar button is shown in project or doc mode.
- **Two new modes:** `project` and `doc` are added to the single `TaskPanel`. The doc location uses a new field, `docsFolderUri`, rather than `folderUri`, so the compiler flags every `mode !== 'dashboard'` site.
- **Links (Q1):** `classifyLink` is unchanged apart from generalising its base. Inside a doc, a link that stays within `.maister/docs` posts `openDoc`. Any other relative link, including one into a task folder, is a `file` link and opens in the editor.
- **Restore (Q2):** restoring after a reload is out of scope. Every mode keeps the existing fallback to the dashboard, and `readLocation` is unchanged.
- **Security (Q3):** `docRelPath` is relative to `.maister/docs`. `openDoc` requires `docsFolderUri` to exactly match one of the workspace-folder URIs, which are newly added to `MessageContext`. The path must also pass `containedRelPath` and a `.md` allowlist.
- **TL;DR (Q4):** there are no tech chips. The Tech Stack entry text is shown as written. This departs from the mockups, which draw chips. Everything else in the mockups stands.
- **Watcher:** `TaskPanel` owns a docs watcher. It honours `files.watcherExclude`, uses a debounce, and republishes the same location so the scroll position is kept.

## Open Questions / Risks
- **Parsing:** the INDEX.md heading contract is fixed (see R4). If the format drifts, the page shows the "missing" note rather than an empty TL;DR.
- **Artifact refactor:** generalising the link base touches every artifact render. The existing `render.test.ts` must stay byte-identical, and `security.spec.ts` and `trust.test.ts` must stay green.
- **Symlinks:** symlinks under `.maister/docs` are not resolved. Containment is lexical, the same as today's task containment.

## Goal
Give users a one-click, always-rendered view of what the project is (goal and stack) and of every project doc and standard, without leaving Maister Lens.

## User Stories
- As a developer, I want a Project entry directly below Dashboard, so that I can recall the project's goal and stack in seconds.
- As a developer, I want shortcuts to every standard and project doc, grouped by folder, so that I can open the one I need without searching the Explorer.
- As a developer, I want docs rendered like artifacts, with a "← Project" back control, so that reading stays in one consistent place.
- As a multi-root user, I want one section per workspace folder, so that the docs of each project are kept apart.

## Core Requirements
1. **R1 Nav node.** Add a `Project` node with the codicon `book` to `NavTreeProvider`, directly below Dashboard. It is always visible and runs `maister.openProject`. The command is declared in `package.json`, hidden from the palette with `when: false`, and registered in `registerPanel`.
2. **R2 Project mode.** Add `{mode:'project'}` to `PanelLocation`, with its own title (`PANEL.titleProject`) and context key value. It is not restored after a reload.
3. **R3 Discovery.** For each workspace folder, collect `.maister/docs/**/*.md`. Group the files in this order: INDEX.md, `project/`, `standards/<domain>/`, then any other folders alphabetically. Sort files alphabetically within each group. Labels are humanized filenames, so `coding-style.md` becomes "Coding style".
4. **R4 TL;DR parser.** A pure function, `src/model/parseProjectDocs.ts`, takes the text of INDEX.md. It finds the `## Project Documentation` section, which ends at the next `##` heading. Within that section it matches `####` headings whose text starts with "Vision" or "Tech Stack", ignoring case. The optional backticked suffix, for example ``(`project/vision.md`)``, supplies the source path. The entry text is the paragraph or paragraphs that follow, up to the next heading. The function returns `{goal?, goalSource?, techStack?, techStackSource?}`. A missing section or entry gives an undefined field, and the function never throws.
5. **R5 Project page UI.** A new bundle, `src/webview/projectMode.ts`, renders one section per folder. Each section starts with a TL;DR `summaryCard` holding the goal text, the tech stack text shown as written with no chips, and links to the sources, which post `openDoc`. Group headings and `trow` doc rows follow. The folder name is shown only when there is more than one root.
6. **R6 Partial and empty states.** When a folder has docs but some TL;DR fields are missing, the page shows what it found plus an honest "missing" note. When no folder has `.maister/docs`, the page shows an empty state with a `/maister:init` hint.
7. **R7 Doc mode.** Add `{mode:'doc', docsFolderUri, docRelPath, anchor?}` to `PanelLocation`, where `docRelPath` is relative to `.maister/docs`. The doc renders through `renderArtifact` and the reader bundle using a **doc variant of `RenderPayload`**. Its location kind is `doc` and it carries `docsFolderUri`, `docRelPath` and a `docLabel`. It has no `taskTitle` and no `heroes`. It is not restored after a reload.
8. **R8 Reader in doc mode.** For the doc payload, the reader bundle does the following:
   - It shows "← Project" in the same position and style as "← Dashboard", followed by a "Project › <docRelPath>" breadcrumb. Both post `openProject`.
   - Links that are inside the docs root post `openDoc`.
   - There is no Source button, and it never posts `openSource`, `openArtifact` or `openTask`.

   Artifact mode is unchanged.
9. **R9 Messages.** Add `openProject` and `openDoc{docsFolderUri, docRelPath, anchor?}` to the `Message` union and the `validate()` allowlist.
   - `MessageContext` gains `workspaceFolderUris`. `openDoc` requires `docsFolderUri` to exactly match one of those URIs.
   - `docRelPath` must be non-empty and pass `containedRelPath` under `.maister/docs`. It must match `/\.md$/i`.
   - Traversal is rejected, including the encoded forms `..` and `%2e%2e`. Backslashes, absolute paths, non-`.md` files and empty paths are rejected too.
   - **Anchor rule (M4):** this mirrors `validateArtifact`. `anchor` is optional and must match the existing `ANCHOR` regex (`messages.ts:16`). The reader splits the `#fragment` off a link's href to fill `anchor`.
10. **R10 Links in docs.** `classifyLink` keeps its four kinds (`fragment | artifact | file | external`) and only its base is generalised. For a doc, the base is `<docsFolderUri>/.maister/docs`, so `artifact` means "inside the docs root".
    - Such a link posts `openDoc` if it is `.md`. A `.html` link inside the docs root falls back to `openFile`.
    - Every other relative link becomes `file` and opens in the editor. That includes a link into `.maister/tasks/...`, and there is no rendered-artifact routing.
    - `external` links open in the browser, and `fragment` links scroll within the doc.
11. **R11 Live refresh.** A docs watcher refreshes the Project page and the open doc when files under `.maister/docs/**` change (see Technical Approach: Watcher).
12. **R12 Strings.** All user-visible text lives in `src/strings.ts`. Add `NAV.project` and `PANEL.titleProject`, plus a `PROJECT` block. The block holds the heading, the missing note, the empty state, the init hint, the "← Project" back label and the breadcrumb label.
13. **R13 Tests.** Update the existing tests listed under Testing Approach, and add the focused tests described there.

## Visual Design
The mockups in `analysis/design-context/` are binding inputs, and the implementation-planner will attach `Visual References` to the UI task groups. Fidelity is structural: layout, order and components must match, while colours come from the `--vscode-*` tokens in `media/webview.css`.

**Deviation from the mockups (Q4):** the mockups draw the tech stack as chips. The implementation shows the Tech Stack entry text as plain text inside the TL;DR card, and has no chips. The mockups also draw a Source button on the doc reader, which is omitted (R8).

| Screen / component ID | Mockup | Requirements | Key elements |
|---|---|---|---|
| screen:sidebar-navigation | `mockups/sidebar-navigation.html` | R1 | The Project node with the `book` icon, directly below Dashboard |
| screen:project-page | `mockups/project-page.html` | R3, R4, R5 | The TL;DR card at the top, then the INDEX, Project and Standards-by-domain groups |
| screen:project-page-multi-root | `mockups/project-page-multi-root.html` | R5, R6 | One section per folder, one of them showing an honest partial TL;DR |
| screen:project-doc-reader | `mockups/project-doc-reader.html` | R7, R8, R10 | "← Project" and "Project › path", with doc links posting `openDoc` |
| screen:project-empty-state | `mockups/project-empty-state.html` | R6 | An `.empty` message with the `/maister:init` hint |
| component:project-tldr | `mockups/project-page.html` | R4, R5 | A `summaryCard` with the goal text, the stack text (no chips) and source links |
| component:doc-row | `mockups/project-page.html` | R3, R5, R9 | A `trow` that posts `openDoc` |

## Reusable Components

### Existing Code to Leverage
- `src/panel/panel.ts`: the `PanelLocation`, `buildView`, `bundleHtml`, history, `dispatch` and `republish` patterns. Follow `dashboardPayload` for the project mode and `readerPayload` for the doc mode.
- `src/panel/render.ts`: `renderArtifact`, `RenderCache` and `classifyLink`, with the base generalised. Rename the `taskRelPath` parameter of `imageUri` to a neutral base name. The `RenderCache` key needs no change.
- `src/webview/reader.ts`: rendering, scroll restore by `locationKey`, and the breadcrumb, with branches for the doc payload.
- `src/webview/risksMode.ts:430-432` and `dashboardMode.ts`: the bundle structure and the "← Dashboard" back-control pattern.
- `src/webview/components.ts`: `el`, `row` and `summaryCard`. `src/webview/shim.ts` provides the handshake.
- `src/panel/messages.ts` and `src/model/relPath.ts`: `validate`, `ANCHOR`, `validateArtifact` (the pattern to mirror) and `containedRelPath`.
- `src/model/parseSummary.ts`: the heading-parsing style.
- `src/views/navTree.ts`: the `DASHBOARD_NODE` pattern.
- `src/index/watcher.ts`: the `FileSystemWatcher` pattern, the debounce and the `files.watcherExclude` check (lines 152-161).
- `media/webview.css`: the classes `.summary-card`, `.list`, `.group-header`, `.trow`, `.link`, `.empty` and `.rd-crumbs`.
- `esbuild.mjs`: it already bundles every `src/webview/*.ts`, so it needs no change.

### New Components Required
- `src/webview/projectMode.ts`: no existing bundle renders a grouped doc list with a TL;DR card. It is built from existing components.
- `src/model/parseProjectDocs.ts`: nothing parses INDEX.md today. It is a pure, testable module that holds the TL;DR parser plus the grouping and humanize helper.
- A doc watcher in `TaskPanel`: the existing watcher feeds `TaskIndex`, which has nothing to do with docs, so it cannot be reused directly.

## Technical Approach
- **Flow:**
  1. The nav node runs `maister.openProject`, which calls `TaskPanel.show({mode:'project'})`.
  2. For each workspace folder, the host runs `findFiles`, reads and parses INDEX.md, and publishes the project bundle.
  3. When the user clicks a row, the bundle posts `openDoc`. The host validates it and calls `show({mode:'doc', ...})`, which renders the doc payload for the reader.
- **Mode-branch sites (M1).** The new field name `docsFolderUri` makes the compiler flag every `folderUri` access. Each site behaves as follows:

| Site (`panel.ts`) | project | doc |
|---|---|---|
| `show` readable check (369/375) | Always readable | The file exists, otherwise an honest reader error |
| `sourceUri` (451/458) | undefined | undefined (no Source) |
| `workspaceRootUri` (607) | undefined | `docsFolderUri` (the base for `file` links) |
| `render` / `buildView` (634, 665-685) | The project payload and bundle | The doc `RenderPayload` and the reader bundle |
| `resourceRoots` (1334) | Media only | Media plus `<docsFolderUri>/.maister/docs` only, never the whole workspace folder |
| `onIndexChange` (1397/1401) | Ignored | Ignored (links do not depend on the index) |
| `onFilterChange` (1413) | Ignored | Ignored |
| `republish` (1420) | Rebuilds the project payload | Re-renders the same location, so the reader keeps its scroll |
| `applyContextKeys` (1433-1439) | `mode = project` | `mode = doc` |
| `dispatch` (499+) | Handles `openProject` and `openDoc` in every mode | Same |
| `registerPanel` (1470+) | Registers `maister.openProject` | — |
| `readLocation` (1525+) | Unchanged; falls back to the dashboard | Unchanged; falls back to the dashboard |

- **Title bar (M6).** In `package.json`, `revealInExplorer` changes from `mode != 'dashboard'` to also exclude `project` and `doc`. `openArtifactSource` stays limited to `mode == 'artifact'`. No title-bar button is shown in project or doc mode.
- **Watcher (M2).**
  - `TaskPanel` creates one `FileSystemWatcher` for `.maister/docs/**` per workspace folder when the panel is created. The watchers are disposed with the panel.
  - The folders that `files.watcherExclude` excludes are skipped, using the same check as `watcher.ts`.
  - Change, create and delete events are debounced (about 200 ms, in line with `watcher.ts`). They then call `republish()` only when the current mode is `project`, or when it is `doc` and the doc belongs to that folder.
  - A republish keeps the same `location` object, so the reader's `locationKey` scroll restore keeps the scroll position.
- **Link base.** `RenderTarget` and `readerPayload` take a base directory and a location kind. For artifacts, the output stays byte-identical.
- **Module boundaries.** `vscode` stays out of `src/model` and `render.ts`.

## Implementation Guidance

### Testing Approach
- Write 2-8 focused tests per implementation step group. Test verification runs only the new tests, not the entire suite.
- **Parser and grouping (unit).**
  - Parse this repo's INDEX.md format, including the backticked suffixes.
  - Headings in a different case.
  - A missing section, a missing entry, and a missing INDEX.md.
  - Group order and humanized labels.
- **`openDoc` validation (unit).**
  - A valid path is accepted.
  - These are rejected: a foreign `docsFolderUri`, `..`, `%2e%2e`, a backslash, an absolute path, `.html`, an empty path, and a bad anchor.
- **`classifyLink` with a docs base (unit).**
  - A doc link resolves to `artifact`, which posts `openDoc`.
  - A `../tasks/...` link resolves to `file`.
  - External and fragment links keep their kinds.
  - The existing `render.test.ts` stays byte-identical for artifacts.
- **Playwright DOM.**
  - The project bundle: the TL;DR card with no chips, the groups, the empty state and the multi-root layout.
  - The doc-mode reader: "← Project" and the breadcrumb post `openProject`, links post `openDoc`, and there is no Source button.
- **Integration.**
  - The project and doc modes render.
  - The docs watcher republishes and keeps the location.
- **Updates to existing tests.**
  - `test/dom/harness.ts:31`: add `projectMode` to the `BundleName` union.
  - `surfaces.spec.ts`: add a `projectMode` entry and a fixture for the doc-mode reader payload (L3).
  - `manifest.test.ts`: the count of visible commands stays 9 because `openProject` is hidden. Rename the stale "without declaring a new command" title, and assert that `openProject` has `when: false` in `commandPalette` (L1).
  - `test/integration/navTree.test.ts:11`: `roots.length` goes from 1 to 2 (L2).

### Standards Compliance
- `global/minimal-implementation.md` and `global/coding-style.md`: no speculative abstractions. The reader and components are reused rather than duplicated.
- `global/validation.md` and `global/error-handling.md`: `openDoc` is validated with an allowlist and an exact root match, and partial and empty states degrade gracefully.
- `global/commenting.md`: no change comments.
- `frontend/components.md` and `frontend/css.md`: build from existing components and use `--vscode-*` tokens, with no new stylesheet.
- `frontend/accessibility.md`: rows and back controls are native buttons, heading order is kept, and the breadcrumb `nav` has an `aria-label`.
- `project/tech-stack.md`: runtime dependencies are unchanged (two).

## Out of Scope
- Editing docs.
- Search.
- A Source button or a raw source view for docs.
- Palette and title-bar entries.
- Tech chips.
- Restoring the panel after a reload, for any mode.
- Routing links from a doc into a task to the rendered artifact.
- Resolving symlinks.
- New dependencies.
- Parsing H1 titles for labels.

## Success Criteria
- The Project page opens from the sidebar item below Dashboard and shows the goal and stack text from this repo's INDEX.md.
- Every `.maister/docs/**/*.md` appears once, in the specified group order, and opens rendered with a working "← Project" control.
- Links between docs open rendered. Other relative links open in the editor, and external links open in the browser.
- `openDoc` rejects foreign roots, traversal and paths that are not `.md`.
- Editing a doc refreshes the open Project page or doc view in place, without losing the scroll position.
- All existing tests pass except the deliberately updated ones listed above.

## Post-verification amendment (R4 goal source)
The TL;DR goal is taken from the first prose paragraph of `.maister/docs/project/vision.md` (`goalSource: project/vision.md`). If there is no such paragraph, the INDEX.md Vision entry is used instead. The user approved this change during Phase 11 fixes.
