# Specification: Edit button on Maister Lens markdown viewer pages

## TL;DR
Every markdown page the reader bundle renders (`.maister/docs` docs and `.md` task artifacts, rendered or refused) gets a text **Edit** button. Refused `.html` artifacts get none. It sits at the right end of a new, non-sticky header row, and opens the underlying file in VS Code's text editor in the same editor group.
- Artifact pages post the existing `openSource` message.
- Doc pages post a new, strictly validated `editDoc {docsFolderUri, docRelPath}`. Its validation shares the `openDoc` rules; the logic is extracted once, not copied.
- The host reuses `openInEditor` → `vscode.open`. The existing watchers refresh the viewer after a save.
- The README and CHANGELOG are updated. vision.md is not changed.

## Key Decisions
- **Doc pages post a new `editDoc` message, not the existing `openFile`.** `openFile` accepts any workspace file, while `editDoc` accepts only `.md` files under `.maister/docs` in a workspace folder (validation.md, allowlists).
- **Artifact pages reuse `openSource`.** It is already validated, and AC5 says artifact `vscode.open` is reached "only via openSource".
- **The Edit button sits outside `nav.rd-crumbs`, after the back link and breadcrumb in DOM order.** Edit is an action, not navigation, and readerDoc.spec needs the strict locator and the focus order to stay as they are.
- **Visible text is "Edit". The tooltip (`title`) is "Open <file name> in the editor".** There is no aria-label. An sr-only suffix makes the accessible name "Edit <file name>". It still starts with the visible "Edit" (WCAG 2.5.3 label-in-name). *(Amended after verification. The first version had the name "Edit" only.)*
- **Refused pages keep both controls.** They show the header Edit button and the in-body "Open source file" button. The user accepted the duplication.
- **Styling is text only (`.action .action-small`).** There is no icon font and no CSP or asset change.
- **Nothing else changes.** No title-bar command for doc mode, no trust gate, no split-editor option. The existing artifact title-bar Open Source File icon stays.

## Open Questions / Risks
- **The fixture passes a different URI than the real panel.** The DOM fixture `readerDocPayload()` passes the docs directory as `docsFolderUri`, and the real panel passes the workspace folder. The webview only echoes `payload.location.docsFolderUri`, so the DOM test asserts against the fixture's value, and the integration test asserts against the real workspace folder. The fixture is not changed.
- **The viewer is hidden while editing.** Opening in the same editor group puts the text editor in front of the viewer. The live refresh after a save is visible only when the user switches back to the viewer tab. This is expected.
- **Refused `.html` artifacts get no Edit button.** They have no markdown to edit, and the in-body "Open source file" button still reaches the file. *(Amended after verification. The first version showed Edit there.)*
- **README wording must change.** The "read-only" and "one, explicit way" statements (README L12, L84-85) have to be reworded so they stay true.

## Goal
Let a reviewer who is reading a rendered standard, project doc or task artifact jump into VS Code's regular text editor on that `.md` file in one click, so they can make changes.

## User Stories
- As a developer reviewing a standard or project doc in Maister Lens, I want an Edit button in the top-right corner so that I can fix the doc in the regular editor without finding it in Explorer.
- As a developer reading a task artifact, I want the same Edit button so that correcting a spec or plan is one click away, in the same place on every markdown page.
- As a keyboard or screen-reader user, I want Edit to be a named, tab-reachable button after the page navigation so that I can reach it without a pointer.

## Core Requirements
1. **R1 Header row.** The reader renders a header row containing the page's existing header controls followed by an Edit button.
   - The row is used for `kind: 'doc'` payloads (back link + breadcrumb) and for artifact payloads (breadcrumb).
   - It applies to rendered and refused pages alike. On artifact pages the Edit button is rendered only when `artifactRelPath` ends in `.md` (case-insensitive), so a refused `.html` artifact's row holds the breadcrumb alone.
   - The row is not sticky. Edit is right-aligned and wraps cleanly at narrow widths.
   - Hero chips, the notice banner, the summary card and `main#doc` stay below the row, unchanged.
2. **R2 Placement constraints.**
   - Edit is not inside `nav.rd-crumbs` or any `nav`.
   - In DOM and tab order it comes after the back link and breadcrumb controls.
   - Doc-mode focusables at index 1–2 stay `[PROJECT.back, PROJECT.breadcrumb]`.
