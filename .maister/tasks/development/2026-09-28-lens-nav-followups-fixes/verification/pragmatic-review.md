# Pragmatic Review — lens-nav-followups-fixes

## TL;DR
Status: **Appropriate** (complexity Low–Medium, proportional). The change replaces Risks with Follow-ups (`src/model/followUps.ts` 161 LOC, `src/webview/followUpsMode.ts` 237 LOC), deleting `risks.ts`/`risksMode.ts`, so net surface stays flat. No new dependencies or infrastructure, and no speculative abstractions. There are 0 critical and 0 warning issues, plus 4 info-level nits.

## Key Decisions
- Reading `dashboard-data.js` as data (strip prefix, JSON then YAML) is justified because it avoids evaluating code, and the YAML fallback covers an observed real-world format (fu-unquoted fixture).
- The `republishSequence` guard in `panel.ts:1701` is a minimal fix for a real async race that got worse once the follow-ups payload became async. It is a single counter, not a framework.
- `resolveInside(..., baseRelDir)` extends the existing helper instead of adding a new one. That is the right call.

## Issues

| # | Severity | Location | Issue | Fixable |
|---|----------|----------|-------|---------|
| 1 | info | src/webview/followUpsMode.ts:80,229 | `current` module variable is written but never read outside the handler; it is dead state, so use a local const. | yes (trivial) |
| 2 | info | src/webview/followUpsMode.ts:16-17 vs src/model/followUps.ts:4-18 | `FollowUpSourceKey`/`FollowUpSeverity` re-declare the model's `FollowUpSource`/`IssueSeverity`. This is acceptable given the separate webview bundle convention, but a type-only import would remove the drift risk. | yes |
| 3 | info | src/model/followUps.ts:151 | `followUpCount` reruns the full `collectFollowUps` just to count. This is fine at the current scale and not worth changing. | n/a |
| 4 | info | src/panel/messages.ts:117 | The `SCHEME` regex duplicates the one in relPath.ts (noted in the work-log). Import or share it. | yes |

## Open Questions / Risks
- Formatting-only diffs from prettier (messages.ts, shim.ts) add review noise but carry no functional risk.
