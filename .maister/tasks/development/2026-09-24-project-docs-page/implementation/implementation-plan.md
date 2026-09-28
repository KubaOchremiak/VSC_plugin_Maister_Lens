# Implementation Plan: Project Docs Page (Maister Lens)

## TL;DR
The work is split into 6 task groups and 33 steps. Groups 1 (model and strings) and 2 (messages and link base) have no dependencies and can run in parallel. Group 3 (host panel, nav and manifest) depends on both. Groups 4 (project bundle) and 5 (doc-mode reader) both touch `surfaces.spec.ts` and `harness.ts`, so they run one after the other. Group 6 reviews the tests and fills gaps. The plan expects 24-38 feature tests in total.

## Key Decisions
- **Pure logic first.** `parseProjectDocs.ts` (the parser, grouping and humanize) and the `openDoc` validation and `classifyLink` base are built and unit-tested before any host or webview code uses them.
- **Payload contract owned by Group 3.** The project payload type and the doc variant of `RenderPayload` are defined in `panel.ts`/`render.ts`. The webview groups (4 and 5) build against fixtures in `surfaces.spec.ts`.
- **Groups 4 and 5 are serialized.** Both edit `test/dom/harness.ts` and `test/dom/surfaces.spec.ts`, so each group declares those files.
- **Pinned tests are changed on purpose.** These are the `manifest.test.ts` visible-command title and assertion, and `navTree.test.ts` `roots.length` 1→2. The user approved both.

## Open Questions / Risks
- **`panel.ts` is large, with about 12 mode-branch sites.** Group 3 relies on the compiler flagging `docsFolderUri` to find every site. A missed site shows up as a type error, not as a silent bug.
- **Artifact output must stay byte-identical.** Generalising the `classifyLink`/`imageUri` base in Group 2 must leave the existing `render.test.ts` assertions untouched.
- **Mockups deviate from the spec.** The mockups show tech chips and a Source button on the doc reader. The spec (Q4 and R8) overrides both, and the Visual References acceptance criteria call this out.
- **Watcher timing in integration tests.** The docs watcher debounces at about 200 ms, so the integration test must poll for the republish rather than sleep for a fixed time.

## Overview
- Total Steps: 33
- Task Groups: 6
- Expected Tests: 24-38. That is 5 groups × 2-8 new or updated focused tests, plus up to 10 gap tests.
- Test commands (from package.json):
  - Unit: `npm test` (mocha). Use `npx mocha <file>` for a single file.
  - DOM: `npm run test:dom` (Playwright). Use `npx playwright test <spec>` for a single spec after `npm run build`.
  - Integration: `npm run test:integration` (@vscode/test-electron).
  - Type check: `npm run typecheck`.

## Implementation Steps

### Task Group 1: Model Layer — Docs Parser, Grouping, Strings
**Dependencies:** None
**Files to Modify:** src/model/parseProjectDocs.ts, src/strings.ts, test/unit/parseProjectDocs.test.ts
**Estimated Steps:** 5

- [x] 1.0 Complete the model layer
  - [x] 1.1 Write 4-6 focused unit tests in `test/unit/parseProjectDocs.test.ts`
    - Parse this repo's `.maister/docs/INDEX.md` format: Vision and Tech Stack with the backticked `(\`project/vision.md\`)` suffix, which becomes `goalSource`/`techStackSource`
    - Headings in a different case ("VISION", "tech stack")
    - A missing `## Project Documentation` section, a missing entry, and empty input (a missing INDEX.md) give undefined fields and never throw
    - Group order is INDEX.md, `project/`, `standards/<domain>/`, then other folders alphabetically. Files are alphabetical within a group. `coding-style.md` is humanized to "Coding style"
  - [x] 1.2 Implement `parseProjectIndex(text)` in `src/model/parseProjectDocs.ts` (R4)
    - The section runs from `## Project Documentation` to the next `## `. Match `####` headings that start with Vision or Tech Stack, ignoring case. The entry text is the paragraph(s) up to the next heading
    - Return `{goal?, goalSource?, techStack?, techStackSource?}`
    - Follow the heading-parsing style of `src/model/parseSummary.ts`. The module must not import `vscode`
  - [x] 1.3 Implement `groupDocs(relPaths)` and `humanizeDocName()` in the same module (R3)
    - The input is paths relative to `.maister/docs`. The output is ordered groups `{key, label, docs:[{relPath, label}]}`
  - [x] 1.4 Add strings to `src/strings.ts` (R12)
    - `NAV.project` and `PANEL.titleProject`
    - A `PROJECT` block with the heading, the missing note, the empty state, the init hint `/maister:init`, the back label "← Project", the breadcrumb label "Project" and the group labels
  - [x] 1.5 Ensure the model tests pass
    - Run only `npx mocha` on `test/unit/parseProjectDocs.test.ts`