3. **R3 Label and tooltip.**
   - The button is a `<button type="button" class="action action-small">` whose visible text is `READER.edit` = `"Edit"`.
   - Its `title` is `format(READER.editTitle, {file})`, with `READER.editTitle` = `"Open {file} in the editor"`. `{file}` is the last path segment of `docRelPath` (doc) or `artifactRelPath` (artifact).
   - Both strings live in `src/strings.ts`.
   - There is no aria-label. The button's content is `"Edit "` followed by an sr-only `hidden(file)` span, so its accessible name is `"Edit <file>"`, for example "Edit coding-style.md".
4. **R4 Doc action.** Clicking Edit on a doc page posts `{type:'editDoc', docsFolderUri: location.docsFolderUri, docRelPath: location.docRelPath}` and nothing else. Doc mode still never posts `openSource`, `openArtifact` or `openTask`.
5. **R5 Artifact action.** Clicking Edit on an artifact page posts `{type:'openSource', folderUri: payload.folderUri, artifactRelPath: payload.location.artifactRelPath}`. This is the same message the existing `sourceButton()` sends.
6. **R6 `editDoc` validation.** `editDoc` joins the `Message` union and the A2 `validate` switch. It is accepted only when all of the following hold:
   - `docsFolderUri` is exactly one of `context.workspaceFolderUris`;
   - `docRelPath` is a string that resolves inside the root through `resolveInside`, and is returned normalised;
   - the resolved path ends in `.md` (case-insensitive).

   Other fields are dropped from the accepted message. Refusal reasons name the message type (`editDoc …`).
   - The folder/path/`.md` checks are extracted from `validateDoc` into one shared helper that both `openDoc` and `editDoc` use.
   - `openDoc` behaviour and refusal wording keep their current meaning, and existing `messages.test.ts` regexes (`/workspace folder/`, etc.) stay green.
   - `editDoc` is not trust-gated, and it is not added to the Overview view's `OVERVIEW_TYPES`.
7. **R7 `editDoc` dispatch.** `TaskPanel.dispatch` gets an `editDoc` arm that calls `openInEditor(joinPath(parse(docsFolderUri), ...DOCS_ROOT, docRelPath))`. This is the same URI `buildDoc` renders, and it opens as a normal editor tab in the active group. Failures are logged by `run()` and never thrown.
8. **R8 Live refresh.** After the user saves in the editor, the viewer re-renders through the existing docs watcher (doc) or the artifact/task watcher (artifact). No new code is needed.
9. **R9 Unchanged surfaces.**
   - The in-body `READER.openSource` button on refused artifacts stays.
   - The title-bar `maister.openArtifactSource` stays.
   - Hosted HTML companions and task `dashboard.html` get no Edit button, because they don't run the reader bundle.
   - `package.json` contributions and vision.md are unchanged.
10. **R10 Docs.**
    - README L12: reword "read-only" to "never writes files itself; editing happens in VS Code's own editor".
    - README L84-85: describe the two explicit hand-offs, the in-page **Edit** on every markdown page and **Open Source File** in the title bar.
    - README modes table: mention Edit in the Artifact row and the Project row.
    - CHANGELOG `[Unreleased]`: add a `### Added` entry in the "**Feature** — sentence" style.

## Reusable Components

### Existing Code to Leverage
| Element | Location | Use |
|---|---|---|
| `el()` DOM helper + `post()` | `src/webview/components.ts`, `src/webview/reader.ts` L35 | Build the button and send the message |
| `sourceButton()` | `src/webview/reader.ts` L173-183 | Template for the artifact `openSource` post (same fields) |
| `docHeader()` / `breadcrumb()` | `src/webview/reader.ts` L58-84 | Existing header controls, wrapped in the new row unchanged |
| `render()` | `src/webview/reader.ts` L200-251 | Single insertion point for both modes |
| `validateDoc` + `resolveInside` | `src/panel/messages.ts` L240-257, L124-141 | Source of the shared doc-path check for `openDoc`/`editDoc` |
| `openSource` validation | `src/panel/messages.ts` L372-391 | Artifact path; unchanged |
| `openInEditor` → `run('vscode.open')` | `src/panel/panel.ts` L697-715 | Opens the editor, logs and never throws |
| `DOCS_ROOT` | `src/panel/panel.ts` L91 | Same join `buildDoc` uses (L1375-1376) |
| Docs watcher / artifact watcher | `src/panel/panel.ts` L1653-1700 | Live refresh after save |
| `READER`, `format()` | `src/strings.ts` L399-427, L502 | Home for the new label and tooltip template |
| `.action`, `.action-small`, `margin-left:auto` precedent | `media/webview.css` L276-305, L831, `.fb-head` L359, `.filter-note` L676 | Button look and right alignment |
| Test helpers | `test/dom/harness.ts` (`openSurface`, `surface.posted()`, `focusables`, `readerPayload`, `readerDocPayload`); `test/helpers/tempWorkspace.ts` `spyOnCommand` L190; `test/integration/projectMode.test.ts` `projectHarness()`; `test/unit/messages.test.ts` `accepted`/`refused` | All new tests build on these |

