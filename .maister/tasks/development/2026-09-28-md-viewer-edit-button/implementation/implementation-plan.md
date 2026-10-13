# Implementation Plan: Edit button on Maister Lens markdown viewer pages

## TL;DR
- There are 4 task groups and 22 steps. Groups 1 (protocol + host), 2 (reader UI) and 3 (README/CHANGELOG) do not depend on each other and can run in parallel. Group 4 (test review + full regression) runs last.
- Groups 1 and 2 are independent because `reader.ts`'s `post()` takes `unknown`. The webview does not import the `Message` union, so it compiles without the `editDoc` type.
- Expect 13-22 new tests: unit, DOM and integration.

## Key Decisions
- **Protocol and host share one group.** The `editDoc` union member, its validate case and its dispatch arm form one contract, and the integration test covers them end to end.
- **The artifact DOM tests go in `test/dom/surfaces.spec.ts`**, next to the existing reader-summary tests, and not in a new spec file. This follows minimal implementation and needs no harness changes.
- **Docs are a separate, test-free group.** README and CHANGELOG touch no code, and AC8 is checked by reading them in Group 4.
- **Group 4 runs the three suites once, in full** (`npm run check`, `npm run test:dom`, `npm run test:integration`). AC7 explicitly requires the existing readerDoc, surfaces/themes, messages `openDoc` and reader AC5 tests to stay green without changes.

## Open Questions / Risks
- **Doc-mode test assertions depend on the fixture.** The DOM test must assert `docsFolderUri` against the value in `readerDocPayload()` (the docs directory). The integration test must use the real workspace-folder URI. Do not "fix" the fixture.
- **readerDoc.spec constraints.** The strict `nav.rd-crumbs button` locator (L25), the focusables `slice(1,3)` order, and tests 3-4 (no `openSource`/`READER.openSource` in doc mode) all break if Edit goes inside the nav or ahead of the breadcrumb.
- **`validateDoc` refactor.** Existing `openDoc` refusal regexes in `messages.test.ts` (such as `/workspace folder/`) must still match after the shared helper is extracted. The helper takes the message type as a parameter, so the wording keeps its meaning.

## Overview
Total Steps: 22
Task Groups: 4
Expected Tests: ~13-22 new tests (Group 1: 6-8, Group 2: 5-7, Group 4: up to 7 more), plus the unchanged existing suites

## Implementation Steps

### Task Group 1: Protocol & Host (`editDoc` message)
**Dependencies:** None
**Files to Modify:** src/panel/messages.ts, src/panel/panel.ts, test/unit/messages.test.ts, test/integration/projectMode.test.ts
**Estimated Steps:** 6