**Acceptance Criteria:**
- The 4-6 new unit tests pass
- The parser never throws and returns the verbatim entry text for this repo's INDEX.md
- No `vscode` import in `src/model`

### Task Group 2: Messages and Link Base — openProject/openDoc Validation, classifyLink Generalisation
**Dependencies:** None
**Files to Modify:** src/panel/messages.ts, src/panel/render.ts, test/unit/messages.test.ts, test/unit/render.test.ts
**Estimated Steps:** 5

- [x] 2.0 Complete the message and link layer
  - [x] 2.1 Write 5-8 focused unit tests
    - In `messages.test.ts`, a valid `openDoc` is accepted. These are rejected: a foreign `docsFolderUri`, `..`, `%2e%2e`, a backslash, an absolute path, `.html`, an empty path, and a bad anchor. `openProject` is accepted
    - In `render.test.ts`, with a docs base a doc link gives `artifact`, and `../tasks/...` gives `file`. External and fragment links keep their kinds
    - Every existing artifact assertion in `render.test.ts` stays unchanged, so its output remains byte-identical
  - [x] 2.2 Extend the `Message` union and the `validate()` allowlist in `src/panel/messages.ts` (R9)
    - Add `openProject` and `openDoc{docsFolderUri, docRelPath, anchor?}`
    - `MessageContext` gains `workspaceFolderUris`, and `docsFolderUri` must match one of them exactly
    - `docRelPath` must pass `containedRelPath` (from `src/model/relPath.ts`) and match `/\.md$/i`. `anchor` must match the `ANCHOR` regex
    - Mirror `validateArtifact`
  - [x] 2.3 Generalise the link base in `src/panel/render.ts` (R10)
    - `RenderTarget` takes a base directory plus a location kind (`artifact`|`doc`)
    - Rename the `taskRelPath` parameter of `imageUri` to a neutral name
    - `classifyLink` keeps its 4 kinds
  - [x] 2.4 Add the doc variant of `RenderPayload`: kind `doc`, `docsFolderUri`, `docRelPath` and `docLabel`, with no `taskTitle` and no `heroes` (R7)
  - [x] 2.5 Ensure the tests for this layer pass
    - Run only `messages.test.ts` and `render.test.ts`, plus `npm run typecheck`

**Acceptance Criteria:**
- The 5-8 tests pass, and the pre-existing `render.test.ts` artifact tests pass unmodified
- `openDoc` rejects foreign roots, traversal, non-`.md` paths and bad anchors
- `render.ts` does not import `vscode`

### Task Group 3: Host Panel — Project/Doc Modes, Nav Node, Command, Docs Watcher
**Dependencies:** 1, 2
**Files to Modify:** src/panel/panel.ts, src/views/navTree.ts, src/extension.ts, package.json, test/unit/manifest.test.ts, test/integration/navTree.test.ts, test/integration/projectMode.test.ts
**Visual References:**
- mockup: analysis/design-context/mockups/sidebar-navigation.html
  element: screen:sidebar-navigation
  locator: sidebar `<nav>` markup at lines 219-223 (the Dashboard `button.nav` and the node below it)
  acceptance: the "Project" node with the codicon `book` is the second root, directly below Dashboard. It is always visible, even with no docs. Clicking it runs `maister.openProject`. The label comes from `NAV.project`