### New Components Required
- **`editButton` builder in reader.ts.** A small function that takes the file path and the message to post. `sourceButton()` has a different label and class and no tooltip, and is still needed in the refused body, so it can't be reused as-is. The shared parts are only `el()` and `post()`.
- **Header row wrapper** (for example `div.rd-head`) with one CSS rule set. No existing reader element holds the nav and an action side by side, and the Edit button must not go inside `nav.rd-crumbs`.
- **`editDoc` message.** It adds one union member, one validate case (backed by the shared helper), and one dispatch arm. It is justified because `openFile` is looser than an allowlist and `openSource` needs an indexed task folder, which docs lack.
- **Two strings**, `READER.edit` and `READER.editTitle`.

## Technical Approach
- **Webview (`reader.ts`).** `render()` builds one header row.
  - For doc: `[...docHeader(payload), editButton(...)]`. For artifact: `[breadcrumb(payload), editButton(...)]`.
  - Hero chips and everything else are appended after the row as today.
  - The existing header elements keep their current vertical arrangement, grouped at the leading side. Edit is pushed to the right with `margin-left:auto` and aligned with the first header line.
  - The file name for the tooltip is the substring after the last `/`.
  - `document_()` and the refused-body `sourceButton()` are unchanged.
  - The module docblock line "no … Source button" stays accurate, because doc mode gets Edit and never the Source button. Update the docblock only if it becomes wrong.
- **CSS (`media/webview.css`, reader section).** Add the header-row rule (flex, wrap, gap, baseline/start alignment) and cancel `.action`'s `margin-top` for the header button. Use VS Code theme tokens only, with no new colours.
- **Protocol (`messages.ts`).**
  - Add the `editDoc` union member.
  - Extract the folder/path/`.md` checks into a shared helper that is parameterised by message type for refusal wording.
  - `validateDoc` keeps its anchor check and calls the helper. The new `case 'editDoc'` calls the helper and returns `{type:'editDoc', docsFolderUri, docRelPath}`.
- **Host (`panel.ts`).** Add the `editDoc` dispatch arm (R7). `handleMessage` (L561-581) already puts `workspaceFolderUris` into the validation context, so it needs no change.
- **Data flow.** Click → `post` → `panel.handleMessage` → `validate` → `dispatch` → `openInEditor` → `vscode.open`. The user saves, the watcher fires, and the reader re-renders at the same `locationKey` with scroll preserved.

## Implementation Guidance

### Testing Approach
- Write 2-8 focused tests per implementation step group. Test verification runs only the new and affected tests, not the entire suite.
- **Unit, `test/unit/messages.test.ts`.** Add an `editDoc` case next to R9. It covers:
  - accepts a valid doc and returns a normalised path (for example `./standards/global/../frontend/css.md` becomes `standards/frontend/css.md`);
  - drops extra fields such as `anchor`;
  - refuses a non-workspace `docsFolderUri`, a trailing-slash folder, and missing `workspaceFolderUris`, each matching `/workspace folder/`;
  - refuses a non-`.md` path, `..` traversal and a non-string `docRelPath`;
  - is accepted in an untrusted context.
  - Existing `openDoc` tests must stay green.
- **DOM, `test/dom/readerDoc.spec.ts`.** Add tests that check:
  - Edit (`getByRole('button', {name: `${READER.edit} coding-style.md`, exact: true})`) exists once, is not inside `nav`, comes after back and breadcrumb in `focusables`, and has `title` = `format(READER.editTitle, {file:'coding-style.md'})`;
  - clicking it posts exactly `{type:'editDoc', docsFolderUri: <fixture location.docsFolderUri>, docRelPath:'standards/global/coding-style.md'}`;
  - a refused doc still shows Edit and no Source button.
  - Existing tests 1-4 must pass unchanged. Test 3's click-all loop now clicks Edit too, and must still see no openSource, openArtifact or openTask.
