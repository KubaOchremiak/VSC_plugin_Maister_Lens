# Gap Analysis: Edit button on Maister Lens markdown viewer pages

## TL;DR
- The reader bundle (`src/webview/reader.ts`) has no in-page control that hands a rendered page to VS Code's text editor. The only exception is the "Open source file" button, and it appears only on *refused* artifacts.
- The host side can already do everything needed. Artifact mode reuses the existing, validated `openSource` message, which is the only path to `vscode.open` that AC5 allows. Doc mode needs either a new strictly validated `editDoc` message (recommended) or the existing, looser `openFile`.
- The change is additive: one header row per mode, one string, one CSS rule, an optional message arm, tests, and edits to the README and CHANGELOG. Risk is low. Most of the effort goes into test constraints and wording.

## Key Decisions
- **Characteristics.** The task changes existing code and is UI-heavy. It has no defect, creates no new data entity, and does no CRUD. Opening an editor does not write anything, and the viewer never persists anything. The user saves through VS Code's own editor.
- **One button, both modes, one label.** The label is `READER.edit = 'Edit'` in both modes, which follows the user's choice of "Docs + artifacts". It cannot be `READER.openSource`, because readerDoc.spec tests 3 and 4 assert there are zero buttons with that name in doc mode.
- **Artifact mode sends `openSource {folderUri, artifactRelPath}`.** That message is already validated (the folder must be indexed and the path must stay inside the task folder). The AC5 integration test (`test/integration/reader.test.ts` L82) says `vscode.open` is reached "only via openSource", so reusing it keeps that invariant true.
- **Keep the Edit button out of `nav.rd-crumbs`.** readerDoc.spec L25 clicks `nav.rd-crumbs button`, and a second button there triggers Playwright's strict-mode violation. Edit is also an action, not navigation, so it belongs in a sibling header row: flex, `margin-left:auto`, `.action .action-small`. Its DOM position is after the back link and breadcrumb, which keeps focusables `slice(1,3)` equal to `[PROJECT.back, PROJECT.breadcrumb]`.
- **No Edit button on hosted HTML pages.** These are the styled companion view (`variant:'html'` with the companion hosted successfully) and the task `dashboard.html`. Neither is a markdown viewer page, and neither runs the reader bundle (panel.ts L1177-1189).
- **No title-bar command and no trust gate.** Adding either would churn manifest.test M6 and `sourceUri()`, and opening an editor is already ungated.

## Open Questions / Risks
- **Refused artifacts would show two controls that do the same thing:** the header Edit button and the in-body "Open source file" button, both posting `openSource`. See decision I-2.
- **Refused `.html` artifacts** (panel.ts L1193-1194) are rendered as refusals in the reader, so the header Edit button would open an HTML file. See decision I-2.
- **Wording in `vision.md` success criterion 2**, "Rendered, always. No artifact is ever shown as source through the extension's own navigation": Edit is an explicit hand-off, not navigation, but the criterion should be read carefully. See decision I-3.
- **The same-editor-group choice hides the viewer.** It sits behind the text editor tab, so the live refresh after save is only visible when the user switches back. This follows from the user's choice and is noted only for the spec's acceptance wording.
- **Fixture mismatch.** The DOM fixture `readerDocPayload()` uses the docs directory as `docsFolderUri`, while the real panel passes the workspace folder. A new DOM assertion on the `editDoc` payload has to match the fixture value, and the integration test must use the real workspace-folder URI.

## Summary
- **Risk Level**: Low
- **Estimated Effort**: Low (about 60-120 LOC including tests)
- **Detected Characteristics**: modifies_existing_code, ui_heavy

