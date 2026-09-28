# Work Log

## 2026-09-24T07:57:50Z - Implementation Started

**Total Steps**: 33
**Task Groups**: 1 Model Layer, 2 Messages & Link Base, 3 Host Panel, 4 Project Webview, 5 Reader Doc Mode, 6 Test Review
**Waves**: W1 = {1, 2}, W2 = {3}, W3 = {4}, W4 = {5}, W5 = {6}

## Standards Reading Log

### Loaded Per Group
(Entries are added as each group runs.)

### Group 1: Model Layer
**From Plan:** global/minimal-implementation.md, coding-style.md, commenting.md, error-handling.md

### Group 2: Messages & Link Base
**From Plan:** global/validation.md, minimal-implementation.md, coding-style.md, error-handling.md

## 2026-09-24T08:01:35Z - Wave 1 Complete (Groups 1, 2)

**Group 1:**
- Added parseProjectIndex, groupDocs and humanizeDocName in src/model/parseProjectDocs.ts, plus the PROJECT strings.
- Tests: 5 new, and the related tests pass (9).

**Group 2:**
- Added openProject and openDoc to messages.ts. docsFolderUri must match a workspace folder exactly; paths must be contained and end in .md; anchors must match ANCHOR.
- Generalised RenderTarget with kind and baseRelPath, and added DocRenderPayload and ReaderPayload.
- Made a minimal compile fix in panel.ts.
- Tests: 61 unit tests pass, and typecheck and lint pass.

**Notes:**
- Group 2 wrote its tests after the code, not before as the plan requires.
- workspaceFolderUris is optional, so openDoc is refused until Group 3 passes it in.
- There is no Prettier config, so running prettier --write rewrites the quote style. Both groups hit this.

### Group 3: Host Panel
**From Plan:** global/minimal-implementation, coding-style, error-handling, validation, conventions; frontend/accessibility

## 2026-09-24T08:05:37Z - Wave 2 Complete (Group 3)
- **What changed:** added project and doc modes to panel.ts, PROJECT_NODE (book icon), a hidden maister.openProject, a docs watcher per folder (200ms debounce), and the ProjectPayload type stub in src/webview/projectMode.ts.
- **Tests:** 62 unit tests pass, and 9 integration tests pass (navTree and projectMode).
- **Deviations:** doc discovery uses readDirectory instead of findFiles, because it works with the panel's folders test seam. test/integration/index.ts was also edited (projectMode added to SUITES), which is a small scope addition.

### Group 4: Project Webview
**From Plan:** frontend/components, css, accessibility, responsive; global/minimal-implementation, coding-style

## 2026-09-24T08:07:49Z - Wave 3 Complete (Group 4)
- **Delivered:** the projectMode bundle, with the TL;DR as plain text and no chips, groups ordered by the payload, a multi-root partial state, and an empty state. The surface inventory is now six.
- **Tests:** 13 DOM tests pass, and tsc and eslint are clean.
- **Minor deviations from the mockup:**
  - The TL;DR has no "Source" label row; each field has its own source link instead.
  - The empty state has no bold title; the copy comes from PROJECT.empty.

### Group 5: Reader Doc Mode
**From Plan:** frontend/accessibility, components; global/minimal-implementation, coding-style, validation. **Found in INDEX.md:** global/commenting

## 2026-09-24T08:09:50Z - Wave 4 Complete (Group 5)
- **Reader doc branch:**
  - "← Project" back control, styled like "← Dashboard".
  - Breadcrumb reads "Project › path".
  - openDoc link routing with anchor split.
  - No Source button.
- **Tests:** 29/29 in the full DOM suite.

### Group 6: Test Review
**From Plan:** global/conventions, minimal-implementation

## 2026-09-24T08:11:07Z - Implementation Complete
**Total Steps:** 33 of 33
**Test Suite:**
- `npm run check`: 62 passing, lint and typecheck clean
- DOM: 29 passing
- Integration: 47 passing (trusted), with trust.test.ts 1 passing (untrusted)

**Notes:**
- Group 6 added 2 tests: cross-folder isolation and the resourceRoots limit.
- The watcherExclude guard has no test.

## 2026-09-24T08:45:30Z - Verification Fixes Applied
All 9 warnings are fixed:
- **TL;DR parsing:** keeps only the first paragraph and stops at a thematic break.
- **Goal:** now comes from vision.md, with INDEX.md as the fallback.
- **Docs watchers:** one debounce per folder, and watchers are rebuilt when workspace folders change.
- **Exclude guard:** dropped.
- **DocRenderPayload:** the duplicate fields are gone.
- **Docs:** CHANGELOG and README entries added.
- **Cleanups:** a dedicated docUnreadable log string, and the dead openFile branch removed.

**Tests:** check 67, DOM 29, integration 47 plus 1, all passing.

## 2026-09-24T09:08:23Z - E2E Fixes and Finalization
- **Missing note** now names the missing field.
- **Acronyms** stay uppercase (CSS, API, etc.).
- **Inline-code backticks** are stripped from the TL;DR.
- **Tests:** check 68, DOM 30, integration 47+1 — all green.
