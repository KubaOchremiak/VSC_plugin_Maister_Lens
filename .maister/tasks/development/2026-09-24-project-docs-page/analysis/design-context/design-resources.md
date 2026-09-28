# Design Resources

## TL;DR
The mockups follow the frontend standards and the styling in `media/webview.css`, which uses only `--vscode-*` variables.

- **Standards:** `.maister/docs/standards/frontend/{components,css,accessibility,responsive}.md`
- **Design system:** css-var `media/webview.css`. The mockups reuse its classes `.summary-card/.summary-label/.summary-value`, `.list`, `.group-header`, `.trow/.trow-title/.trow-description`, `.link`, `.empty`, `.rd-crumbs`, `.rd-summary`.
- **Components:** `src/webview/components.ts` (`el`, `row`, `summaryCard`, `chip`). Icons are VS Code codicons as ThemeIcons (`dashboard`, `book`).
- **Skill hints:** none relevant.