**Estimated Steps:** 8

- [x] 3.0 Complete the host panel layer
  - [x] 3.1 Write or update 4-7 tests
    - `manifest.test.ts`: the visible-command count stays 9. Rename the stale "without declaring a new command" title. Assert that `maister.openProject` has `when: false` in `commandPalette` and that `revealInExplorer` excludes `project`/`doc`
    - `test/integration/navTree.test.ts:11`: `roots.length` 1→2, and root[1] is Project with the command `maister.openProject`
    - New `test/integration/projectMode.test.ts`:
      - Project mode renders
      - Doc mode renders a real doc
      - Editing a doc under `.maister/docs` republishes with the same location. Poll for this; do not use a fixed sleep
  - [x] 3.2 Add `PROJECT_NODE` to `src/views/navTree.ts`, following the `DASHBOARD_NODE` pattern (R1)
  - [x] 3.3 In `package.json`:
    - Declare `maister.openProject` and add a `commandPalette` entry with `when: false`
    - Change the `revealInExplorer` `when` so it also excludes `project` and `doc`
    - Leave `openArtifactSource` as `mode == 'artifact'`
  - [x] 3.4 Add `{mode:'project'}` and `{mode:'doc', docsFolderUri, docRelPath, anchor?}` to `PanelLocation` (R2, R7)
    - Work through each site in the spec's mode-branch table: `show` readable check, `sourceUri`, `workspaceRootUri`, `render`/`buildView`, `resourceRoots` (docs root only), `onIndexChange`/`onFilterChange` (ignored), `applyContextKeys`, the `PANEL.titleProject` title
    - Leave `readLocation` unchanged, so every mode falls back to the dashboard
  - [x] 3.5 Build the project payload (follow `dashboardPayload`)
    - For each workspace folder: run `findFiles('.maister/docs/**/*.md')`, read INDEX.md, then `parseProjectIndex` + `groupDocs`
    - Mark whether the workspace is multi-root. If no folder has docs, set an empty flag
    - Build the doc payload with `readerPayload`, using the docs base and the reader bundle
  - [x] 3.6 Handle messages in `dispatch` for every mode
    - `openProject` calls `show({mode:'project'})`
    - `openDoc` is checked by `validate()` with `workspaceFolderUris`, then calls `show({mode:'doc', ...})`
    - Register `maister.openProject` in `registerPanel`
  - [x] 3.7 Add a docs watcher to `TaskPanel`
    - Create one `FileSystemWatcher` per folder for `.maister/docs/**`, skipping folders that `files.watcherExclude` excludes (same check as `watcher.ts:152-161`)
    - Debounce events at about 200 ms. Call `republish()` only in project mode, or in doc mode when the event is in that doc's folder
    - Dispose the watchers with the panel
  - [x] 3.8 Ensure the host tests pass
    - Run `npx mocha test/unit/manifest.test.ts` and `npm run typecheck`
    - Run the integration run limited to the navTree and projectMode tests

**Acceptance Criteria:**
- The 4-7 tests pass
- Every mode-branch site from the spec table is handled, and `npm run typecheck` is clean
- The panel does not restore after a reload in project or doc mode
- Project and doc mode show no title-bar buttons
- The visual reference acceptance above is met

### Task Group 4: Project Page Webview Bundle
**Dependencies:** 1, 3
**Files to Modify:** src/webview/projectMode.ts, test/dom/harness.ts, test/dom/surfaces.spec.ts, test/dom/projectMode.spec.ts
**Visual References:**
- mockup: analysis/design-context/mockups/project-page.html
  element: screen:project-page
  locator: `main.main` at lines 223-230 (the `h1` "Project", the `summary-card`, then the group sections); annotations at line 267
  acceptance:
    - The order is `h1` Project, then the TL;DR card, then groups in the order INDEX, Project, Standards by domain
    - Each group has a `.group-header` with a count, followed by `.trow` rows
    - No folder heading is shown for a single root
