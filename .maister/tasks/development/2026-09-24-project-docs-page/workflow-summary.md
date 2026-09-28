# Workflow Summary: Project page

## TL;DR
Maister Lens now has a **Project** page. It opens from a sidebar row below Dashboard.
- **TL;DR block:** the goal comes from vision.md and the tech stack from INDEX.md.
- **Doc shortcuts:** links to every .maister/docs/**/*.md, grouped as INDEX, Project, then Standards by domain.
- **Rendered docs:** docs open in the existing reader, with "← Project" and a "Project › path" breadcrumb. The page refreshes live when docs change.
- **Status:** verification passed with all 9 warnings fixed. 146 tests are green, and E2E ran 7 of 7 scenarios.

## Open Questions / Risks
- vision.md has no Goal section, so the TL;DR shows the Problem Statement paragraph instead.
- No test covers rebuilding watchers when workspace folders change.
- Run `npm run verify:release` before publishing.
- Possible new standard: the repo has no Prettier config, so running `prettier --write` rewrites the code style.

Completed 2026-09-24T09:08:23Z.