- [x] 1.0 Complete the `editDoc` protocol and host dispatch
  - [x] 1.1 Write 4-6 focused unit tests in `test/unit/messages.test.ts` (new `editDoc` describe block next to R9, using the `accepted`/`refused` helpers)
    - Accepts a valid doc and normalises the path: `./standards/global/../frontend/css.md` becomes `standards/frontend/css.md`. The result is exactly `{type:'editDoc', docsFolderUri, docRelPath}`, and extra fields such as `anchor` are dropped.
    - Refuses a non-workspace `docsFolderUri`, a trailing-slash folder and missing `workspaceFolderUris`. Each reason matches `/workspace folder/` and names `editDoc`.
    - Refuses a non-`.md` path (for example `.yml`), `..` traversal and a non-string `docRelPath`.
    - Is accepted in an untrusted context.
  - [x] 1.2 Write 2 focused integration tests in `test/integration/projectMode.test.ts` using `projectHarness()` and `spyOnCommand('vscode.open')` from `test/helpers/tempWorkspace.ts`
    - `handleMessage({type:'editDoc', docsFolderUri: folderUriOf(workspace), docRelPath:'standards/global/coding-style.md'})` calls `vscode.open` once, with `fsPath` = `<workspace>/.maister/docs/standards/global/coding-style.md`.
    - A refused `editDoc` (a `.yml` path, or a folder outside the workspace) calls `vscode.open` zero times.
  - [x] 1.3 Extract the shared doc-path helper in `src/panel/messages.ts`
    - Move the folder check (`docsFolderUri` ∈ `context.workspaceFolderUris`), the `resolveInside` normalisation and the case-insensitive `.md` check out of `validateDoc` (L240-257) into one helper parameterised by message type for refusal wording.
    - `validateDoc` keeps its anchor handling and calls the helper. `openDoc` behaviour and the meaning of its refusal wording do not change.
  - [x] 1.4 Add `editDoc` to the protocol in `src/panel/messages.ts`
    - Add the union member `{type:'editDoc'; docsFolderUri: string; docRelPath: string}` to `Message`.
    - Add `case 'editDoc'` to the A2 `validate` switch. It calls the shared helper and returns only `{type, docsFolderUri, docRelPath}`.
    - Do not add a trust gate, and do not add it to the Overview `OVERVIEW_TYPES`.
  - [x] 1.5 Add the `editDoc` dispatch arm in `src/panel/panel.ts` `TaskPanel.dispatch`
    - `openInEditor(vscode.Uri.joinPath(vscode.Uri.parse(docsFolderUri), ...DOCS_ROOT, docRelPath))`. This is the same join `buildDoc` uses (L1375-1376).
    - Reuse: `openInEditor` → `run('vscode.open')` (L697-715). It logs failures and never throws. `handleMessage` needs no change.
  - [x] 1.6 Ensure the Group 1 tests pass
    - Run only the new `editDoc` unit tests plus the existing `openDoc` cases in messages.test (`npm test -- --grep "editDoc|openDoc"` or the equivalent mocha grep).
    - Run the new integration tests with the `MAISTER_TEST_GREP` filter via `npm run test:integration`.
    - Do NOT run the entire suite.

**Acceptance Criteria:**
- The 6-8 new tests pass, and the existing `openDoc` cases in messages.test stay green (AC7).
- `editDoc` is refused for a non-workspace folder, an escaping path and a non-`.md` target, and opens nothing in those cases (AC5).
- A valid `editDoc` opens `<workspace>/.maister/docs/<docRelPath>` via `vscode.open` (AC3).
- The doc-path rules are implemented once and shared by `openDoc` and `editDoc` (DRY).

### Task Group 2: Reader UI (header row + Edit button)
**Dependencies:** None
**Files to Modify:** src/strings.ts, src/webview/reader.ts, media/webview.css, test/dom/readerDoc.spec.ts, test/dom/surfaces.spec.ts
**Estimated Steps:** 7

