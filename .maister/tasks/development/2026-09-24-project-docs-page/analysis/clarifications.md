# Clarifications (Phase 1)

## TL;DR
The TL;DR comes from INDEX.md. All docs are listed with live refresh, and links follow the reader's existing rules.

## Key Decisions
- **TL;DR source:** the user pointed to `.maister/docs/INDEX.md`. Its Project Documentation entries (`#### Vision (project/vision.md)`, `#### Tech Stack (project/tech-stack.md)`) are generated descriptions. They provide the project goal (the Vision paragraph) and the key tech stack (the Tech Stack paragraph).
- **Scope:** list every `.maister/docs/**/*.md`, including INDEX.md, grouped by folder.
- **Live refresh:** watch `.maister/docs/**` and re-publish the Project page or the open doc when files change.
- **Links:** use the reader's existing rules. Links to other docs open in the rendered view, links into an indexed task open the artifact, external links open in the browser, and other files open in the editor.

## Open Questions / Risks
- If INDEX.md is missing or its format changes, the page must show an honest empty or partial state.
