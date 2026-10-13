# Code Review Report

## TL;DR
- The review found no critical issues and no warnings, only 5 informational items.
- `editDoc` uses the same `docTarget` validation as `openDoc`:
  - the workspace folder must match one of the open folders exactly;
  - the path goes through `resolveInside` → `containedRelPath`;
  - the file must end in `.md`.
  - I found no way to break out of `.maister/docs`.
- Artifact Edit reuses `openSource`, which is already validated. The CSP is unchanged, and no new `innerHTML` sinks were added.
- The remaining findings are small UX and accessibility polish.

## Key Decisions
- **One `docTarget` helper serves both `openDoc` and `editDoc`.** The refusal reason names the message type.
- **`editDoc` is its own message, not a flag on `openDoc`.** It carries only the protocol fields and drops extras such as `anchor`.
- **Artifacts reuse `openSource`.** No new message was needed there.
- **`editDoc` is allowed in untrusted workspaces.** It only opens a text editor, and Restricted Mode already governs what happens there.

## Open Questions / Risks
- **Editor associations.** `vscode.open` respects `workbench.editorAssociations`, so if `*.md` is mapped to the preview, Edit opens the preview. `openSource` already behaves this way.
- **Symlinks.** A symlink inside `.maister/docs` that points outside the workspace would still open, because the containment check compares paths as text and does not resolve them. This was already true for `openDoc`, so the risk is low.

**Date**: 2026-09-29
**Scope**: the uncommitted `git diff` (11 files), reviewed for quality, security, performance and best practices.
**Status**: Clean.

Note: the orchestrator saved this report from the code-reviewer's returned output.

## Summary
- Critical: 0
- Warnings: 0
- Info: 5

## Informational

1. **Refused artifact pages show two buttons that do the same thing** (src/webview/reader.ts:199, reader.ts:226-237). The header Edit button and the in-body "Open source file" button both post `openSource`. This is intentional per a user decision and is covered by tests. Fixable.
2. **Edit appears on refused `.html` artifact pages** (src/panel/panel.ts:1204-1206, src/webview/reader.ts:227-236). The tooltip reads "Open x.html in the editor", while the docs say "every markdown page". Either render Edit only when the path matches `/\.md$/i`, or adjust the docs. Fixable.
3. **The accessible name is just "Edit"** (src/webview/reader.ts:186-195). The file name appears only in `title`. A `hidden()` sr-only file name could be added. Optional. Fixable.
4. **The docs-root URI join is now repeated in a third place** (src/panel/panel.ts:633-640, vs L1383 and L1570). A `docsRootUri(docsFolderUri)` helper would remove the repetition. Optional. Fixable.
5. **README no longer says "read-only"** (README.md:12-13). Check that vision.md's "read-only view layer" still agrees with it. Fixable.

## Security checklist
- **Path traversal:**
  - `containedRelPath` rejects `..` segments.
  - `resolveInside` decodes first, so `%2e%2e` is rejected (tested).
  - The workspace folder is checked by exact match.
  - The join under `.maister/docs` happens on the host side.
- **Message allowlist:** `editDoc` is in the `validate` switch and returns a freshly built object. A non-string path or a non-`.md` file is refused (tested at both unit and integration level).
- **XSS/CSP:** the file name is set with `setAttribute('title')`. The CSP and nonce are unchanged.
- **Error handling:** `openInEditor` → `run()` logs errors and never throws.

## Performance
No new I/O, loops or watchers.

## Metrics
- Max new function length: about 25 lines.
- Max nesting depth: 2.
- Vulnerabilities: 0.
- Tests covering the change: 5 unit, 2 integration, 8 DOM.

## Prioritized Recommendations
1. Hide Edit for non-`.md` artifacts, or reword the docs (Info 2).
2. Decide whether the in-body Source button is still needed on refused artifacts (Info 1).
3. Optional: add an sr-only file name to the Edit button (Info 3).
4. Optional: add a `docsRootUri` helper (Info 4).
