# Scope Clarifications (Phase 2)

## TL;DR
All six important decisions are settled. Multi-root workspaces get one section per folder; every other decision uses the recommended default.

## Key Decisions
- **Multi-root:** one docs section per workspace folder that contains .maister/docs. The user chose this over the default.
- **Empty state:** the Project nav button is always visible. When docs are missing, the page shows an honest empty state that suggests /maister:init.
- **Row labels:** humanized filenames.
- **Group order:** INDEX.md, then project/, then standards/<domain>/, then any other folders alphabetically.
- **Doc breadcrumb:** "Project › path", which posts openProject.
- **Pinned tests:** manifest, surfaces and harness counts are updated on purpose.