- mockup: analysis/design-context/mockups/project-page.html
  element: component:project-tldr
  locator: `.summary-card` block at lines 223-227
  acceptance:
    - A `summaryCard` with label/value rows: Goal (verbatim Vision text), Tech stack (verbatim text as **plain text, with no chips** — this deviates from the mockup) and Source
    - The source links post `openDoc` with `project/vision.md` and `project/tech-stack.md`
- mockup: analysis/design-context/mockups/project-page.html
  element: component:doc-row
  locator: the `.trow` rows after the summary card, at lines 227-230
  acceptance: each row is a native button labelled with the humanized name. Clicking it posts `openDoc{docsFolderUri, docRelPath}`
- mockup: analysis/design-context/mockups/project-page-multi-root.html
  element: screen:project-page-multi-root
  locator: `main.main` at lines 223-230
  acceptance:
    - One section per folder, each headed by the folder name (shown only when there is more than one root)
    - A folder with a partial TL;DR shows the fields it has, plus the `PROJECT` missing note for the rest
- mockup: analysis/design-context/mockups/project-empty-state.html
  element: screen:project-empty-state
  locator: `main.main` at line 223 (`h1` + `.empty`); annotation at line 263
  acceptance: when no folder has docs, the page shows `h1` Project plus one `.empty` block with the empty text and a `<code>/maister:init</code>` hint
**Estimated Steps:** 6

- [x] 4.0 Complete the project page bundle
  - [x] 4.1 Write 4-6 Playwright DOM tests in `test/dom/projectMode.spec.ts`
    - A single root shows the TL;DR card with no chip elements and the groups in order
    - A row click posts `openDoc`
    - Multi-root shows a section per folder, one with the missing note
    - The empty state shows the init hint
  - [x] 4.2 Add `projectMode` to the `BundleName` union at `test/dom/harness.ts:31`. Add a `projectMode` entry and fixtures to `surfaces.spec.ts`
  - [x] 4.3 Create `src/webview/projectMode.ts`
    - Follow the structure of `risksMode.ts`/`dashboardMode.ts` and the `shim.ts` handshake
    - Build with `el`, `row` and `summaryCard` from `components.ts`
    - Add no new CSS, and use only the existing `media/webview.css` classes
  - [x] 4.4 Render the TL;DR card, group headers and rows
    - Keep the heading order (h1 > h2 folder > h3 group)
    - Use native buttons, with every string taken from `PROJECT` in `strings.ts`
  - [x] 4.5 Render the partial and empty states (R6)
  - [x] 4.6 Ensure the project bundle tests pass
    - Run `npm run build`, then `npx playwright test test/dom/projectMode.spec.ts test/dom/surfaces.spec.ts`

**Acceptance Criteria:**
- The 4-6 DOM tests pass
- Every Visual References acceptance criterion above is met, including no chips
- `esbuild.mjs` is not changed, because the bundle is picked up automatically

### Task Group 5: Reader Doc Mode
**Dependencies:** 2, 3, 4
**Files to Modify:** src/webview/reader.ts, test/dom/harness.ts, test/dom/surfaces.spec.ts, test/dom/readerDoc.spec.ts
**Visual References:**
- mockup: analysis/design-context/mockups/project-doc-reader.html
  element: screen:project-doc-reader
  locator: `main.main` at line 223 (the "← Project" back control, the `.rd-crumbs` breadcrumb, then the rendered doc body); annotation at line 263
  acceptance:
    - "← Project" sits in the same position and style as "← Dashboard", followed by a `nav.rd-crumbs` with an `aria-label` reading "Project › <docRelPath>". Both post `openProject`
    - Links inside the docs root post `openDoc` (with `anchor` split from `#fragment`). There is **no Source button**, which deviates from the mockup
**Estimated Steps:** 5

