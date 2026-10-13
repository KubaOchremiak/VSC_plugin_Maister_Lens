# Workflow Summary: Edit button on markdown viewer pages

## TL;DR
Every markdown page in the Maister Lens reader now has an **Edit** button at the right end of the header row. It opens the underlying `.md` file in VS Code's text editor, in the same editor group.
- Doc pages (standards, project docs) post a new, strictly validated `editDoc` message.
- `.md` artifact pages reuse `openSource`.

Verification: ✅ Passed (0 critical, 0 warnings). 236/236 tests pass, including `test:min` on VS Code 1.90.0.

## Key Decisions
- The button appears on docs and `.md` artifacts, rendered or refused. Refused `.html` artifacts get none.
- `editDoc` shares the `docTarget` validation with `openDoc`: the folder must be a workspace folder, the path must stay under `.maister/docs`, and only `.md` files are allowed.
- The visible label is "Edit". The accessible name is "Edit <file>", and the tooltip reads "Open <file> in the editor".
- Refused `.md` artifacts keep both the header Edit button and the in-body Source button.
- README and CHANGELOG are updated. vision.md is unchanged.
- Mockups, the spec audit, E2E and user docs were skipped at the user's request.

## Open Questions / Risks
- At release: bump to 0.2.0, put a date on the CHANGELOG heading and run `npm run verify:release`.
- Candidate standard: add a `.prettierrc` (singleQuote, printWidth 100, trailingComma none).
- Follow-up candidate: pin the `test:min` trust suite to VS Code 1.90.0.

## Changed files
- **Source:** src/panel/messages.ts, src/panel/panel.ts, src/strings.ts, src/webview/reader.ts, media/webview.css
- **Tests:** test/unit/messages.test.ts, test/dom/readerDoc.spec.ts, test/dom/surfaces.spec.ts, test/integration/projectMode.test.ts
- **Docs:** README.md, CHANGELOG.md

## Phases
| Phase | Status |
|---|---|
| 1 Codebase analysis | ✅ |
| 2 Gap analysis | ✅ |
| 3 TDD red | skipped (no defect) |
| 4 Mockups | skipped (user) |
| 5 Specification | ✅ |
| 6 Spec audit | skipped (user) |
| 7 Plan | ✅ |
| 8 Implementation | ✅ |
| 9 TDD green | skipped |
| 10 Verification options | ✅ |
| 11 Verification | ✅ Passed (3 runs) |
| 12 E2E | skipped (user) |
| 13 User docs | skipped (user) |
| 14 Finalization | ✅ |

Completed: 2026-10-13T21:53:02Z
