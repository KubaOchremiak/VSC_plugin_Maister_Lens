# Scope Clarifications (Phase 2)

## TL;DR
All 13 decisions the gap analysis raised are resolved. Tasks are keyed on folderUri; the spec step writes one consolidated webview message table with Risks filtering local to the webview.
AC13 is reinterpreted: Maister's own phase names are fixed input and exempt; the rule applies to Maister Lens's own strings, kept in one module a test scans.
Task-argument launch commands are hidden from the Command Palette. Scope is not expanded: full spec, no status-bar item.

## Key Decisions
- C-1 Task identity: key index, persisted index, panel history and messages on folderUri; relPath only for display and composed commands — matches § 2.1 and avoids multi-root collisions.
- C-2 Message protocol: one consolidated table covering all modes, doubling as the security allowlist; Risks-mode filtering happens in the webview over the full risks payload, with the type facet reusing setFilter.
- I-1 Palette: task-argument commands (Resume, Start development, …) are hidden from the Command Palette; they are reachable only from ▶ buttons in the tree, Overview, task view and dashboard rows.
- I-2 Open risks: one shared function (unresolved state risks + artifact § 7 risks, deduplicated) feeds the Now row, the Dashboard KPI and Risks mode, so counts match what a click opens.
- I-3 AC13: Maister is constant, so its phase names ("Running E2E tests") are displayed verbatim and exempt. Maister Lens's own user-facing strings live in one module, and a unit test scans that module for running/waiting/stalled/abandoned.
- I-4 No status-bar item — the view badge already carries the count and no AC covers it.
- I-5 Now tree nests artifacts under a "Recent artifacts" group node, as the approved mockup draws it.
- I-6 Integration tests run on a downloaded pinned stable VS Code, with an optional run against 1.90.0 to check the engine floor. AC11 Claude pre-fill stays a manual check.
- I-7 skip_test_suite set to false so verification runs the suites covering the ACs.
- I-8 At finalization: correct tech-stack.md and vision.md, write a real README and CHANGELOG, and propose the § 8.6 testing standards via /maister:standards-update.
- I-9 Add .gitignore (node_modules, dist, *.vsix, .vscode-test/, .playwright-mcp/) and untrack the stray console log.
- I-10 Claude Code URI fallback is used only when the extension is installed but the command is missing or throws, built from env.uriScheme, and treated as success.
- I-11 Fixtures: commit snapshots of the two real tasks plus hand-written hazard fixtures; generate the 300-task perf set and the two-author git repo into temp dirs at run time.

## Open Questions / Risks
- The Copilot availability check is weak: VS Code 1.138 registers workbench.action.chat.open even when chat cannot answer, so a one-time caveat notice is the only mitigation.
- Claude Code's editor.open ignores the prompt when that session is already open, and the signature is undocumented (observed in 2.1.278).
- Resume is composed as `/maister:work {relPath}` per spec § 7.1, § 7.2 and AC12 — not the `/maister:<type>` form the codebase analysis mentioned.
- The mockups still name a "Browse" surface that was merged into Overview; the spec wins.
