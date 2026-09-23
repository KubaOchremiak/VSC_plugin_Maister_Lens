# Design Resources — Maister Lens mockups

## TL;DR
The project has four frontend standards (accessibility, components, CSS, responsive) but no code, so there's no in-repo design system.
The real design language is **VS Code's own theme**: mockups define the `--vscode-*` CSS custom properties with Dark+ values and style everything through them, just as the shipped webviews will.
No design skill or MCP was consulted. The mockups follow VS Code's native patterns: tree rows, codicon-style glyphs, editor-title actions and the selection prompt.

## Key Decisions
- VS Code theme variables are treated as the design tokens (CSS standard: "Design Tokens", "Work With the Framework").
- The mockups pair status with text everywhere and show visible focus rings (accessibility standard: "don't rely solely on color", "visible focus indicators").

---

## Tier 1 — Project standards (binding)
| Path | Topic | Rules applied to mockups |
|---|---|---|
| `.maister/docs/standards/frontend/accessibility.md` | a11y | Semantic elements (`nav`, `main`, `aside`, `button`, tables with `th`); visible focus; 4.5:1 contrast; status never by color alone; ordered headings |
| `.maister/docs/standards/frontend/components.md` | components | Reusable pieces across screens: tile, tree row, summary card and chip look identical wherever they appear |
| `.maister/docs/standards/frontend/css.md` | css | One token set (`--vscode-*`); no ad-hoc colors outside it |
| `.maister/docs/standards/frontend/responsive.md` | responsive | Overview is designed for 250–400 px sidebar widths; tiles wrap fluidly; relative units |

## Tier 2 — Codebase design system
None. The project is greenfield, with no `package.json`, theme, tokens or component library. **Substitute:** VS Code's workbench theme variables (`--vscode-editor-background`, `--vscode-sideBar-background`, `--vscode-list-*`, `--vscode-button-*`, `--vscode-input-*`, `--vscode-badge-*`, `--vscode-focusBorder`, `--vscode-textLink-foreground`, `--vscode-charts-*`, `--vscode-errorForeground`) with Dark+ default values, plus codicon-equivalent glyphs.

## Tier 3 — Available skills / agents / MCP tools
| Kind | Name | Why |
|---|---|---|
| skill | `artifact-design` | Design guidance for web artifacts. Not consulted: the mockups imitate VS Code's native look, not an artifact page. |
| skill | `dataviz` | Chart guidance. Not needed, since the spec forbids charts and throughput metrics in v1. |
| agent | `maister:ascii-mockup-generator` | ASCII fallback. Not needed, because Node is available. |
| mcp-tool | `plugin_maister_playwright` | Browser opening for the visual companion |
