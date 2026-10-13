# Scope Clarifications (Phase 2)

## TL;DR
Doc pages post a new strict `editDoc` message; artifact pages reuse `openSource`. Refused pages keep the in-body source button alongside the header Edit. vision.md unchanged. Text-only "Edit" button.

## Key Decisions
- Doc message: new `editDoc {docsFolderUri, docRelPath}` validated with the shared validateDoc rules — allowlist, .md under .maister/docs only.
- Refused pages: keep both header Edit and in-body "Open source file" button — user choice (duplicate accepted).
- vision.md: leave unchanged — Edit is an explicit hand-off, criterion still holds.
- Button style: text-only "Edit" (.action .action-small) — no icon assets/CSP work.