- [x] 5.0 Complete doc mode in the reader
  - [x] 5.1 Write 3-6 Playwright DOM tests in `test/dom/readerDoc.spec.ts`
    - The back control and the breadcrumb post `openProject`
    - A doc link posts `openDoc` with its anchor
    - A `file` link posts `openFile`
    - There is no Source button, and the bundle never posts `openSource`/`openArtifact`/`openTask`
  - [x] 5.2 Add a doc-mode reader payload fixture to `surfaces.spec.ts` (L3), sharing the existing reader `BundleName`
  - [x] 5.3 Branch `src/webview/reader.ts` on the doc payload kind
    - Render the back control and the breadcrumb
    - Hide the Source button and the hero/task title
    - Keep scroll restore by `locationKey`
  - [x] 5.4 Route link clicks in doc mode
    - `artifact` + `.md` posts `openDoc`
    - `artifact` + other extensions posts `openFile`
    - `file` posts `openFile`, `external` opens externally, and `fragment` scrolls
    - Artifact mode is unchanged
  - [x] 5.5 Ensure the reader doc tests pass
    - Run `npm run build`, then the Playwright specs `readerDoc.spec.ts`, `surfaces.spec.ts` and `security.spec.ts`

**Acceptance Criteria:**
- The 3-6 DOM tests pass, and the existing reader/security DOM specs still pass
- The Visual References acceptance above is met

### Task Group 6: Test Review & Gap Analysis
**Dependencies:** 1, 2, 3, 4, 5
**Files to Modify:** test/unit/*.test.ts, test/dom/*.spec.ts, test/integration/*.test.ts
**Estimated Steps:** 4

- [x] 6.0 Review the tests and fill critical gaps
  - [x] 6.1 Review the tests written in Groups 1-5 (about 20-33)
  - [x] 6.2 Analyse gaps for this feature only. Likely candidates:
    - The watcher ignores an excluded folder
    - A doc in folder A is not republished by a change in folder B
    - `openDoc` from an untrusted workspace (`trust.test.ts` stays green)
    - The `resourceRoots` limit
  - [x] 6.3 Write up to 10 additional strategic tests
  - [x] 6.4 Run the feature tests, then the full check once
    - Run `npm run check`, `npm run test:dom` and `npm run test:integration`
    - Confirm that the only changes to existing tests are the deliberate ones

**Acceptance Criteria:**
- All feature tests pass (about 24-38)
- No more than 10 tests are added in this group
- `security.spec.ts` and `trust.test.ts` stay green

## Execution Order
1. Group 1: Model Layer (5 steps). Runs in parallel with Group 2
2. Group 2: Messages and Link Base (5 steps). Runs in parallel with Group 1
3. Group 3: Host Panel (8 steps). Depends on 1 and 2
4. Group 4: Project Page Bundle (6 steps). Depends on 1 and 3
5. Group 5: Reader Doc Mode (5 steps). Depends on 2, 3 and 4 (it shares DOM test files with Group 4)
6. Group 6: Test Review (4 steps). Depends on all groups

## Standards Compliance
Follow the standards from `.maister/docs/standards/`:
- global/: `minimal-implementation.md`, `coding-style.md`, `validation.md` (allowlist and exact root match), `error-handling.md` (honest partial and empty states), `commenting.md`
- frontend/: `components.md` and `css.md` (existing components and `--vscode-*` tokens, no new stylesheet), `accessibility.md` (native buttons, heading order, `aria-label` on the breadcrumb `nav`)
- project/`tech-stack.md`: keep the two runtime dependencies unchanged

## Notes
- **Test-driven:** each group starts with 2-8 tests.
- **Run incrementally:** run only the new tests after each group.
- **Mark progress:** check off each step as it is completed.
- **Reuse first:**
  - Components: `summaryCard`, `row` and `el`
  - Reader and render: `renderArtifact` and `RenderCache`
  - Validation: `containedRelPath`, `ANCHOR` and the `validateArtifact` pattern
  - Patterns: the watcher pattern and `DASHBOARD_NODE`
- **Out of scope:** doc editing, search, a Source button for docs, tech chips, restore after reload, symlink resolution and new dependencies.
