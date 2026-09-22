# Technology Stack

## Overview
This document describes the technology choices and rationale for VSC_Maister_plugin, a VS Code extension currently in early/greenfield setup.

## Languages

### TypeScript (target)
- **Usage**: Not yet implemented — chosen as the intended primary language.
- **Rationale**: Official VS Code Extension API typings and tooling support are strongest with TypeScript, catching integration errors at compile time.
- **Key Features Used**: TBD as implementation begins.

## Frameworks

### Frontend
Not applicable yet — only relevant if webview-based UI panels are added later.

### Backend
VS Code Extension API (Node.js extension host) — to be scaffolded.

### Testing
Not yet selected. `@vscode/test-electron` or `vscode-test` with a test runner (e.g. Mocha) is the conventional choice for VS Code extensions.

## Database
Not applicable — no persistence layer currently planned.

## Build Tools & Package Management
Not yet set up. `npm` with a standard `package.json`, plus `tsc` (or `esbuild`/`webpack`) for bundling, is the conventional setup for VS Code extensions.

## Infrastructure

### Containerization
Not applicable.

### CI/CD
Not yet set up.

### Hosting
Distribution via the VS Code Marketplace (or Open VSX) once packaged with `vsce`.

## Development Tools

### Linting & Formatting
Not yet configured. ESLint + Prettier are the conventional choices.

### Type Checking
TypeScript compiler (`tsc`), once the project is scaffolded.

## Key Dependencies
None yet — project has no `package.json`.

## Version Management
Not yet established (recommend semantic versioning once packaging begins).

## Migration Path
Not applicable — greenfield project.

---
*Last Updated*: 2026-09-22
*Auto-detected*: Nothing (no code exists yet). All entries above are recommended defaults for a new VS Code extension, pending confirmation as development starts.
