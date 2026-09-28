# Production Readiness Report

**Date**: 2026-09-28
**Path**: .maister/tasks/development/2026-09-28-lens-nav-followups-fixes (repo changes per work-log)
**Target**: production (VS Code Marketplace / Open VSX via vsce)
**Status**: Ready

## TL;DR
GO. The manifest changes are consistent: `maister.openRisks` is gone everywhere, and `maister.openFollowUps` is declared, registered in panel.ts, and wired into both menus. A refused `navigate` now logs the reason and shows a warning, so it no longer fails silently. The CHANGELOG records the changes under [Unreleased]. No blockers were found. The only concerns are minor.

## Key Decisions
- Server-style checks (health endpoints, rate limiting, connection pools, CORS) do not apply to a client-side VS Code extension. They are marked N/A and do not count against the scores.
- Changes from the project-docs task (`maister.openProject`, the Project page) are out of scope. They are mentioned only where they share a file with this task.

## Open Questions / Risks
- Removing `maister.openRisks` is a breaking change for any user keybinding that uses it. The impact is low because the version is 0.1.0 and the change is under [Unreleased].

## Executive Summary
- **Recommendation**: GO
- **Overall Readiness**: 95%
- **Deployment Risk**: Low
- **Blockers**: 0  Concerns: 1  Recommendations: 2

## Category Breakdown
| Category | Score | Status |
|----------|-------|--------|
| Configuration (manifest) | 95% | Ready: commands and menus are consistent, no dangling openRisks |
| Monitoring | 100% | Ready: refusals are logged via options.log |
| Resilience | 95% | Ready: refused navigate gives a warning; `void` on the showWarningMessage promise is fine |
| Performance | N/A | No hot-path changes |
| Security | 100% | Ready: navigate still goes through validate(); resolveInside keeps links inside the host folder |
| Deployment | 90% | Ready: CHANGELOG is updated; the command removal is a breaking change |

## Blockers (Must Fix)
None.

## Concerns (Should Fix)
1. **Removed public command id**: `package.json` renames `maister.openRisks` to `maister.openFollowUps`, which breaks existing user keybindings. The Changed entry in CHANGELOG.md already names the new command. Consider adding that the old `maister.openRisks` id was removed.

## Recommendations (Nice to Have)
1. `src/webview/shim.ts` backLink sets an `aria-label` that repeats the visible text. It does no harm but adds nothing, so it can be dropped.
2. The work-log notes that `resolveInside` repeats the scheme regex from relPath.ts. Consider sharing one regex so the security checks cannot drift apart.

## Next Steps
1. Optional: add a line to the CHANGELOG about removing the old command id.
2. Ship.
