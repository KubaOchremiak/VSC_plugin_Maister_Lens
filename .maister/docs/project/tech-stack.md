# Technology Stack

## Overview
This document describes the technology choices and rationale for VSC_Maister_plugin, whose first
shipped extension is **Maister Lens** — a read-only view layer over Maister tasks and artifacts
inside VS Code.

## Languages

### TypeScript
- **Usage**: The entire extension — extension host (`src/model`, `src/index`, `src/views`,
  `src/panel`, `src/launch`) and the browser-side webview bundles (`src/webview`).
- **Rationale**: Official VS Code Extension API typings catch integration errors at compile time.
  `@types/vscode` is pinned to `~1.90.0` so the typecheck also proves the declared engine floor.
- **Key Features Used**: Discriminated unions for parsed state and panel locations, strict null
  checks, and a `vscode`-free core so pure logic is unit-testable without a host.

## Frameworks

### Frontend
**VS Code webviews.** Five bundles (`overview`, `dashboardMode`, `risksMode`, `fallbackTask`,
`reader`) plus a `shim` that hosts Maister's own `dashboard.html`. No UI framework and no chart
library: the surfaces are built from a small shared primitives module and hand-written SVG.
Styling uses `--vscode-*` theme variables exclusively — no custom palette.

### Backend
VS Code Extension API (Node.js extension host). `"extensionKind": ["workspace"]`;
`"virtualWorkspaces": false`. Workspace Trust is declared as `limited` — untrusted workspaces run
no model-authored HTML and expose no launch commands.

### Testing
Four harnesses, each running only what it can actually assert:
- **mocha** for unit tests of the host-free core (`npm test`).
- **`@vscode/test-electron`** for integration tests in a real host (`npm run test:integration`),
  with an engine-floor run on VS Code 1.90.0 (`npm run test:min`).
- **Playwright** (`@playwright/test`, chromium only) for structural DOM assertions over each
  webview bundle's generated HTML (`npm run test:dom`).
- A non-gating **benchmark** over 300 generated task folders (`npm run bench`).
Criteria no harness reaches are a signed manual checklist.

## Database
No database. Persistence is the extension's own **workspace storage**: the task index is
serialised to a versioned snapshot under the extension's storage URI so a warm start renders
without re-reading the workspace. A corrupt or version-mismatched snapshot is silently rebuilt.

## Build Tools & Package Management
`npm` with `package.json`. **esbuild** (`esbuild.mjs`) bundles the extension host entry point and
the webview bundles into `dist/`; `tsc -p tsconfig.json` is used for typechecking and for
compiling the integration/benchmark harnesses into `out/`.

## Infrastructure

### Containerization
Not applicable.

### CI/CD
Not yet set up.

### Hosting
Distribution via the VS Code Marketplace (or Open VSX) once packaged with `vsce`
(`@vscode/vsce` is a dev dependency). `publisher` is currently the placeholder `maister` and must
be changed before publishing.

## Development Tools

### Linting & Formatting
**ESLint 9** with `typescript-eslint` (flat config, `eslint.config.mjs`) over `src` and `test`;
**Prettier** for formatting.

### Type Checking
TypeScript compiler (`tsc`), run as part of the integration, engine-floor and benchmark scripts.

## Key Dependencies

**Runtime — exactly two, both load-bearing:**

| Dependency | Why |
|---|---|
| `yaml` | Maister's state files are YAML, including flow mappings and multi-line scalars. The alternative was hand-rolling a tolerant parser. |
| `markdown-it` | CommonMark + GFM tables for the artifact reader. Configured `html: false`, which escapes raw HTML — this *is* the sanitization strategy, so no sanitizer dependency is needed. |

**Notable dev dependencies:** `esbuild`, `typescript`, `mocha`, `@vscode/test-electron`,
`@playwright/test`, `eslint` / `typescript-eslint`, `prettier`, `@vscode/vsce`.

Deliberately not taken on: a UI framework, a chart library, an HTML sanitizer, a syntax
highlighter, and any abstraction layer over the VS Code API.

## Version Management
Semantic versioning; `CHANGELOG.md` carries an entry per release. Extension version `0.1.0`;
engine floor `^1.90.0`; developed on Node v26.7.0.

## Migration Path
Not applicable — greenfield project.

---
*Last Updated*: 2026-09-23
*Source*: Corrected at the finalization of the Maister Lens implementation (spec amendment A11)
against the shipped `package.json` and `src/` tree. Entries above describe what exists, not
recommended defaults.
