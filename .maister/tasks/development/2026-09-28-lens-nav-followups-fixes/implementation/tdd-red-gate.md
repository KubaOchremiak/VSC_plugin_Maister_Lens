# TDD Red Gate

## TL;DR
Three failing tests reproduce bugs 1, 2 and 4. Each fails for the documented root cause.

## Key Decisions
- Bug 2's test uses a new `MessageContext.hostBaseRelDir` (the artifact's folder, relative to the task) as the resolution base.
- Bug 4's test is on risksMode today. It moves to the Follow-ups view when Risks is replaced.

## Tests
| Bug | Test | Failure |
|---|---|---|
| 1 | test/dom/shim.spec.ts "injects the back link…" expects '← Lens Dashboard' | text is '← Dashboard' |
| 2 | test/unit/messages.test.ts "a companion page navigates relative to its own folder…" | refused: "resolves outside the hosting task folder" |
| 4 | test/dom/surfaces.spec.ts "a Risks group expander hides and reveals its list" | `<ul hidden>` still visible (`.risks{display:flex}`) |

Bug 3 is a feature, so it has no red test.
