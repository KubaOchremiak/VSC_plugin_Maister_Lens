# Clarifications (Phase 1)

## TL;DR
Build the full spec (AC1–AC18) in this run. Tests are mocha unit plus @vscode/test-electron integration, with AC7/AC9 perf as a scripted benchmark.
Claude Code launch uses `claude-vscode.editor.open`, then the `vscode://anthropic.claude-code/open?prompt=` URI, then the rest of targetOrder.
package.json uses the placeholder publisher `maister` and the MIT license.

## Key Decisions
- Scope: full feature-spec.md, AC1–AC18 — user chose the complete build over a core slice.
- Testing: unit (mocha, no host) + integration (@vscode/test-electron); perf targets measured by a benchmark script, not CI gates — keeps the suite fast while still measuring AC7/AC9.
- Claude Code launch: command first, URI fallback, then next target — gives some protection against the undocumented signature changing.
- Packaging: publisher placeholder "maister", MIT license — easy to change before vsce publish.

## Q&A
1. **Build scope?** → Full spec, AC1–AC18.
2. **Test strategy?** → Unit + integration; perf as a scripted benchmark.
3. **Claude Code API dependency?** → Command + URI fallback.
4. **Publisher/license?** → Placeholder `maister`, MIT.
