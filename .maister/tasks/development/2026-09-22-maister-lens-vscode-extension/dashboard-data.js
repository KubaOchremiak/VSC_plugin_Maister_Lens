window.MAISTER_DATA = {
  "generated": "2026-09-23T12:38:27Z",
  "task": {
    "title": "Maister Lens — VS Code extension",
    "type": "development",
    "status": "completed",
    "description": "Implement Maister Lens from product-design task 2026-09-22-maister-viewer-vscode-plugin",
    "path": ".maister/tasks/development/2026-09-22-maister-lens-vscode-extension",
    "current_activity": null
  },
  "characteristics": {
    "has_reproducible_defect": false,
    "modifies_existing_code": false,
    "creates_new_entities": true,
    "involves_data_operations": true,
    "ui_heavy": true
  },
  "phases": [
    {
      "id": "phase-1",
      "name": "Analyze codebase & clarify requirements",
      "icon_hint": "analysis",
      "status": "completed",
      "started": "2026-09-22T17:41:28Z",
      "completed": "2026-09-22T17:51:46Z",
      "skip_reason": null,
      "summary": "Greenfield repo; feature-spec.md is the blueprint. Scope: full spec; unit+integration tests; Claude command+URI fallback; MIT.",
      "decisions": [],
      "risks": [
        "10 spec gaps listed in codebase-analysis.md",
        "Node 26 toolchain compatibility unverified"
      ],
      "artifacts": [
        {
          "path": "analysis/codebase-analysis.md",
          "label": "Codebase analysis",
          "html": null
        },
        {
          "path": "analysis/clarifications.md",
          "label": "Clarifications",
          "html": null
        }
      ],
      "gate": {
        "question": "Clarifications (scope/tests/Claude API/publisher)",
        "answer": "Full spec; unit+integration; command+URI fallback; placeholder+MIT"
      }
    },
    {
      "id": "phase-2",
      "name": "Analyze gaps & clarify scope",
      "icon_hint": "analysis",
      "status": "completed",
      "started": "2026-09-22T17:51:46Z",
      "completed": "2026-09-22T18:29:12Z",
      "skip_reason": null,
      "summary": "Greenfield: all spec capabilities missing. 2 critical + 11 important decisions raised and resolved at the gate; scope unchanged.",
      "decisions": [
        {
          "decision": "Key tasks on folderUri everywhere",
          "rationale": "matches spec 2.1; avoids multi-root collisions"
        },
        {
          "decision": "One consolidated webview message table; Risks filtering local to the webview",
          "rationale": "protocol doubles as security allowlist"
        },
        {
          "decision": "Hide task-argument launch commands from the Command Palette",
          "rationale": "no task context there"
        },
        {
          "decision": "Single shared open-risks definition",
          "rationale": "count must match what the click opens (AC18)"
        },
        {
          "decision": "AC13 applies to Lens strings only; Maister phase names verbatim",
          "rationale": "Maister is a constant input"
        },
        {
          "decision": "No status-bar item",
          "rationale": "view badge carries the count"
        },
        {
          "decision": "Now tree groups artifacts under a Recent artifacts node",
          "rationale": "mockups binding for layout"
        },
        {
          "decision": "Integration tests on downloaded pinned stable + optional 1.90.0",
          "rationale": "reproducible; verifies engine floor"
        },
        {
          "decision": "skip_test_suite false",
          "rationale": "verification must run the AC suites"
        },
        {
          "decision": "Docs/README/CHANGELOG/testing standards at finalization",
          "rationale": "conventions standard"
        },
        {
          "decision": "Add .gitignore and untrack playwright log",
          "rationale": "tool noise"
        },
        {
          "decision": "Claude URI fallback gated on extension presence, env.uriScheme",
          "rationale": "openExternal reports false success"
        },
        {
          "decision": "Generate perf/git fixtures at run time",
          "rationale": "small repo, deterministic"
        }
      ],
      "risks": [
        "Copilot availability check is weak",
        "claude-vscode.editor.open undocumented; ignores prompt if session already open",
        "Mockups still mention the removed Browse surface"
      ],
      "artifacts": [
        {
          "path": "analysis/gap-analysis.md",
          "label": "Gap analysis",
          "html": null
        },
        {
          "path": "analysis/scope-clarifications.md",
          "label": "Scope clarifications",
          "html": null
        }
      ],
      "gate": {
        "question": "Continue past gap analysis?",
        "answer": "Continue to Phase 5 (skip mockup generation)"
      }
    },
    {
      "id": "phase-3",
      "name": "Write failing test (TDD Red)",
      "icon_hint": "code",
      "status": "skipped",
      "started": null,
      "completed": null,
      "skip_reason": "No reproducible defect - greenfield build, no TDD gates",
      "summary": null,
      "decisions": [],
      "risks": [],
      "artifacts": [],
      "gate": null
    },
    {
      "id": "phase-4",
      "name": "Generate UI mockups",
      "icon_hint": "spec",
      "status": "skipped",
      "started": null,
      "completed": null,
      "skip_reason": "Six approved mockups already ingested from the product-design task",
      "summary": null,
      "decisions": [],
      "risks": [],
      "artifacts": [],
      "gate": null
    },
    {
      "id": "phase-5",
      "name": "Gather requirements & create specification",
      "icon_hint": "spec",
      "status": "completed",
      "started": "2026-09-22T18:29:12Z",
      "completed": "2026-09-22T18:51:37Z",
      "skip_reason": null,
      "summary": "spec.md records the delta over feature-spec.md: 13 amendments, 27 requirements, a consolidated webview message table (security allowlist) and AC1-AC18 traceability.",
      "decisions": [
        {
          "decision": "Spec records only the delta over feature-spec.md",
          "rationale": "implementation follows the amendment where they disagree"
        },
        {
          "decision": "folderUri task identity everywhere",
          "rationale": "relPath collides in multi-root workspaces"
        },
        {
          "decision": "Consolidated webview message table = security allowlist",
          "rationale": "protocol was contradictory and incomplete"
        },
        {
          "decision": "AC13 covers Lens strings; Maister phase names verbatim",
          "rationale": "paraphrasing them would break the honesty rule"
        },
        {
          "decision": "No chart library, sanitizer, status bar, Quick Picks, or writes",
          "rationale": "two-dependency rule + minimal implementation"
        }
      ],
      "risks": [
        "claude-vscode.editor.open undocumented; ignores prompt when the session is open",
        "chat.open is registered even when Copilot cannot answer",
        "Node 26: esbuild/mocha/test-electron need an early smoke test",
        "Registry pinned to Maister 2.2.3; newer phases render by raw id"
      ],
      "artifacts": [
        {
          "path": "implementation/spec.md",
          "label": "Implementation specification",
          "html": "implementation/spec.html"
        },
        {
          "path": "analysis/requirements.md",
          "label": "Requirements",
          "html": null
        }
      ],
      "gate": {
        "question": "Continue to specification audit?",
        "answer": "Yes, run the audit"
      }
    },
    {
      "id": "phase-6",
      "name": "Audit specification",
      "icon_hint": "verify",
      "status": "completed",
      "started": "2026-09-22T18:51:37Z",
      "completed": "2026-09-22T19:09:36Z",
      "skip_reason": null,
      "summary": "pass-with-concerns (2 critical, 9 warning, 9 info); spec then revised to A1-A18 closing both criticals and 9 warnings.",
      "decisions": [],
      "risks": [
        "resolved: C1 list-shaped phase_summaries - closed by A14",
        "resolved: C2 AC verification harness - closed by A16",
        "resolved: W1 navigate containment - A2.1 narrows to same task",
        "resolved: W2 openInBrowser trust - A2.2",
        "resolved: W4 failed_phases - A17",
        "resolved: W5 visual E2E scope - A10/A16 structural only",
        "resolved: W9 cache-buster - A18 smoke test + contingency",
        "Open: asWebviewUri must resolve the ?t= cache-buster - two panel modes depend on it",
        "Open: Claude Code 2.1.278 requires VS Code ^1.94.0, limiting the 1.90 floor test run"
      ],
      "artifacts": [
        {
          "path": "verification/spec-audit.md",
          "label": "Specification audit",
          "html": null
        }
      ],
      "gate": {
        "question": "How to handle audit findings?",
        "answer": "Fix criticals + key warnings, then plan"
      }
    },
    {
      "id": "phase-7",
      "name": "Plan implementation",
      "icon_hint": "plan",
      "status": "completed",
      "started": "2026-09-22T19:09:36Z",
      "completed": "2026-09-22T19:54:35Z",
      "skip_reason": null,
      "summary": "12 task groups, 101 steps, 63-73 tests; A18 de-risking probe first; all 7 screens covered.",
      "decisions": [
        {
          "decision": "Group 1 is a de-risking group: A18 probe before any feature code",
          "rationale": "two panel modes depend on the outcome"
        },
        {
          "decision": "package.json split between groups 1 and 2",
          "rationale": "nothing serializes on it later"
        },
        {
          "decision": "Views, panel core and launch run concurrently",
          "rationale": "disjoint file sets after index + manifest"
        },
        {
          "decision": "One DOM harness group, not a slice per UI group",
          "rationale": "needs all bundles present for one stub"
        },
        {
          "decision": "Group 11 has zero automated tests",
          "rationale": "its deliverable is a signed manual checklist"
        }
      ],
      "risks": [
        "Hard gate: group 1 reports the A18 outcome before group 6 starts",
        "src/strings.ts serializes groups 5-9",
        "test:min on 1.90 cannot exercise the Claude Code target",
        "AC11 pre-fill is manual plus a mocked unit test",
        "setGroupBy needs a named webview sender"
      ],
      "artifacts": [
        {
          "path": "implementation/implementation-plan.md",
          "label": "Implementation plan",
          "html": "implementation/implementation-plan.html"
        },
        {
          "path": "implementation/visual-coverage.md",
          "label": "Visual coverage",
          "html": null
        }
      ],
      "gate": {
        "question": "Start implementation?",
        "answer": "Yes, execute the plan (parallel waves)"
      }
    },
    {
      "id": "phase-8",
      "name": "Execute implementation",
      "icon_hint": "code",
      "status": "completed",
      "started": "2026-09-22T19:54:35Z",
      "completed": "2026-09-23T07:04:21Z",
      "skip_reason": null,
      "summary": "12 groups; 99/101 steps (2 deferred to a human). 71 tests passing across four harnesses; benchmark met AC7/AC9 with wide margins.",
      "decisions": [
        {
          "decision": "A18 resolution works - full hosted scope kept",
          "rationale": "probe preserved the ?t= cache-buster end to end"
        },
        {
          "decision": "AC15 automated, not downgraded",
          "rationale": "custom host spawn without --disable-workspace-trust"
        },
        {
          "decision": "setGroupBy dropped from the allowlist",
          "rationale": "no webview sender; native QuickPick instead"
        },
        {
          "decision": "month grouping kept",
          "rationale": "spec 4.2 row 4 specifies it and the native command reaches it"
        },
        {
          "decision": "AC13 scoped to Lens strings",
          "rationale": "Maister phase names are constant input"
        }
      ],
      "risks": [
        "All 7 manual checklist items unsigned - AC3/AC4/AC11/AC14 manual halves unverified",
        "No end-to-end launch path exercised in the host",
        "taskOf() unreachable by either harness",
        "AC3 insertion assertions in unit rather than integration",
        "test:min untrusted pass runs on 1.138.0 not the 1.90 floor",
        "Spec follow-up: drop setGroupBy from A2's table"
      ],
      "artifacts": [
        {
          "path": "implementation/work-log.md",
          "label": "Work log",
          "html": null
        },
        {
          "path": "implementation/implementation-plan.md",
          "label": "Implementation plan (99/101)",
          "html": "implementation/implementation-plan.html"
        },
        {
          "path": "verification/manual-checklist.md",
          "label": "Manual checklist (unsigned)",
          "html": null
        }
      ],
      "gate": null
    },
    {
      "id": "phase-9",
      "name": "Verify test passes (TDD Green)",
      "icon_hint": "verify",
      "status": "skipped",
      "started": null,
      "completed": null,
      "skip_reason": "Phase 3 (TDD red) was not executed",
      "summary": null,
      "decisions": [],
      "risks": [],
      "artifacts": [],
      "gate": null
    },
    {
      "id": "phase-10",
      "name": "Prompt verification options",
      "icon_hint": "verify",
      "status": "completed",
      "started": "2026-09-23T07:04:21Z",
      "completed": "2026-09-23T07:05:49Z",
      "skip_reason": null,
      "summary": "Code review, pragmatic review, reality check and production readiness selected; E2E on; user docs skipped (README already covers it).",
      "decisions": [],
      "risks": [],
      "artifacts": [],
      "gate": {
        "question": "Which verifications?",
        "answer": "All four standard + E2E; user docs skipped"
      }
    },
    {
      "id": "phase-11",
      "name": "Verify implementation & resolve issues",
      "icon_hint": "verify",
      "status": "completed",
      "started": "2026-09-23T07:05:49Z",
      "completed": "2026-09-23T12:11:27Z",
      "skip_reason": null,
      "summary": "5 verifications found 5 critical + 10 warning; two fix rounds closed all 6 criticals (one fix did not hold first time) and packaging. 87 tests passing, up from 71.",
      "decisions": [],
      "risks": [
        "resolved: all 6 critical findings closed and re-verified by execution",
        "resolved: vsce package now exits 0",
        "All 7 manual checklist items remain unsigned - AC3/AC4/AC11/AC14 manual halves unverified",
        "8 known issues logged by decision: W1-W5, N2-N4",
        "Strict dashboard grammar refuses legacy doctypes - a future dashboard changing its opening bytes would fall back silently"
      ],
      "artifacts": [
        {
          "path": "verification/implementation-verification.md",
          "label": "Verification report (post-fix)",
          "html": "verification/implementation-verification.html"
        },
        {
          "path": "verification/code-review-report.md",
          "label": "Code review",
          "html": null
        },
        {
          "path": "verification/code-review-reverify.md",
          "label": "Code review re-verification",
          "html": null
        },
        {
          "path": "verification/pragmatic-review.md",
          "label": "Pragmatic review",
          "html": null
        },
        {
          "path": "verification/production-readiness-report.md",
          "label": "Production readiness",
          "html": null
        },
        {
          "path": "verification/reality-check.md",
          "label": "Reality check",
          "html": null
        },
        {
          "path": "verification/manual-checklist.md",
          "label": "Manual checklist (unsigned)",
          "html": null
        }
      ],
      "gate": {
        "question": "Fix rounds",
        "answer": "Round 1: 5 criticals + packaging. Round 2: C3 + N1. Remaining warnings logged by decision."
      }
    },
    {
      "id": "phase-12",
      "name": "Run E2E tests",
      "icon_hint": "verify",
      "status": "completed",
      "started": "2026-09-23T12:15:38Z",
      "completed": "2026-09-23T12:38:17Z",
      "skip_reason": null,
      "summary": "10 scenarios, 10 passed: 0 critical, 0 major, 2 minor, 4 cosmetic. Visual fidelity 3 match / 2 minor / 0 drift / 2 not comparable.",
      "decisions": [],
      "risks": [
        "resolved: MIN-1/MIN-2 fallback status glyph now rendered, duplicate announcement removed",
        "resolved: COS-1 .sr-only pinned so it cannot widen the document box",
        "Colour, contrast and the four themes remain unassessable outside the VS Code host - manual checklist item",
        "risksMode inlines a raw glyph into text without aria-hidden - flagged, not fixed"
      ],
      "artifacts": [
        {
          "path": "verification/e2e-verification-report.md",
          "label": "E2E verification",
          "html": "verification/e2e-verification-report.html"
        },
        {
          "path": "verification/visual-fidelity.md",
          "label": "Visual fidelity",
          "html": "verification/visual-fidelity.html"
        }
      ],
      "gate": {
        "question": "Fix E2E findings?",
        "answer": "Fix all three; then finalize (user docs skipped)"
      }
    },
    {
      "id": "phase-13",
      "name": "Generate user documentation",
      "icon_hint": "docs",
      "status": "skipped",
      "started": null,
      "completed": null,
      "skip_reason": "User declined - the developer README already documents views, modes, settings and scripts",
      "summary": null,
      "decisions": [],
      "risks": [],
      "artifacts": [],
      "gate": null
    },
    {
      "id": "phase-14",
      "name": "Finalize workflow",
      "icon_hint": "done",
      "status": "completed",
      "started": "2026-09-23T12:38:17Z",
      "completed": "2026-09-23T12:38:27Z",
      "skip_reason": null,
      "summary": "Workflow complete. 88 tests passing, all criticals closed, 2 steps and 7 manual checklist items deferred to a human.",
      "decisions": [],
      "risks": [],
      "artifacts": [],
      "gate": null
    }
  ],
  "verification": {
    "status": "passed_with_issues",
    "reverify_count": 2,
    "fixes": [
      "C1 containment: decode-then-normalize in a shared module",
      "C2: attribute parsing replaces regex lookahead",
      "C3 (round 2): strict prefix grammar from byte 0",
      "C4: yaml alias guard restored + 2 MiB cap",
      "C5: revealInExplorer registered + coverage test",
      "N1 (round 2): shim nonce restricted to same-origin exact path",
      "Packaging: vsce package now exits 0",
      "openFile: validated folder travels with the message"
    ],
    "issues": [
      {
        "severity": "critical",
        "category": "security",
        "description": "resolveInside decodes after normalizing - percent-encoded .. escapes containment on 5 message types",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "critical",
        "category": "security",
        "description": "CSP nonce granted to a remote script src with a quoted > in its attributes",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "critical",
        "category": "security",
        "description": "Dashboard with no <head> hosted with no CSP at all - fails open",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "critical",
        "category": "security",
        "description": "maxAliasCount -1 disables the yaml resource-exhaustion guard, untrusted workspaces included",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "critical",
        "category": "correctness",
        "description": "maister.revealInExplorer contributed but never registered - clicking it errors",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "warning",
        "category": "packaging",
        "description": "npx vsce package fails - no installable artifact",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "warning",
        "category": "packaging",
        "description": "publisher placeholder hardcoded twice",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "warning",
        "category": "correctness",
        "description": "linkify manufactures 133 bogus external links across the two real tasks",
        "fixable": true,
        "fixed": false
      },
      {
        "severity": "warning",
        "category": "correctness",
        "description": "Multi-root attribution wipes itself",
        "fixable": true,
        "fixed": false
      },
      {
        "severity": "warning",
        "category": "security",
        "description": "Persisted index and panel location skip containment",
        "fixable": true,
        "fixed": false
      },
      {
        "severity": "warning",
        "category": "security",
        "description": "Existing-terminal launch branch skips shell quoting",
        "fixable": true,
        "fixed": false
      },
      {
        "severity": "warning",
        "category": "security",
        "description": "Overview re-implements the trust gate; refusal log throws on undefined",
        "fixable": true,
        "fixed": false
      },
      {
        "severity": "warning",
        "category": "correctness",
        "description": "Workspace folders added after activation are never watched",
        "fixable": true,
        "fixed": false
      },
      {
        "severity": "warning",
        "category": "docs",
        "description": "Spec A2 table still lists the refused setGroupBy",
        "fixable": true,
        "fixed": false
      },
      {
        "severity": "warning",
        "category": "test-coverage",
        "description": "No test asserts every contributed command is registered",
        "fixable": true,
        "fixed": false
      }
    ]
  }
};
