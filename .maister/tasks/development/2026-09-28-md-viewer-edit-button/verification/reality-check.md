# Reality Check: Edit button on markdown reader pages

## TL;DR
- **Status: Ready. Decision: GO** (re-verification cycle 3). The feature still does what the user asked for: on a standards or project doc page, the "Edit" button at the top right opens the real `.maister/docs/<path>.md` file in VS Code's text editor.
- The `openSourceMessage(payload)` helper in `src/webview/reader.ts:175` returns exactly `{type:'openSource', folderUri: payload.folderUri, artifactRelPath: payload.location.artifactRelPath}`. This is the same object literal that `sourceButton` used inline before. The refactor changes no behavior.
- The doc chain (Project → openDoc → render `location` → editDoc → `vscode.open`) is unchanged and is still covered end to end by the round-trip integration test. Removing the direct editDoc test leaves no gap, because the round trip covers more than it did.
- spec.md and spec.html agree with the code. Test results come from `test-suite-results.md`: 236/236 passing. They were not re-run here.

## Key Decisions
- Artifact Edit and the in-body Source button share one message builder, so both post the same `openSource` payload, which AC5 requires.
- The removed direct editDoc integration test was a subset of the round-trip test, which goes through the real `validate` in `handleMessage` and asserts the fsPath. The refusal path is still covered by "opens nothing for a refused editDoc" and by the unit tests in `test/unit/messages.test.ts`.
- `.md` gating, the sr-only file name, and `editDoc` validation through the shared `docTarget` have not changed since the prior GO.

## Open Questions / Risks
- The DOM test for artifact Edit (`test/dom/surfaces.spec.ts:358-369`) uses `toContainEqual`. That still checks the exact message shape, including that it has no extra fields, but it would not catch an extra second post. Low risk.
- From earlier cycles, still open: no assertion checks the button's top-right position, the `DOCS` fixture uses a docs-dir URI, and the untrusted-host suite is not pinned to VS Code 1.90 in `test:min`. That last one predates this task.

## Re-verification (cycle 3: changes since prior GO)
| Change | Evidence | Result |
|---|---|---|
| `openSourceMessage(payload)` helper | `src/webview/reader.ts:175-181`. `sourceButton` (`:183-187`) and artifact Edit (`:233`) both call it. The diff shows the removed inline literal had the same three fields from the same sources. | Exact `{type:'openSource', folderUri, artifactRelPath}`. No behavior change. |
| Host acceptance of that message | `src/panel/messages.ts:394-413`: indexed folder, string path, `resolveInside`. Dispatch at `src/panel/panel.ts:646-649` calls `openInEditor(joinPath(parse(folderUri), artifactRelPath))`. | Unchanged |
| Direct editDoc integration test removed | `test/integration/projectMode.test.ts:140-169` (round trip) and `:171` (refused) still exist and pass on 1.138.0 and 1.90.0 | Coverage kept |
| spec.md/spec.html amended | spec.md R5 (`:49`) names the same fields as the helper. The test plan (`:128-136`) lists only the round-trip and refused integration tests. Known risk `:20` documents the fixture URI. | Spec matches the code |

## Chain verification (doc path, re-traced)
| Step | Location | Result |
|---|---|---|
| Edit post | `reader.ts:221-227` `editButton(docRelPath, {type:'editDoc', docsFolderUri, docRelPath})` from `payload.location` | Same as before |
| Validate | `messages.ts:243-277` `docTarget('editDoc', …)` requires a workspace folder, a path inside it, and a `.md` file | Same as before |
| Dispatch | `panel.ts:637-640` `openInEditor(joinPath(docsRootUri(docsFolderUri), docRelPath))` | Opens the real file |
| End-to-end proof | Round-trip test asserts fsPath `<ws>/.maister/docs/project/vision.md` | Passing (236/236 suite) |

## Findings
| # | Severity | Location | Finding | Fixable |
|---|---|---|---|---|
| 1 | info | `test/dom/surfaces.spec.ts:363` | `toContainEqual` checks the exact message shape but not that only one message was posted. Optional tightening. | yes |
| 2 | info | `test/dom/readerDoc.spec.ts`, `test/dom/surfaces.spec.ts` | No assertion of the top-right position or of the exact visible text "Edit". Carried over. | yes |
| 3 | info | `test/dom/readerDoc.spec.ts:7` | `DOCS` fixture is a docs-dir URI. This is documented in the spec and offset by the integration round trip. Carried over. | yes |
| 4 | info | `test/runIntegration.ts` | The untrusted-host suite is not pinned to VS Code 1.90 in `test:min`. Predates this task. | yes (out of scope) |

## Functional completeness
About 100% of the request. There are no critical or warning gaps. The cycle 3 changes are a pure refactor, a removed redundant test and spec alignment. None of them changes what the user sees or the path from reviewing a standards or project doc to editing it.