## Task Characteristics
- Has reproducible defect: no
- Modifies existing code: yes (`reader.ts` headers, `strings.ts`, `webview.css`, and optionally `messages.ts`/`panel.ts`)
- Creates new entities: no (no new files, surfaces or commands; at most a new message type)
- Involves data operations: no (the extension still never writes; editing happens in VS Code's native editor)
- UI heavy: yes (a new visible header control on two reader modes)

## Gaps Identified

### Missing Features
- **In-page Edit control, doc mode.** `docHeader()` (reader.ts L77-84) renders only the back navigation and the breadcrumb. The doc page has no way to reach the editor. `sourceUri()` in panel.ts L532-553 ignores doc mode, so the title bar offers nothing on doc pages either.
- **In-page Edit control, artifact mode.** `breadcrumb()` (L58-68) plus the hero chips. The only in-page source control is `sourceButton()`, and it is rendered only when `payload.refused` (L187-193). The title-bar `maister.openArtifactSource` exists (package.json L89/198/298/335) but is not in the page.
- **String.** `src/strings.ts` has no "Edit" label or aria-label.
- **Doc-scoped editor-open message (optional).** Doc mode has no message scoped to `.maister/docs/*.md`. `openFile` resolves against `workspaceRootUri`, which in doc mode is the workspace folder (panel.ts L727-745), so it accepts any workspace file.

### Incomplete Features
- **README L12 and L84-85** say "read-only" and describe **Open Source File** as "the one, explicit way" to reach the text. After this change that is no longer accurate. The user has confirmed the README update.
- **CHANGELOG `[Unreleased]`** is empty and needs an `### Added` entry.

### Behavioral Changes Needed
- Every reader page (artifact and doc, rendered or refused) shows a top-right **Edit** button that opens the underlying file with `vscode.open` in the active group.

## User Journey Impact Assessment

| Dimension | Current | After | Assessment |
|-----------|---------|-------|------------|
| Reachability (docs) | No path. The user must find the file in Explorer under `.maister/docs/...` | One click from the doc page | Improved |
| Reachability (artifacts) | Title-bar icon `file-code` (hover-only label) or Explorer | In-page Edit, plus the title-bar icon | Improved |
| Discoverability | Docs 1/10, artifacts 5/10 (icon-only title-bar action) | 8/10 (labelled button in a standard top-right spot) | +7 (docs), +3 (artifacts) |
| Flow Integration | Review, leave the viewer, find the file, edit | Review, click Edit, edit, save, switch back to see the refreshed render (docs watcher; artifact watcher) | Positive |
| Multi-persona | Single persona (developer in the workspace). Untrusted workspace: opening an editor is not trust-gated | Same | No change |

Keyboard and screen-reader users: the control is a real `<button type="button">` with visible text "Edit". Its aria-label, for example "Edit standards/global/coding-style.md in text editor", begins with the visible text, which satisfies WCAG 2.5.3 label-in-name. It is placed after the navigation in DOM order, and the generic tab-order loop in surfaces.spec L197-217 covers it automatically.

## Data Lifecycle Analysis
Not applicable. There is no data entity. The viewer stays a read layer and all writes happen in VS Code's editor. The existing docs and artifact watchers already cover the "READ after UPDATE" leg by re-rendering after save. There are no orphaned operations.

## Implementation Surface (evidence)

| Layer | Artifact mode | Doc mode |
|-------|---------------|----------|
| Webview control | New header row in `render()` beside `breadcrumb()` | New header row beside `docHeader()` |
| Message | `openSource {folderUri, artifactRelPath}` (exists, messages.ts L372-391) | `editDoc {docsFolderUri, docRelPath}` (new; reuse `validateDoc` rules L240-257) or `openFile` (exists) |
| Host dispatch | Exists, `openInEditor` → `vscode.open` (panel.ts L697-715) | New arm: `joinPath(docsFolderUri,'.maister','docs',docRelPath)` → `openInEditor` (same join as `buildDoc` L1372-1428) |
| Live refresh | Existing artifact/task watcher | Existing docs watcher (panel.ts L1653-1700) |

Tests to add or extend:
- `test/dom/readerDoc.spec.ts`: the Edit button exists, is not inside `nav.rd-crumbs`, comes after the back link and breadcrumb, and posts `editDoc`. Tests 1 and 3 must stay green.
- An artifact-reader DOM test: Edit posts `openSource` with the page's `folderUri` and `artifactRelPath`.
- `test/unit/messages.test.ts`: `editDoc` is accepted for a valid doc and refused for non-`.md` files, `..` traversal, and a folder that is not a workspace folder.
- `test/integration/projectMode.test.ts` or `panel.test.ts`: spy on `vscode.open` and assert it receives `.maister/docs/<rel>`.
- `surfaces.spec`/`themes.spec` pick up the new control automatically.

## Issues Requiring Decisions

### Critical (Must Decide Before Proceeding)
None. The scope, where the editor opens, and the documentation updates were decided in Phase 1.

### Important (Should Decide)
1. **I-1: Doc-mode message contract.**
   - Options: [A] New `editDoc {docsFolderUri, docRelPath}` validated with the shared `validateDoc` rules (only `.md` files under `.maister/docs`, in a workspace folder). [B] Reuse `openFile {workspaceRelPath:'.maister/docs/'+docRelPath}`, with no protocol change but acceptance of any workspace file.
   - Default: A
   - Rationale: follows validation.md ("allowlists over blocklists, validate early"). It adds about 15 lines to messages.ts and panel.ts, and keeps the A2 table precise.
2. **I-2: Refused pages (too large, unreadable, `.html` artifact).**
   - Options: [A] Show the header Edit button on every page, including refused ones, and remove the now-redundant in-body `sourceButton()` (so `READER.openSource` and its refused-artifact test are updated or removed). [B] Show Edit everywhere and keep the in-body "Open source file" button as well, which duplicates the control. [C] Hide Edit on refused pages and keep the current refused-page behaviour.
   - Default: A
   - Rationale: gives one consistent control and avoids a duplicate (minimal-implementation, DRY). A refused page is exactly when the text editor is most useful. For a refused `.html` artifact, "Edit" still opens the real file, which is acceptable.
3. **I-3: vision.md success criterion 2 ("Rendered, always … never shown as source through the extension's own navigation").**
   - Options: [A] Leave vision.md unchanged, because Edit is an explicit hand-off to VS Code and not viewer navigation, just as Open Source File already is. [B] Add a clarifying clause to criterion 2 ("…except via the explicit Edit / Open Source File hand-off").
   - Default: A
   - Rationale: the user asked for README and CHANGELOG updates only. The criterion is still true under the "navigation" reading. Option B is a one-line change if the user wants the vision to be explicit.
4. **I-4: Label / affordance.**
   - Options: [A] Text-only "Edit" button (`.action .action-small`). [B] Codicon pencil plus "Edit" text. [C] Icon-only pencil.
   - Default: A
   - Rationale: the reader bundle has no codicon font or loading pattern, and adding one means a CSP/asset change. Text-only matches existing actions (`.fb-head .action`, dashboard row actions) and keeps the accessible name trivial. An icon-only button hurts discoverability.

## Recommendations
- Add one small helper, `editButton(label, ariaLabel, message)`, and a header wrapper (for example `.rd-head { display:flex; flex-wrap:wrap; align-items:baseline; gap }` with `.rd-edit { margin-left:auto }`) used by both modes. It must not share `.rd-crumbs`.
- Artifact mode: post `openSource` with `payload.folderUri` and `payload.location.artifactRelPath`.
- Doc mode: post `editDoc` (I-1 A). Extract a shared doc-path check from `validateDoc` instead of duplicating it.
- Update README L12 so read-only means "never writes files itself", and L84-85 to cover the two explicit hand-offs (in-page **Edit** on every markdown page, and **Open Source File** in the title bar). Add a mention in the modes table. Add a CHANGELOG `[Unreleased] → ### Added` entry in the existing "**Feature** — sentence" style.
- Do not add a title-bar doc command, trust gating, a split-editor option, or an icon font.

## Risk Assessment
- **Complexity Risk**: Low. Two header builders and one message arm.
- **Integration Risk**: Low. It reuses `openInEditor`, which never throws and logs failures, and the existing watchers.
- **Regression Risk**: Low to medium, limited to tests. Watch for readerDoc.spec L15 (focus order), L25 (`nav.rd-crumbs button` strict locator), tests 3 and 4 (no `openSource` in doc mode), the AC5 integration test (keep artifact editor-open on `openSource`), and any refused-artifact test that asserts the in-body Source button if I-2 A is chosen.
