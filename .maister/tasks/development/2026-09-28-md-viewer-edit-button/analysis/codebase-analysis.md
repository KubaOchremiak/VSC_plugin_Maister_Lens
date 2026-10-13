# Codebase Analysis Report

## TL;DR
- Every markdown page in the viewer goes through one panel (`maister.panel`, `src/panel/panel.ts`) and one reader bundle (`src/webview/reader.ts`). Doc pages (`kind === 'doc'`) get their header from `docHeader()` (L77-84), so the Edit button belongs there.
- Nothing new is needed in the protocol. In doc mode `workspaceRootUri` resolves to the workspace folder, so `{type:'openFile', workspaceRelPath:'.maister/docs/'+docRelPath}` already opens the file through `vscode.open`. The docs watcher then refreshes the viewer after each save.
- The work is small: about 30-80 lines plus tests. The main risk is the existing tests that check DOM order and that doc mode has no "Source" button, plus the README's "read-only" wording.

## Key Decisions
- Put the Edit button only in the doc-mode header (`docHeader()` in reader.ts), after the back link and breadcrumb in DOM order — the task names standards and project docs, and artifact pages already have "Open source file". Tab order must stay `[PROJECT.back, PROJECT.breadcrumb]` for readerDoc.spec test 1.
- Recommend a dedicated `editDoc {docsFolderUri, docRelPath}` message that reuses the `validateDoc` rules rather than the generic `openFile` — `openFile` in doc mode accepts any file under the workspace folder. `editDoc` restricts it to `.md` files under `.maister/docs`, as `standards/global/validation.md` asks (allowlists, validate early). Reusing `openFile` is the zero-protocol fallback.
- Give it a new label `DOC.edit`/`READER.edit` = "Edit" in `src/strings.ts`, not `READER.openSource`. readerDoc.spec test 3 asserts there are zero `READER.openSource` buttons and that no `openSource` message is posted in doc mode.
- Do not add a trust gate. `TRUST_GATED` covers only startWorkflow, runNextAction and openInBrowser, and opening a file in the editor is already ungated.
- Align it right with a flex header row and `margin-left:auto`, following the existing `.fb-head` / `.filter-note` examples, and style it with `.action`/`.action-small` so it uses the VS Code button theme tokens.

## Open Questions / Risks
- Product stance: README L12 says the extension is "read-only", and README L84-85 calls Open Source File "the one, explicit way" to reach the text. Vision success criterion 2 says content is "Rendered, always". The Edit button does not make the extension write anything, but the README paragraph needs rewording. Confirm the user is fine with a second escape hatch.
- Scope: should the button also appear on task artifact pages (`mode:'artifact'`)? The task says "such as standards and project docs". Artifact pages already have the title-bar `maister.openArtifactSource`, and adding an in-page Edit there would duplicate it. Recommend doc mode only unless the user says otherwise.
- Optional title-bar command for doc mode: `sourceUri()` (panel.ts L532-553) ignores doc mode. Adding one means changing the package.json `when` clause, the palette/command counts in manifest.test.ts, and M6 test L167-177 ("no source-side title-bar button in project or doc mode"). Recommend not doing it (minimal implementation).
- Fixture mismatch: the DOM fixture `readerDocPayload()` uses the docs dir (`file:///workspace/maister-lens/.maister/docs`) as `docsFolderUri`, while the real panel passes the workspace folder URI. Tests that assert the posted payload must account for this, and ideally the fixture gets fixed.
- Serializer `readLocation()` (panel.ts ~1820-1855) does not restore doc mode after a reload. The Edit button does not depend on this, but anyone testing across restarts will notice.

---

## Summary

The Maister Lens viewer renders all markdown (task artifacts and `.maister/docs` files) through one webview panel and one reader bundle, and branches on `payload.kind`. The host side already routes editor-open requests through `openInEditor` → `vscode.open`, which never throws, and a docs file watcher re-renders the viewer when a doc changes. So an Edit button needs one header button, one string, one CSS rule and optionally a narrowly validated message. The hardest parts are keeping the existing a11y/DOM tests green and updating the README's read-only wording.

---

## Files Identified

