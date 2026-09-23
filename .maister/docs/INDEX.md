# Documentation Index

**IMPORTANT**: Read this file at the beginning of any development task to understand available documentation and standards.

## Quick Reference

### Project Documentation
Project-level documentation covering vision and technology choices. Both were corrected at the finalization of the Maister Lens implementation. Roadmap and architecture docs were not selected for this init run.

### Technical Standards
Coding standards, conventions, and best practices organized by domain. Global and Frontend standards are initialized; Backend and Testing are not yet initialized for this project.

---

## Project Documentation

Located in `.maister/docs/project/`

#### Vision (`project/vision.md`)
Problem statement, target users and key features for VSC_Maister_plugin, whose first shipped extension is Maister Lens — a read-only view layer over Maister tasks and artifacts in VS Code. Carries the four success criteria (live answer in the editor, always rendered, recall in seconds, honest state) and records that repository/git-change browsing is out of scope — git is used only for attribution. Differentiators are still to be defined.

#### Tech Stack (`project/tech-stack.md`)
Technology choices as shipped: TypeScript on the VS Code Extension API, webview-based UI bundles, esbuild + tsc build, workspace-storage persistence of the task index, exactly two runtime dependencies (`yaml`, `markdown-it`), the four test harnesses (mocha, `@vscode/test-electron`, Playwright DOM, benchmark), ESLint 9 + Prettier, and Marketplace/Open VSX distribution via `vsce`.

*Not initialized for this project: roadmap.md, architecture.md. Add them later via the docs-manager skill or by re-running the relevant init step.*

---

## Technical Standards

### Global Standards

Located in `.maister/docs/standards/global/`

#### Coding Style (`standards/global/coding-style.md`)
Naming consistency, automatic formatting, descriptive names, focused functions, uniform indentation, no dead code, no backward compatibility unless required, DRY.

#### Commenting (`standards/global/commenting.md`)
Let code speak for itself, comment sparingly, no change comments.

#### Development Conventions (`standards/global/conventions.md`)
Predictable structure, up-to-date documentation, clean version control, environment variables, minimal dependencies, consistent reviews, testing standards, feature flags, changelog updates, build what's needed.

#### Error Handling (`standards/global/error-handling.md`)
Clear user messages, fail fast, typed exceptions, centralized handling, graceful degradation, retry with backoff, resource cleanup.

#### Minimal Implementation (`standards/global/minimal-implementation.md`)
Build what you need, clear purpose, delete exploration artifacts, no future stubs, no speculative abstractions, review before commit, unused code is debt.

#### Validation (`standards/global/validation.md`)
Server-side always, client-side for feedback, validate early, specific errors, allowlists over blocklists, type and format checks, input sanitization, business rules, consistent enforcement.

### Frontend Standards

Located in `.maister/docs/standards/frontend/`

#### Accessibility (`standards/frontend/accessibility.md`)
Semantic HTML, keyboard navigation, color contrast, alt text and labels, screen reader testing, ARIA when needed, heading structure, focus management.

#### Components (`standards/frontend/components.md`)
Single responsibility, reusability, composability, clear interface, encapsulation, consistent naming, local state, minimal props, documentation.

#### CSS (`standards/frontend/css.md`)
Consistent methodology, work with the framework, design tokens, minimize custom CSS, production optimization.

#### Responsive Design (`standards/frontend/responsive.md`)
Mobile-first, standard breakpoints, fluid layouts, relative units, cross-device testing, touch-friendly, mobile performance, readable typography, content priority.

### Backend Standards

*Not initialized for this project. If you need backend standards, you can:*
- *Add them manually using the docs-manager skill*
- *Run `/maister:standards-discover --scope=backend` to auto-discover*

### Testing Standards

*Not initialized for this project. If you need testing standards, you can:*
- *Add them manually using the docs-manager skill*
- *Run `/maister:standards-discover --scope=testing` to auto-discover*

---

## How to Use This Documentation

1. **Start Here**: Always read this INDEX.md first to understand what documentation exists
2. **Project Context**: Read relevant project documentation before starting work
3. **Standards**: This index only points to the standards — open and follow the specific standard files relevant to your task; don't rely on the index alone
4. **Keep Updated**: Update documentation when making significant changes
5. **Customize**: Adapt all documentation to your project's specific needs

## Updating Documentation

- Project documentation should be updated when goals, tech stack, or architecture changes
- Technical standards should be updated when team conventions evolve
- Always update INDEX.md when adding, removing, or significantly changing documentation
