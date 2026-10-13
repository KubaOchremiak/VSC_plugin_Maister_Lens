# Clarifications (Phase 1)

## TL;DR
Edit button goes on every markdown viewer page (docs + task artifacts), opens the .md in the same editor group via the existing vscode.open path, and README/CHANGELOG get updated to describe it as an explicit hand-off.

## Key Decisions
- Scope: docs + artifacts — consistent top-right Edit button on every markdown page.
- Open location: same editor group (existing `vscode.open` behaviour); viewer live-refreshes after save.
- Docs: update README read-only / "one explicit way" wording and add CHANGELOG entry.

## Q&A
1. Which pages? → Docs + artifacts (Recommended).
2. Where should the editor open? → Same editor group (Recommended).
3. Update README wording? → Yes, update README (Recommended).