### Primary Files

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/src/webview/reader.ts** (329 lines)
- Reader bundle. `breadcrumb()` L58-68 (artifact header), `projectButton()`/`docHeader()` L70-84 (doc header: "← Project" nav + "Project › docRelPath" crumbs), `sourceButton()` L173-183 (shown only on refused artifacts), `render()` ~L200-251 (skip-link → header → chips → banner → summary → `main#doc`), delegated click handler L288-313 (`data-file` posts `openFile`), message/ready wiring L315-329.
- The Edit button is added here, in the doc header.

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/src/panel/messages.ts** (445 lines, vscode-free)
- Message union L42-69, MessageContext L71-90, `resolveInside()` L124-141, `validateDoc` L240-257 (docsFolderUri must be a workspace folder, path contained, `.md`), `validateOpenFile` L294-308, `openSource` L372-391, `TRUST_GATED` L95.
- Changes here only if a dedicated `editDoc` message is added (it can reuse `validateDoc`).

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/src/panel/panel.ts** (1855 lines)
- `handleMessage` L562-582 → dispatch L605-667 (openSource/openFile → `openInEditor` L697-699 → `run('vscode.open')` L702-715, logs, never throws). `workspaceRootUri` L727-745 returns `location.docsFolderUri` in doc mode. `buildDoc` L1372-1428 (uri = joinPath(docsFolderUri, '.maister', 'docs', docRelPath)). `DOCS_ROOT`/`DOCS_BASE` L91-92. CSP in `bundleHtml()` L1519-1544. `enableCommandUris:false` L791. Docs watcher L1653-1700. `applyContextKeys` L1727-1753.
- Gets a dispatch arm if `editDoc` is added.

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/src/strings.ts** (506 lines)
- All UI copy lives here. READER L399-427 (`openSource: 'Open source file'`), PROJECT L235-248 (`back`, `breadcrumb`). There is no "Edit" string yet.

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/media/webview.css** (890 lines)
- `.link`/`.action` L276-305 (`--vscode-button-*`), `.action-small` L831, reader styles L439+ (`.rd-crumbs` flex-wrap baseline). Right-align examples: `margin-left:auto` at `.filter-note` L676 and `.follow-up-count` L865, `.chart-head` space-between L703, `.fb-head` L359 (flex h1 + action button). The reader has no sticky toolbar.

### Related Files

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/src/panel/render.ts** (428 lines)
- `DocLocation` L64-69 (`docsFolderUri`, `docRelPath` relative to `.maister/docs`), `DocRenderPayload` L90-101. It already carries everything the button needs, so no change is expected.

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/src/webview/projectMode.ts**
- L38-51, L88: posts `openDoc {docsFolderUri: workspace folder URI, docRelPath}`. This is how doc pages are opened.

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/package.json**
- `maister.openArtifactSource` (icon `file-code`), editor/title navigation@6, when `maister.panel.mode == 'artifact'`. Changes only if a title-bar Edit entry is chosen, which is not recommended.

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/README.md**
- L12 read-only statement. L76-82 panel modes table. L84-85 "Open Source File is the one, explicit way…". Needs rewording.

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/CHANGELOG.md**
- Keep a Changelog, with an empty `[Unreleased]` section. Add a `### Added` entry in the "**Feature** — sentence" style.

**/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin/.maister/docs/project/vision.md**
- Success criterion 2 ("Rendered, always"). Use it for context; an update is optional.

Other consumers (artifact mode, unaffected): `src/.../nowTree.ts` L320-340, `overviewView.ts` L480, `fallbackTask.ts` L188/252/290, `shim.ts` L131/138, `navTree.ts` L25.

---

## Current Functionality

- **Doc mode**: navTree "Project" → `maister.openProject` → project webview → `openDoc` → `validateDoc` → `buildDoc` → reader renders `DocRenderPayload` with the `docHeader()` back link and breadcrumb, then `main#doc`. In-doc `.md` links post `openDoc` (reader.ts L266-276).
- **Artifact mode**: breadcrumb to the task, hero chips, and the title-bar "Open source file" (`maister.openArtifactSource`). An in-page Source button appears only on refused artifacts.
- **Editor-open paths**: `openSource` (needs an indexed task `folderUri`, so it does not work for docs) and `openFile` (workspace-relative path resolved against `workspaceRootUri`, so it works in doc mode today).
- **Title-bar source command on doc pages**: `sourceUri()` ignores doc mode, so the command does nothing there and is hidden by its `when` clause.