- **DOM, artifact reader.** Add to `surfaces.spec.ts`, or to a new `readerArtifact.spec.ts` if that reads cleaner. Tests check:
  - Edit exists outside `nav.rd-crumbs`, after the breadcrumb and before the hero chips in tab order;
  - clicking it posts `{type:'openSource', folderUri, artifactRelPath:'implementation/implementation-plan.md'}`;
  - a refused artifact (`readerPayload({refused:true, notice:'x', bodyHtml:''})`) shows both Edit and `READER.openSource`;
  - a refused `.html` artifact shows no Edit button and still shows `READER.openSource`.
- **Integration, `test/integration/projectMode.test.ts`.** Using `projectHarness()` + `spyOnCommand('vscode.open')`:
  - a round trip: take the Project payload's `docsFolderUri`, send `openDoc`, then echo the render payload's `location` as `editDoc`. This calls `vscode.open` once, with `fsPath` = `<workspace>/.maister/docs/project/vision.md`;
  - a refused `editDoc` (a `.yml` path, or a folder outside the workspace) calls it zero times.
- **Regression.** The AC5 test in `test/integration/reader.test.ts` L82 and the `surfaces.spec`/`themes.spec` a11y and tab-order loops must stay green unmodified.
- **Commands.** Run `npm run check`, `npm run test:dom` and `npm run test:integration`.

### Standards Compliance
- **global/validation.md.** Webview input is validated host-side, against an allowlist (`.md` under `.maister/docs` in a workspace folder), early, with specific refusal reasons.
- **global/coding-style.md (DRY).** The doc-path check is shared between `openDoc` and `editDoc`, not duplicated.
- **global/minimal-implementation.md.** No title-bar command, icon font, trust gate, split option or fixture rewrite, and no speculative helpers.
- **global/commenting.md.** No change comments. Keep docblocks accurate.
- **global/conventions.md.** README and CHANGELOG are updated, and there are no new dependencies.
- **frontend/accessibility.md.**
  - Edit is a real `<button>` with a visible name, keyboard-reachable in document order after the navigation.
  - It has no positive tabindex.
  - The tooltip goes in `title`, not in a name-overriding aria-label.
- **frontend/css.md.** Reuse `.action`/`.action-small` and theme tokens. The new CSS is minimal.
- **frontend/components.md.** A single-responsibility button builder with a minimal interface (the file path and the message).
- **frontend/responsive.md.** The header row wraps at narrow panel widths without horizontal scroll.

## Out of Scope
- A title-bar Edit command for doc mode, and any `package.json` or manifest-test change.
- Removing or merging the refused-page "Open source file" button.
- Codicons, icon assets, or any CSP change.
- Opening to the side (a split editor) or any configurable editor location.
- An Edit button on hosted HTML companions or task `dashboard.html`.
- Trust gating for `editDoc`.
- Changes to vision.md.
- Fixing the DOM fixture's `docsFolderUri` mismatch, and serializer restore of doc mode.

## Success Criteria
- **AC1.** On every markdown reader page (doc, or `.md` artifact; rendered or refused), exactly one button with visible text "Edit" and accessible name "Edit <file>" appears at the right end of the header row. Refused `.html` artifacts show none. It is outside any `nav` and follows the back and breadcrumb controls in tab order.
- **AC2.** Hovering Edit shows "Open <file name> in the editor" with the page's actual file name.
- **AC3.** Edit on a doc page opens `<workspace>/.maister/docs/<docRelPath>` in a text editor in the same editor group, through `editDoc` and `vscode.open`.
- **AC4.** Edit on an artifact page opens `<task folder>/<artifactRelPath>` through `openSource` and `vscode.open`.
- **AC5.** `editDoc` is refused for a non-workspace folder, for a path escaping the root, and for a non-`.md` target, and opens nothing in those cases.
- **AC6.** After the user edits and saves the file, switching back to the viewer shows the updated render with no manual refresh.
- **AC7.** All of the following pass unchanged: existing readerDoc.spec tests 1-4, the surfaces/themes a11y loops, messages.test `openDoc` cases and the reader.test AC5.
- **AC8.** README no longer claims "the one, explicit way", and the CHANGELOG `[Unreleased]` has an `### Added` entry for the Edit button.
