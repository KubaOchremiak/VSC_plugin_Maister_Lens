window.MAISTER_DATA = {
  "generated": "2026-10-13T21:53:02Z",
  "task": {
    "title": "Edit button on markdown viewer pages",
    "type": "development",
    "status": "completed",
    "description": "Add an Edit button (top-right) on markdown viewer pages to open the file in the regular .md editor",
    "path": ".maister/tasks/development/2026-09-28-md-viewer-edit-button",
    "current_activity": null
  },
  "characteristics": {
    "has_reproducible_defect": false,
    "modifies_existing_code": true,
    "creates_new_entities": false,
    "involves_data_operations": false,
    "ui_heavy": true
  },
  "phases": [
    {
      "id": "phase-1",
      "name": "Analyze codebase & clarify requirements",
      "icon_hint": "analysis",
      "status": "completed",
      "started": "2026-09-28T21:23:46Z",
      "completed": "2026-09-28T21:31:06Z",
      "skip_reason": null,
      "summary": "One shared reader bundle renders docs and artifacts; editor-open path exists. User chose: docs + artifacts, same editor group, update README.",
      "decisions": [],
      "risks": [
        "README L12/L84-85 read-only wording",
        "readerDoc.spec.ts forbids openSource in doc mode",
        "DOM fixture docsFolderUri mismatch"
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
      "gate": null
    },
    {
      "id": "phase-2",
      "name": "Analyze gaps & clarify scope",
      "icon_hint": "analysis",
      "status": "completed",
      "started": "2026-09-28T21:31:06Z",
      "completed": "2026-09-28T21:41:16Z",
      "skip_reason": null,
      "summary": "Additive, low-risk change to the shared reader header. 4 important decisions pending: doc message contract, refused pages, vision.md wording, button style.",
      "decisions": [
        {
          "decision": "Doc pages post new editDoc message",
          "rationale": "Strict allowlist validation"
        },
        {
          "decision": "Refused pages keep both Edit and in-body source button",
          "rationale": "User choice"
        },
        {
          "decision": "vision.md unchanged",
          "rationale": "Edit is explicit hand-off"
        },
        {
          "decision": "Text-only Edit button",
          "rationale": "Matches existing actions"
        }
      ],
      "risks": [
        "Refused pages would duplicate Edit + in-body source button",
        "vision.md criterion 2 wording",
        "DOM fixture docsFolderUri differs from real panel"
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
        "question": "Continue to Phase 4: UI Mockup Generation?",
        "answer": "skip mockups. It is only one button"
      }
    },
    {
      "id": "phase-3",
      "name": "Write failing test (TDD Red)",
      "icon_hint": "code",
      "status": "skipped",
      "started": null,
      "completed": null,
      "skip_reason": "No reproducible defect",
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
      "skip_reason": "User skipped: only one button",
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
      "started": "2026-09-28T21:41:16Z",
      "completed": "2026-09-28T21:52:04Z",
      "skip_reason": null,
      "summary": "Header-row Edit button on docs+artifacts; new editDoc message sharing validation with openDoc; 10 requirements, 8 ACs, 4 test groups.",
      "decisions": [
        {
          "decision": "Folder/path/.md checks extracted from validateDoc into one helper shared by openDoc and editDoc",
          "rationale": "DRY; openDoc keeps its anchor check and refusal meaning"
        },
        {
          "decision": "Visible text READER.edit='Edit'; tooltip via title from READER.editTitle='Open {file} in the editor'; no aria-label",
          "rationale": "Label-in-name, WCAG 2.5.3"
        }
      ],
      "risks": [
        "DOM fixture readerDocPayload() passes the docs dir as docsFolderUri, while the real panel passes the workspace folder",
        "With the same editor group, the live refresh after save is only visible once the user switches back to the viewer tab",
        "README L12 'read-only' and L84-85 'the one, explicit way' must be reworded"
      ],
      "artifacts": [
        {
          "path": "implementation/spec.md",
          "label": "Specification",
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
        "answer": "Continue"
      }
    },
    {
      "id": "phase-6",
      "name": "Audit specification",
      "icon_hint": "verify",
      "status": "skipped",
      "started": "2026-09-28T21:52:04Z",
      "completed": "2026-09-28T21:55:48Z",
      "skip_reason": "User skipped spec audit",
      "summary": null,
      "decisions": [],
      "risks": [],
      "artifacts": [],
      "gate": {
        "question": "Continue to implementation planning?",
        "answer": "Continue to planning"
      }
    },
    {
      "id": "phase-7",
      "name": "Plan implementation",
      "icon_hint": "plan",
      "status": "completed",
      "started": "2026-09-28T21:55:48Z",
      "completed": "2026-09-28T22:17:36Z",
      "skip_reason": null,
      "summary": "4 task groups, 22 steps: protocol+host (editDoc), reader UI, docs run in parallel; then test review + full suites. 13-22 new tests.",
      "decisions": [
        {
          "decision": "Protocol and host share one group",
          "rationale": "The union member, validation case and dispatch arm are one contract, covered end to end by one integration test"
        },
        {
          "decision": "Artifact DOM tests go in surfaces.spec.ts",
          "rationale": "Keeps changes small; no new spec file or harness change"
        },
        {
          "decision": "Full suites run once, in Group 4",
          "rationale": "AC7 requires the existing tests to pass unchanged"
        }
      ],
      "risks": [
        "Fixture URI: DOM test uses the readerDocPayload() docs folder, integration test uses the real workspace folder; do not change the fixture",
        "readerDoc.spec constraints: strict nav.rd-crumbs locator, focus order at positions 1-2, no openSource in doc mode",
        "After the validateDoc refactor, existing openDoc refusal checks (/workspace folder/) must still pass"
      ],
      "artifacts": [
        {
          "path": "implementation/implementation-plan.md",
          "label": "Implementation plan",
          "html": "implementation/implementation-plan.html"
        }
      ],
      "gate": {
        "question": "Continue to implementation?",
        "answer": "Continue to implementation"
      }
    },
    {
      "id": "phase-8",
      "name": "Execute implementation",
      "icon_hint": "code",
      "status": "completed",
      "started": "2026-09-28T22:17:36Z",
      "completed": "2026-09-28T22:29:36Z",
      "skip_reason": null,
      "summary": "All 4 groups / 22 steps done. 11 files (+307/-16), 15 new tests; npm run check 91, test:dom 42, test:integration 50+1 all green.",
      "decisions": [
        {
          "decision": "div.rd-head-lead wrapper in doc mode",
          "rationale": "Keep back/breadcrumb navs stacked"
        },
        {
          "decision": "Shared docTarget helper for openDoc + editDoc",
          "rationale": "DRY"
        }
      ],
      "risks": [
        "No .prettierrc in repo; prettier --write reformats files wholesale"
      ],
      "artifacts": [
        {
          "path": "implementation/work-log.md",
          "label": "Work log",
          "html": null
        },
        {
          "path": "implementation/implementation-plan.md",
          "label": "Implementation plan",
          "html": "implementation/implementation-plan.html"
        }
      ],
      "gate": {
        "question": "Continue to verification?",
        "answer": "Continue to verification"
      }
    },
    {
      "id": "phase-9",
      "name": "Verify test passes (TDD Green)",
      "icon_hint": "verify",
      "status": "skipped",
      "started": null,
      "completed": null,
      "skip_reason": "Phase 3 not executed",
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
      "started": "2026-09-28T22:29:36Z",
      "completed": "2026-09-28T22:37:11Z",
      "skip_reason": null,
      "summary": "All 4 standard reviews selected; E2E and user docs skipped.",
      "decisions": [],
      "risks": [],
      "artifacts": [],
      "gate": {
        "question": "Which verifications to run?",
        "answer": "Code review, Pragmatic, Reality check, Production readiness; E2E no; user docs no"
      }
    },
    {
      "id": "phase-11",
      "name": "Verify implementation & resolve issues",
      "icon_hint": "verify",
      "status": "completed",
      "started": "2026-09-28T22:37:11Z",
      "completed": "2026-10-13T21:53:02Z",
      "skip_reason": null,
      "summary": "Passed after 2 fix iterations / 3 verification runs: 0 critical, 0 warning, 15 info. 236/236 tests; code review clean; production GO 97%; reality GO.",
      "decisions": [],
      "risks": [
        "resolved: test:min (VS Code 1.90.0) not run",
        "Version still 0.1.1 / [Unreleased] (deferred to release)",
        "vision.md 'read-only' wording vs README (kept by user)",
        "resolved: Edit shows on refused .html artifact pages",
        "resolved: spec.md stale for .md gating and accessible-name fixes"
      ],
      "artifacts": [
        {
          "path": "verification/implementation-verification.md",
          "label": "Verification report",
          "html": "verification/implementation-verification.html"
        },
        {
          "path": "verification/test-suite-results.md",
          "label": "Test suite results",
          "html": null
        },
        {
          "path": "verification/code-review-reverify.md",
          "label": "Code review (re-verify)",
          "html": null
        },
        {
          "path": "verification/code-review-report.md",
          "label": "Code review (initial)",
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
        }
      ],
      "gate": {
        "question": "Continue to Phase 14: Finalization?",
        "answer": "Continue to finalization"
      }
    },
    {
      "id": "phase-12",
      "name": "Run E2E tests",
      "icon_hint": "verify",
      "status": "skipped",
      "started": null,
      "completed": null,
      "skip_reason": "User skipped: webview has no URL; DOM + integration tests cover it",
      "summary": null,
      "decisions": [],
      "risks": [],
      "artifacts": [],
      "gate": null
    },
    {
      "id": "phase-13",
      "name": "Generate user documentation",
      "icon_hint": "docs",
      "status": "skipped",
      "started": null,
      "completed": null,
      "skip_reason": "User skipped: README already updated",
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
      "started": "2026-10-13T21:53:02Z",
      "completed": "2026-10-13T21:53:02Z",
      "skip_reason": null,
      "summary": "Workflow complete. Edit button shipped for docs and .md artifacts; 236/236 tests; verification passed.",
      "decisions": [],
      "risks": [],
      "artifacts": [
        {
          "path": "workflow-summary.md",
          "label": "Workflow summary",
          "html": null
        }
      ],
      "gate": null
    }
  ],
  "verification": {
    "status": "passed",
    "issues": [
      {
        "severity": "warning",
        "category": "production",
        "description": "test:min not run against VS Code 1.90.0",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "warning",
        "category": "production",
        "description": "Version not bumped (deferred to release)",
        "fixable": true,
        "fixed": false
      },
      {
        "severity": "warning",
        "category": "completeness",
        "description": "vision.md 'read-only' wording (kept by user)",
        "fixable": true,
        "fixed": false
      },
      {
        "severity": "info",
        "category": "code_review",
        "description": "Edit shown on refused .html artifact pages",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "info",
        "category": "code_review",
        "description": "Edit accessible name lacks file name",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "info",
        "category": "code_review",
        "description": "Docs-root URI join repeated 3x",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "info",
        "category": "reality",
        "description": "No round-trip openDoc\u2192editDoc integration test",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "warning",
        "category": "completeness",
        "description": "spec.md not amended for .md gating",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "warning",
        "category": "completeness",
        "description": "spec.md not amended for accessible-name fix",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "info",
        "category": "completeness",
        "description": "Work-log fixes entry lacks Files Modified",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "info",
        "category": "pragmatic",
        "description": "Overlapping direct editDoc integration test",
        "fixable": true,
        "fixed": true
      },
      {
        "severity": "info",
        "category": "pragmatic",
        "description": "openSource message literal duplicated",
        "fixable": true,
        "fixed": true
      }
    ],
    "fixes": [
      "Ran test:min (51+1 passing)",
      "Edit gated on .md artifacts",
      "sr-only file name in Edit accessible name",
      "docsRootUri helper",
      "Round-trip integration test",
      "spec.md/spec.html amended",
      "Work-log Files Modified",
      "Removed overlapping integration test",
      "openSourceMessage helper"
    ],
    "reverify_count": 2
  }
};