### Key Components/Functions
- **docHeader(payload)**: builds the doc header navs. This is where the button goes.
- **post(msg)**: sends webview → host messages. All buttons use `el('button', {class, type:'button'})` plus an `addEventListener` → `post`.
- **validateDoc / validateOpenFile**: host-side allowlist validation. Refused messages are dropped.
- **openInEditor → run('vscode.open')**: opens the file in a normal editor tab, logs errors and never throws.
- **Docs watcher**: republishes the rendered doc when the file changes, so the viewer updates live after the user saves.

### Data Flow
Button click (webview) → `post({type:'editDoc'|'openFile', …})` → `panel.handleMessage` → `messages.ts` validation against MessageContext → `dispatch` → `openInEditor(uri)` → `vscode.open` → text editor. The user edits and saves, the watcher fires, `buildDoc` runs again, and the reader re-renders with scroll preserved when the `locationKey` matches.

---

## Dependencies

### Imports (What This Depends On)
- `src/strings.ts` (READER, PROJECT): UI copy
- `src/panel/render.ts` types (`DocRenderPayload`, `DocLocation`)
- `messages.ts` Message union: the webview/host contract
- `media/webview.css`: shared styles and theme tokens

### Consumers (What Depends On This)
- **test/dom/readerDoc.spec.ts**: asserts header focus order, the missing Source button and the message allowlist
- **test/dom/surfaces.spec.ts, themes.spec.ts**: a11y/theme loops over reader payloads
- **test/unit/messages.test.ts**: validation for openFile/openDoc (and editDoc if added)
- **test/unit/manifest.test.ts**: command/menu inventory (only if package.json changes)
- **test/integration/projectMode.test.ts, panel.test.ts**: end-to-end doc open and `vscode.open` spying

**Consumer Count**: about 5 test files, and 1 runtime surface (the reader in doc mode)
**Impact Scope**: Low. The change is additive and limited to the doc-mode header. Artifact mode is untouched.

---

## Test Coverage

### Test Files
- **test/unit/messages.test.ts**: helpers `context()`/`accepted()`/`refused()` L7-30. openSource L71, openFile L76/153/212/228-256, openDoc R9 L336-370. This is the template for `editDoc` accept/refuse cases (non-`.md`, traversal, non-workspace folder).
- **test/dom/readerDoc.spec.ts**: test 1 checks focusables `slice(1,3)` == [back, breadcrumb]. Test 3 clicks every button and asserts no openSource/openArtifact/openTask is posted and there are 0 `READER.openSource` buttons. Test 4 checks that a refused doc shows no Source button. Add a new test: the Edit button exists, is last in the header, and posts the expected message.
- **test/dom/harness.ts**: `openSurface(page,'reader',payload)`, `surface.posted()`, `focusables()`, fixtures `readerDocPayload()` L357. Requires a build first.
- **test/integration/panel.test.ts** L301-338: openFile multi-root with `spyOnCommand('vscode.open')` (test/helpers/tempWorkspace.ts L190-209). This is the best template for an integration test that the Edit button opens `.maister/docs/<rel>`.
- **test/integration/projectMode.test.ts**: `projectHarness()` L40-65 writes INDEX.md, project/vision.md and standards/global/coding-style.md. Doc tests are at L113-200.
- **test/unit/manifest.test.ts** M6 L167-177: affected only if a title-bar entry is added.

### Coverage Assessment
- **Test count**: the relevant suites already cover doc mode well (unit, DOM and integration).
- **Gaps**: nothing tests an Edit button yet, and there is no editDoc validation. The integration flow of "edit → watcher → re-render" is only indirectly covered.

---

## Coding Patterns

### Naming Conventions
- **Functions**: camelCase builders that return elements (`docHeader`, `projectButton`, `sourceButton`)
- **CSS**: short, prefixed classes (`rd-` for the reader, `fb-` for the fallback). Utility classes `.link`, `.action`, `.action-small`, `.dim`
- **Strings**: grouped constant objects per surface (`READER.*`, `PROJECT.*`)
- **Messages**: `{type: 'camelCaseVerb', …}` discriminated union

