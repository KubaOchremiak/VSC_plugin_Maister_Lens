# Gap Analysis: Project Docs Page in Maister Lens

## TL;DR
Maister Lens has nothing today that reads `.maister/docs`. There is no Project mode, no doc reader mode that works without a task, no watcher on the docs folder, and no nav entry. This is a mostly additive change. It adds two panel modes (`project` and `doc`), one new bundle, one new pure parser, one message pair, one nav node and one command, and one watcher glob. The risk is medium because of the mode branching spread through `panel.ts` (about 12 sites) and the path-containment rules. The feature is read-only, so there is no CRUD gap. Three decisions remain: which workspace folder to use in a multi-root workspace, the empty state when `.maister/docs` is absent, and how the doc reader breadcrumb and back navigation behave.

## Key Decisions
- The change type is **additive**, with a small **refactor** that generalises the link base of `RenderTarget` and `readerPayload` so they can render a doc that has no task.
- The data entity is a read-only doc file. The CRUD analysis is limited to READ, because editing is out of scope by vision: Maister Lens is a read-only view layer. The "Source" button opens the file in the editor.
- The clarified decisions are already resolved and are not repeated as questions: the TL;DR comes from INDEX.md, all docs are listed grouped by folder, the page refreshes live, and links use the existing rules.

## Open Questions / Risks
- `panel.ts:607` sets `folderUri` to undefined for the dashboard. The Project and doc modes need a concrete workspace folder, and the multi-root behaviour is undefined.
- The INDEX.md parsing (`#### Vision (\`project/vision.md\`)` and the paragraph that follows) is heuristic. If its format drifts, parsing fails silently, which conflicts with the "honest state" criterion.
- If any mode branch is missed (resourceRoots, sourceUri, applyContextKeys, readLocation, title), the result is a silent fallback to the dashboard or broken images.

## Summary
- **Risk Level**: Medium
- **Estimated Effort**: Medium
- **Detected Characteristics**: modifies_existing_code, creates_new_entities, ui_heavy

## Task Characteristics
- Has reproducible defect: no
- Modifies existing code: yes (panel.ts, render.ts, messages.ts, navTree.ts, reader.ts, strings.ts, watcher.ts, package.json)
- Creates new entities: yes (the modes `project` and `doc`, projectMode.ts, parseProjectDocs.ts, the `maister.openProject` command, the `openProject` and `openDoc` messages)
- Involves data operations: no. The feature only reads files and does no create, update or delete. The READ lifecycle is still checked below.
- UI heavy: yes (a new page, a sidebar node, a TL;DR card, grouped rows, and reader breadcrumb changes)

## Gaps Identified

### Missing Features
- **Project mode.** `PanelLocation` (`panel.ts:49`) has the modes dashboard, risks, task and artifact only.
- **Doc mode without a task.** `buildArtifact` requires an indexed task and falls back to the dashboard (codebase-analysis). `resourceRoots` exclude `.maister/docs`.
- **Docs discovery.** Nothing in `src` references `.maister/docs`. Discovery needs `findFiles('.maister/docs/**/*.md')` and grouping by folder.
- **TL;DR parser.** Nothing parses INDEX.md. The Vision and Tech Stack headings are at INDEX.md lines 19 and 22.
- **Docs watcher.** `watcher.ts:6` watches `.maister/tasks/**` only.
- **Nav node and command.** `navTree.ts` has `DASHBOARD_NODE` only. `package.json` has no `maister.openProject`.
- **Messages.** The `dispatch` switch (`panel.ts:501-547`) has no `openProject` or `openDoc` case, and there is no validation for either.

### Incomplete Features
- **`renderArtifact` and `classifyLink`.** Links resolve against the task folder only and need a docs-root base. With the same rules, a relative link from a doc that points into `.maister/tasks/...` should map to `openArtifact`, and one pointing to another doc should map to `openDoc`.
- **Reader breadcrumb.** It always posts `openTask`. For docs it needs to show Project, then the file.
- **`readLocation` (`panel.ts:1526+`).** It rejects unknown modes, so a restored panel falls back to the dashboard.

### Behavioral Changes Needed
- **Mode-branch sites.** Lines 369/375 (readable check), 458, 607, 619, 634, 665-681 (buildView), 1397, 1413, 1420, 1433 and 1532-1543 each need an explicit project or doc branch.
- **Pinned counts in tests.** `manifest.test.ts` (view and command order), `surfaces.spec.ts` ("five" surfaces) and the `harness.ts` `BundleName` union change from their current values.

