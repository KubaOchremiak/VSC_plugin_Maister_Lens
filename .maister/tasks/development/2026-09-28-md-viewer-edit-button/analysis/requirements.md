# Requirements

## TL;DR
A text "Edit" button sits at the right end of the reader header on every markdown viewer page (docs and task artifacts). Clicking it opens the underlying `.md` file in VS Code's text editor, in the same editor group.
- Docs post a new strict `editDoc` message. Artifacts reuse `openSource`.
- The tooltip names the file.
- README and CHANGELOG are updated. vision.md is untouched.

## Key Decisions
- Scope: docs and artifacts. The button looks the same on both.
- Placement: right end of the existing header row. Not sticky. Tab order: after the back link and breadcrumb.
- Docs post `editDoc {docsFolderUri, docRelPath}`, validated with the shared `validateDoc` rules. Artifacts post the existing `openSource`.
- The title-bar "Open Source File" icon stays for artifacts.
- Refused pages keep both the header Edit button and the in-body "Open source file" button.
- Label: visible text "Edit", with tooltip `Open <file name> in the editor`.
- Style: text only (`.action .action-small`), with no icon assets.
- Opening: same editor group, through the existing `openInEditor` → `vscode.open`.
- vision.md is not changed.

## Initial description
"On md viewer files pages add button edit on top right corner so if i review some standards or project description i can jump to regular .md editor and make changes"

## Q&A (all phases)

**Phase 1**
- Which pages? → Docs and artifacts.
- Where does it open? → The same editor group.
- Update README? → Yes, plus a CHANGELOG entry.

**Phase 2**
- Doc message → New `editDoc`.
- Refused pages → Keep both buttons.
- vision.md → Unchanged.
- Button style → Text "Edit".
- Mockups → Skipped at the user's request ("only one button").

**Phase 5**
- Placement → In the header row, right-aligned, not sticky.
- Reuse → Artifacts use `openSource`; the title-bar icon stays.
- Label → "Edit", with the tooltip naming the file.

## Functional requirements
1. The reader renders an Edit button in the header row for `kind: 'doc'` and `kind: 'artifact'` payloads. That includes refused pages that the reader bundle renders.
2. Doc mode posts `{type:'editDoc', docsFolderUri, docRelPath}`. The host validates it with the same rules as `openDoc`:
   - `docsFolderUri` must be a workspace folder;
   - the path must stay inside `.maister/docs`;
   - the file must end in `.md`.

   On success the host opens `<docsFolderUri>/.maister/docs/<docRelPath>` through `openInEditor`.
3. Artifact mode posts the existing `{type:'openSource', folderUri, artifactRelPath}`.
4. The label is `READER.edit = 'Edit'`, and the tooltip comes from a string template in `src/strings.ts`. The button has an accessible name.
5. After the user saves in the editor, the viewer refreshes through the existing docs and artifact watchers.

## Similar features / reuse
- `sourceButton()` in reader.ts: the `openSource` post and the `.action` button.
- `validateDoc` in messages.ts, `openInEditor` in panel.ts.
- Right-aligned header precedents: `.fb-head` and `margin-left:auto` (`.filter-note`, `.follow-up-count`).
- Test templates:
  - `spyOnCommand('vscode.open')` in `panel.test.ts:301-338`;
  - `projectHarness()` in `projectMode.test.ts`;
  - DOM helpers `openSurface`, `surface.posted()`, `focusables()`.

## Visual assets
None. Mockups were skipped at the user's request.

## Scope boundaries
- **Included:**
  - the reader header Edit button;
  - the `editDoc` message, its validation and its dispatch;
  - the string and CSS changes;
  - unit, DOM and integration tests;
  - README and CHANGELOG updates.
- **Excluded:**
  - a title-bar command for doc mode;
  - codicons or other icon assets;
  - a trust gate;
  - Edit on hosted HTML companions and dashboards, which don't run the reader bundle;
  - vision.md changes;
  - opening in a split editor.

## Technical considerations
- Existing tests constrain the button:
  - It must not sit inside `nav.rd-crumbs`. `readerDoc.spec` clicks that nav's button with a strict locator.
  - Doc mode must never post `openSource`, `openArtifact` or `openTask`.
  - Its label must differ from `READER.openSource`.
  - `focusables` indexes 1–2 must stay `[PROJECT.back, PROJECT.breadcrumb]`.
- The AC5 integration test requires that artifact `vscode.open` is reached only through `openSource`.
- In the DOM fixture, `readerDocPayload().docsFolderUri` is the docs directory. The real panel passes the workspace folder.
- The CSP uses a nonce and forbids inline handlers, so all behaviour lives in the bundle.