- [x] 2.0 Complete the reader Edit button for doc and artifact pages
  - [x] 2.1 Write 3-4 focused DOM tests in `test/dom/readerDoc.spec.ts` (doc mode)
    - `getByRole('button', {name: READER.edit, exact: true})` exists exactly once and is not inside any `nav`. `focusables` shows it after `[PROJECT.back, PROJECT.breadcrumb]` (indexes 1-2 unchanged).
    - Its `title` = `format(READER.editTitle, {file:'coding-style.md'})`.
    - Clicking it posts exactly `{type:'editDoc', docsFolderUri: <fixture location.docsFolderUri>, docRelPath:'standards/global/coding-style.md'}`.
    - A refused doc still shows Edit and shows no `READER.openSource` button.
  - [x] 2.2 Write 2-3 focused DOM tests in `test/dom/surfaces.spec.ts` (artifact mode, using `readerPayload`)
    - Edit exists outside `nav.rd-crumbs`, after the breadcrumb and before the hero chips in tab order, and its `title` names `implementation-plan.md`.
    - Clicking it posts `{type:'openSource', folderUri, artifactRelPath:'implementation/implementation-plan.md'}`.
    - A refused artifact (`readerPayload({refused:true, notice:'x', bodyHtml:''})`) shows both Edit and `READER.openSource`.
  - [x] 2.3 Add strings in `src/strings.ts` `READER` (L399-427)
    - `edit: 'Edit'` and `editTitle: 'Open {file} in the editor'`. Check that `test/unit/strings.test.ts` (forbidden-wording scan) still passes.
  - [x] 2.4 Add the `editButton` builder in `src/webview/reader.ts`
    - A single-responsibility function that takes `(relPath, message)` and returns `<button type="button" class="action action-small">` with the text `READER.edit`, `title` = `format(READER.editTitle, {file: <last '/' segment>})`, and a click handler that runs `post(message)`. No aria-label.
    - Reuse `el()` and `post()`. Leave `sourceButton()` unchanged (the refused body still uses it).
  - [x] 2.5 Add the header row in `render()` (`src/webview/reader.ts` L200-251)
    - Doc: `div.rd-head` holding `[...docHeader(payload), editButton(docRelPath, {type:'editDoc', docsFolderUri, docRelPath})]`.
    - Artifact: `div.rd-head` holding `[breadcrumb(payload), editButton(artifactRelPath, {type:'openSource', folderUri: payload.folderUri, artifactRelPath})]`.
    - Use the row for both rendered and refused pages. Hero chips, the notice, the summary card and `main#doc` follow the row unchanged. `docHeader()`, `breadcrumb()` and `document_()` are not modified. Keep the module docblock accurate, and edit it only if it has become wrong.
  - [x] 2.6 Add the header-row CSS in `media/webview.css` (reader section)
    - `.rd-head { display:flex; flex-wrap:wrap; align-items:flex-start (or baseline); gap }`. The leading header controls keep their current vertical stacking, grouped in the row. Edit gets `margin-left:auto`, and `.action`'s `margin-top` is cancelled for it.
    - Not sticky. Theme tokens only, no new colours. The row wraps without horizontal scroll at narrow widths.
    - Reuse: `.action`/`.action-small` (L276-305) and the `margin-left:auto` precedent (`.fb-head` L359, `.filter-note` L676).
  - [x] 2.7 Ensure the Group 2 tests pass
    - Run only `readerDoc.spec.ts` and `surfaces.spec.ts` via `npm run test:dom -- test/dom/readerDoc.spec.ts test/dom/surfaces.spec.ts`.
    - Existing readerDoc tests 1-4 must pass unchanged. Test 3's click-all loop now also clicks Edit, and it must still see no `openSource`, `openArtifact` or `openTask`.

**Acceptance Criteria:**
- The 5-7 new DOM tests pass, and existing readerDoc tests 1-4 and the surfaces a11y/tab-order loops pass without modification (AC7).
- Every reader page (doc/artifact × rendered/refused) has exactly one "Edit" button at the right end of the header row, outside any `nav`, after the back link and breadcrumb in tab order (AC1).
- The tooltip reads "Open <file name> in the editor" (AC2). Artifact Edit posts `openSource` (AC4), and doc Edit posts `editDoc`.

### Task Group 3: Documentation (README + CHANGELOG)
**Dependencies:** None
**Files to Modify:** README.md, CHANGELOG.md
**Estimated Steps:** 4

- [x] 3.0 Update user-facing documentation
  - [x] 3.1 Define the checks first. There are no automated tests for docs. The checks for 3.4 are: `grep -n "one, explicit way" README.md` returns nothing, "read-only" is reworded, and `[Unreleased]` has `### Added`.
  - [x] 3.2 Update `README.md`
    - L12: reword "read-only" to "never writes files itself; editing happens in VS Code's own editor".
    - L84-85: describe the two explicit hand-offs, the in-page **Edit** on every markdown page and **Open Source File** in the title bar.
    - Modes table: mention Edit in the Artifact row and the Project row.
  - [x] 3.3 Update `CHANGELOG.md` `[Unreleased]`
    - Add `### Added` with one entry in the "**Feature** — sentence" style, for example "**Edit button** — every markdown page in the reader (task artifacts and `.maister/docs` docs) has a top-right Edit button that opens the file in VS Code's text editor."
  - [x] 3.4 Run the 3.1 checks and confirm `vision.md` and `package.json` are untouched (`git diff --stat`).