## User Journey Impact Assessment

| Dimension | Current | After | Assessment |
|---|---|---|---|
| Reachability | Docs reachable only through the Explorer or Quick Open, shown as raw markdown | Sidebar > Project (directly under Dashboard) > row > rendered doc | ✅ |
| Discoverability | 3/10 (the user needs to know the path) | 8/10 (a top-level sidebar entry) | +5 |
| Flow Integration | None | Follows the same back/forward history and reader as artifacts; links between docs can be followed | ✅. Breadcrumb semantics need a decision (see below) |
| Multi-persona / multi-root | n/a | Undefined for multi-root and for workspaces without `.maister/docs` | ⚠️ |

## Data Lifecycle Analysis
Entity: the project doc file (read-only by product vision).

| Operation | Backend | UI | Access | Status |
|---|---|---|---|---|
| READ (list) | Missing (no discovery) | Missing (no projectMode) | Missing (no nav node) | ❌ Planned by this task |
| READ (single) | Partial (renderArtifact is task-bound) | Reader bundle exists | Missing (no openDoc) | ❌ Planned by this task |
| CREATE / UPDATE / DELETE | Out of scope (the product is read-only) | The "Source" button opens the file in the editor | Needs `sourceUri` for doc mode | Not applicable |

Completeness within scope: after the task is done, reads are covered 100%. There are no orphaned operations, because the backend and UI are created together with the access path. Missing touchpoints: none are safety-critical.

## Issues Requiring Decisions

### Critical
None. The feature has no orphaned operations and no blocking unknowns.

### Important
1. **Multi-root workspaces.** The dashboard has no folder (`panel.ts:607`).
   - Options: (A) Use the first workspace folder that has `.maister/docs`. (B) Show one section per folder on the Project page. (C) Use the folder of the active editor.
   - Default: A. The project is effectively single-root, and this is the minimal implementation.
2. **Empty state when there is no `.maister/docs`, or no INDEX.md or TL;DR entries.**
   - Options: (A) Always show the nav node, with an honest empty state and a hint to run `/maister:init`. (B) Hide the nav node through a `when` context key.
   - Default: A. It gives an honest state, stays discoverable, and avoids another context key.
3. **Reader breadcrumb and back navigation for docs.**
   - Options: (A) The breadcrumb reads "Project > path/file.md" and its first segment posts `openProject`. (B) No breadcrumb, only history back.
   - Default: A. It mirrors the artifact breadcrumb.
4. **Grouping and order of docs.**
   - Options: (A) Put INDEX.md first, then `project/`, then `standards/<domain>/`, then other folders alphabetically. (B) Sort all folders alphabetically.
   - Default: A. The vision and index are the entry points.
5. **Row labels.**
   - Options: (A) Use the first H1 of each file, falling back to the filename. (B) Use the filename.
   - Default: B with a humanised name (for example `coding-style.md` becomes "Coding style"). It is cheap and does not read every file on each render.
6. **Tests that pin surface and command counts.**
   - Options: (A) Update them deliberately in the same change. (B) Refactor them so they do not pin counts.
   - Default: A.

## Recommendations
- Implement pure pieces first, with unit tests: `parseProjectDocs(indexMd)` returning `{goal?, techStack?}`, the docs grouping, and `openDoc` validation. Validation rejects traversal, anything that is not `.md`, and absolute paths, using `resolveInside` on `.maister/docs`.
- Add `{mode:'project'}` and `{mode:'doc', folderUri, docRelPath, anchor?}`. Then grep every `location.mode`/`mode ===` site in `panel.ts` and handle it explicitly.
- Generalise `renderArtifact` to take a `linkBase` (the task folder or the docs root) without changing how artifacts behave. Guard that with the existing `render.test.ts`.
- Add a second glob to `watcher.ts`, or a small dedicated watcher, that re-publishes only when the current mode is project or doc.
- Reuse `summaryCard`, `row` and `.group-heading`. Add no new CSS file and no new dependencies. Keep all strings in `strings.ts`.

## Risk Assessment
- **Complexity Risk**: Medium. There are many branch sites in a 1556-line file.
- **Integration Risk**: Medium. The render and link-base refactor touches the artifact path used by every task.
- **Regression Risk**: Medium. Containment and security (`security.spec.ts`, `trust.test.ts`) and restore behaviour need re-verifying. Pinned-count tests fail by design and have to be updated.