### Architecture Patterns
- **Style**: functional DOM building via an `el()` helper; no framework
- **State Management**: the host is authoritative and pushes a render payload; the webview is stateless apart from scroll
- **Security**: strict CSP (nonce scripts), command URIs disabled, every webview message validated host-side against an allowlist

---

## Complexity Assessment

| Factor | Value | Level |
|--------|-------|-------|
| File Size | 4-6 files touched (reader.ts 329, strings.ts, webview.css, optional messages.ts/panel.ts) | Medium |
| Dependencies | 3-4 imports in reader.ts | Low |
| Consumers | 1 runtime surface, about 5 test files | Low |
| Test Coverage | Good existing unit/DOM/integration harnesses | Low |

### Overall: Simple
The change adds one button to a single header function. Existing plumbing covers opening the file and the live refresh.

---

## Key Findings

### Strengths
- Opening files in the editor is already implemented, validated and logged, and it never throws.
- The docs watcher gives live re-render after editing for free.
- There are good test templates at every layer.

### Concerns
- The strict readerDoc.spec assertions (focus order, the Source-button count and the forbidden message types) constrain the label, the message type and the DOM position.
- Using `openFile` in doc mode would accept any workspace file, which is looser than needed.
- The README and vision wording say the extension is "read-only" and "rendered, always".

### Opportunities
- Fix the DOM fixture's `docsFolderUri` so it matches the real panel (the workspace folder).

---

## Impact Assessment

- **Primary changes**: `src/webview/reader.ts` (docHeader), `src/strings.ts` (Edit label + aria label), `media/webview.css` (doc header row / right-aligned action)
- **Related changes**: `src/panel/messages.ts` + `src/panel/panel.ts` (optional `editDoc`), `README.md` L84-85 (+ modes table), `CHANGELOG.md` `[Unreleased] ### Added`
- **Test updates**: new cases in readerDoc.spec.ts; messages.test.ts `editDoc` accept/refuse; an integration test in projectMode.test.ts or panel.test.ts spying on `vscode.open`; check surfaces/themes a11y loops still pass

### Risk Level: Low
The change is additive and limited to doc mode. Opening an editor is not trust-gated and cannot corrupt data. Most of the risk is in test churn and documentation wording.

---

## Recommendations

**Modifying existing code, adding a small capability:**
1. **Header layout**: wrap the doc header in a flex row (for example `.rd-doc-head`) that holds the back nav, the crumbs and a right-aligned Edit button (`margin-left:auto`, `.action .action-small`). Keep DOM order back → crumbs → Edit. It must stay readable when it wraps at narrow widths (`flex-wrap`).
2. **Button**: a real `<button type="button">` labelled "Edit", with an aria-label such as "Edit <docRelPath> in text editor", both from `strings.ts`. Follow the `projectButton()` pattern.
3. **Message (preferred)**: add `{type:'editDoc', docsFolderUri, docRelPath}` to the union. Validate it with the same rules as `validateDoc` (extract a shared helper and avoid duplicating logic, per DRY). Dispatch it to `openInEditor(joinPath(docsFolderUri, '.maister/docs', docRelPath))` using the same path that `buildDoc` builds. Minimal alternative: post `openFile` with `'.maister/docs/' + docRelPath`, which needs no protocol change but validates more loosely.
4. **Don't**: add a title-bar command, change artifact mode, or add trust gating (YAGNI and minimal-implementation).
5. **Tests**: add the unit, DOM and integration tests listed above, and run `npm run check`, `npm run test:dom` and `npm run test:integration`.
6. **Docs**: reword README L84-85 to describe the two explicit escape hatches (Open Source File for artifacts, Edit for docs) and note that the extension itself still never writes. Add a CHANGELOG entry.

---

## Next Steps

Invoke gap-analyzer to confirm scope (doc mode only vs. artifacts too), the choice between `editDoc` and `openFile`, and whether the README/vision read-only wording change is acceptable. Then proceed to specification.