**Acceptance Criteria:**
- The README no longer claims "the one, explicit way" and describes both hand-offs (AC8).
- The CHANGELOG `[Unreleased]` has an `### Added` entry for the Edit button (AC8).
- `vision.md` and `package.json` are unchanged (R9).

### Task Group 4: Test Review & Gap Analysis
**Dependencies:** 1, 2, 3
**Files to Modify:** test/unit/messages.test.ts, test/dom/readerDoc.spec.ts, test/dom/surfaces.spec.ts, test/integration/projectMode.test.ts (append only if gaps are found)
**Estimated Steps:** 5

- [x] 4.0 Review and fill critical gaps
  - [x] 4.1 Review the tests from Groups 1-2 (about 11-15 tests) against AC1-AC7.
  - [x] 4.2 Analyse gaps for this feature only. Candidates:
    - the narrow-width wrap of `.rd-head` with no horizontal scroll;
    - the refused-artifact tab order (Edit before the in-body Source button);
    - `editDoc` for a case-variant `.MD` extension;
    - AC6 live refresh after save (covered by the existing watchers; add an integration test only if one does not already cover docs re-render).
  - [x] 4.3 Write up to 7 additional strategic tests for real gaps only (well under the maximum of 10).
  - [x] 4.4 Run the full regression once: `npm run check`, `npm run test:dom`, `npm run test:integration`.
    - Confirm the reader.test AC5 test (`test/integration/reader.test.ts` L82), the themes/surfaces a11y loops and strings.test pass without modification.
  - [x] 4.5 Fix any regression inside the feature's files only, and record the results in the work log.

**Acceptance Criteria:**
- All feature tests pass (about 13-22 total new tests).
- No more than 10 additional tests are added.
- All three suites are green, and AC7's list of existing tests passes without modification.

## Execution Order

1. Group 1: Protocol & Host (6 steps, no dependencies), in parallel with 2 and 3
2. Group 2: Reader UI (7 steps, no dependencies), in parallel with 1 and 3
3. Group 3: Documentation (4 steps, no dependencies), in parallel with 1 and 2
4. Group 4: Test Review & Gap Analysis (5 steps, depends on 1, 2 and 3)

No two of Groups 1-3 declare the same file, so they can run concurrently. Group 4 may append to the test files of Groups 1-2, so it is serialised after them.

## Standards Compliance

Follow the standards in `.maister/docs/standards/`:
- **global/validation.md.** The allowlist is `.md` files under `.maister/docs` in a workspace folder. Validation happens host-side and early, and refusals give specific reasons.
- **global/coding-style.md.** The doc-path check is shared by `openDoc` and `editDoc` (DRY). Naming is consistent (`editDoc`, `editButton`, `.rd-head`).
- **global/minimal-implementation.md.** No title-bar command, icon font, trust gate, split editor, fixture rewrite or new spec file.
- **global/commenting.md.** No change comments. Docblocks stay accurate.
- **global/conventions.md.** README and CHANGELOG are updated. No new dependencies.
- **frontend/accessibility.md.** A real `<button>` with the visible name "Edit", in DOM order after the navigation, with no positive tabindex. The tooltip goes in `title`, and there is no aria-label.
- **frontend/css.md.** Reuse `.action`/`.action-small` and theme tokens. Minimal new CSS.
- **frontend/components.md.** One single-responsibility `editButton` builder with a minimal interface.
- **frontend/responsive.md.** The header row wraps at narrow panel widths.

## Notes

- Test-Driven: each group starts with its focused tests (2-8).
- Run Incrementally: after each group, run only its new and affected tests. The full suites run once, in Group 4.
- Mark Progress: check off steps as you complete them.
- Reuse First: `el()`, `post()`, `openSource`, `openInEditor`, `DOCS_ROOT`, `resolveInside`, the `.action` classes, and the test harness helpers.
