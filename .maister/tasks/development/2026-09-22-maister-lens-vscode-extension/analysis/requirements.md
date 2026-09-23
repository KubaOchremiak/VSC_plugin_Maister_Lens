# Requirements (Phase 5)

## TL;DR
The requirements are feature-spec.md (§§ 1–8, AC1–AC18) as written, amended by the 13 Phase-2 decisions and the four Phase-1 clarifications.
Journey: activity-bar icon → Now on top (Marek), Overview below (Ada), Dashboard and Risks from the Overview title bar (Irena).
Reuse: spec § 1.4 layout, Maister's dashboard.html hosted verbatim, runtime dependencies limited to yaml and markdown-it, charts hand-written as SVG.
E2E later verifies generated webview HTML in a browser against the approved mockups; extension-host behaviour is covered by the integration suite.

## Key Decisions
- Now is the landing surface, Overview second — matches the personas and the approved sidebar mockup.
- No chart library and no native re-implementation of Maister's dashboard — the two-dependency rule and "show Maister's UI unmodified" both hold.
- E2E = Playwright over generated webview HTML with fixture data, compared to the mockups; runtime host behaviour stays in @vscode/test-electron.

## Initial description
Implement the Maister Lens VS Code extension as designed in `.maister/tasks/product-design/2026-09-22-maister-viewer-vscode-plugin`: sidebar Now tree + Overview webview, a reusable panel with Task / Artifact / Dashboard / Risks modes, a persisted two-tier index over `.maister/tasks/*/*/orchestrator-state.yml`, and task-contextual next actions launched to Claude Code → Copilot Chat → terminal → clipboard.

## Q&A

### Phase 1
1. **Build scope?** Full spec, AC1–AC18, in this run.
2. **Test strategy?** mocha unit tests (no host) + `@vscode/test-electron` integration; AC7/AC9 performance measured by a benchmark script rather than enforced as CI gates.
3. **Claude Code dependency?** `claude-vscode.editor.open` first, then the `vscode://…/open?prompt=` URI, then the next target.
4. **Publisher/license?** Placeholder publisher `maister`, MIT.

### Phase 2 (gap decisions)
See `analysis/scope-clarifications.md` for all 13 with rationale. Binding summary: folderUri identity; one consolidated webview message table with Risks filtering in the webview; task-argument commands hidden from the Command Palette; one shared open-risks definition; AC13 scoped to Maister Lens's own strings with Maister's phase names shown verbatim; no status-bar item; "Recent artifacts" group node in the tree; integration tests on a downloaded pinned stable VS Code plus an optional 1.90.0 run; `skip_test_suite: false`; project docs, README, CHANGELOG and testing standards updated at finalization; `.gitignore` added and the stray log untracked; the Claude URI fallback gated on extension presence and built from `env.uriScheme`; perf and git fixtures generated at run time.

### Phase 5
5. **User journey?** Activity-bar icon; Now on top, Overview below; Dashboard and Risks from the Overview title bar. Personas: Marek → Now, Ada → Overview → reader, Irena → Dashboard and Risks.
6. **Existing code reuse?** No code exists. Follow spec § 1.4 (plus `src/webview/risksMode.ts`); host Maister's `dashboard.html` unmodified; take the webview CSP pattern from existing extensions; runtime dependencies stay `yaml` + `markdown-it`; the four Dashboard charts are hand-written SVG.
7. **Visual assets?** Six approved mockups in `analysis/design-context/mockups/`, inventoried in `analysis/design-context/INDEX.md`. Binding for layout, copy, field order and states. Their `/screen/*` links are preview-server leftovers and are not navigable. The mockups' "Browse" wording is stale — Browse was merged into Overview.
8. **E2E approach?** Playwright renders generated webview HTML against fixture data and compares it to the mockups.

## Functional requirements summary
feature-spec.md §§ 1–8 in full: manifest and toolchain (§ 1), data model and tolerant parsing rules N1–N15 (§ 2), index, watcher and attribution (§ 3), Now tree and Overview (§ 4), panel modes Task / Artifact / Dashboard / Risks with hosted-HTML rules (§ 5), rendering and link handling (§ 6), next actions and launch targets (§ 7), non-functional targets, security, tests and AC1–AC18 (§ 8).

## Reusability opportunities
- Maister's `dashboard.html` (hosted, not reimplemented) and its `HERO_MAP` artifact lists per workflow type.
- The two real task folders in this repo as test fixtures, including this task's own state file as a real-data fixture for rule N9 (`phase_summaries.clarifications` stored as a list).
- Shared webview primitives — tile, row, summary card, chip — reused across Overview, Dashboard, Risks and the fallback task view.
- VS Code theme variables as the only design tokens.

## Scope boundaries
**In**: everything in feature-spec.md §§ 1–8 and AC1–AC18.
**Out**: repository/git change browsing (git is used only for authorship); full-text artifact search; a status-bar item; Quick Pick task selection; writing to any Maister file; charting or sanitizer libraries.

## Technical considerations
- Parsing must tolerate schema drift across workflow types and plugin versions and must never throw.
- `dashboard-data.js` is sometimes a JS object literal, so the extension host never parses or evaluates it; it loads inside the webview sandbox.
- Webview messages are validated in the host against the consolidated allowlist: type, shape, index membership, path containment.
- Untrusted workspaces run no hosted HTML and expose no launch commands.
- Node 26 is new; esbuild, mocha and `@vscode/test-electron` need a compatibility check early.
