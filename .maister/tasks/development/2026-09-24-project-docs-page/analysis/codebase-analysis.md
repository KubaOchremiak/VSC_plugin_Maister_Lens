# Codebase Analysis Report

## TL;DR
- The Project page fits the existing single-panel mode system in `src/panel/panel.ts`. It needs a new `project` mode, which follows the dashboard pattern, and a new doc mode that is not tied to a task.
- `renderArtifact` (`src/panel/render.ts`) and the reader bundle can be reused. The artifact path cannot: `openArtifact` requires an indexed task folder, and `resourceRoots` exclude `.maister/docs`.
- Nothing in `src` reads `.maister/docs` today. We need discovery (`findFiles('.maister/docs/**/*.md')`) and a small pure parser for the TL;DR.
- The change touches about 10 source files and several test harnesses. Some tests encode the current number of views and surfaces, so they must be updated on purpose. Complexity is moderate and risk is medium.

## Key Decisions
- **Add `{mode:'project'}` and `{mode:'doc', docRelPath, anchor?}` to `PanelLocation`.** Docs have no task, so they cannot reuse `openArtifact` or `isIndexed`.
- **Add a new `src/webview/projectMode.ts` bundle, modelled on `dashboardMode.ts` and `risksMode.ts`.** esbuild bundles every `src/webview/*.ts` automatically, so no build config changes.
- **Render docs with the reader bundle and `renderArtifact`.** Generalise the link base in `RenderTarget` so that links between docs resolve under `.maister/docs`. This gives the same rendered view the dashboard uses.
- **Add new messages `openProject` and `openDoc{docRelPath, anchor?}`.** They are contained to `.maister/docs` through `resolveInside`, accept `.md` files only, and go through the `validate()` allowlist.
- **Build the TL;DR in a pure parser, `src/model/parseProjectDocs.ts`.** It uses `parseSummary` first. If no TL;DR heading exists, it falls back to the first paragraph of the vision "Problem Statement" and to the tech-stack "Overview" plus the `###` names under Languages and Frameworks. It adds no YAML or front-matter dependency.
- **Add a nav tree node `PROJECT_NODE` with a new `maister.openProject` command.** The command is hidden from the command palette.

## Open Questions / Risks
- **Leaving the docs folder:** decide what happens when a link in a doc points outside `.maister/docs`, for example to `CLAUDE.md` or a task file. Suggestion: send it to `openFile`, or to `openArtifact` when the target is inside an indexed task.
- **Live refresh:** there is no watcher for `.maister/docs` (`watcher.ts` watches only `TASKS_GLOB`). Decide whether the Project page should refresh live.
- **Webview resource roots:** `resourceRoots`, `sourceUri`, `workspaceRootUri` and `applyContextKeys` branch on mode in about six places. Each branch needs the new modes, or doc images and the source button will break silently.
- **Restoring a closed panel:** `readLocation` must accept the new modes, otherwise restore falls back to the dashboard.
- **Tests that pin current counts:** `manifest.test.ts` (view order), `surfaces.spec.ts` ("still five" surfaces) and the `harness.ts` `BundleName` union all need updating.
- **Reader breadcrumb:** the reader breadcrumb currently posts `openTask`. For docs it needs a variant that goes back to Project.
- **Where the TL;DR comes from:** neither `vision.md` nor `tech-stack.md` has a TL;DR heading. The TL;DR will depend on heading heuristics, which break silently if those docs are restructured.

---

## Summary
Maister Lens routes all panel content through one `TaskPanel` singleton that switches between location modes. The Project page adds a list-style mode, built the same way as the dashboard, and a doc reader mode that reuses the markdown renderer. The main work is adding a way to reach docs that does not depend on a task, while keeping path containment strict.

## Files Identified

### Primary Files
- **`src/panel/panel.ts`** (1556 lines). Holds the `PanelLocation` union (line 49), `buildView`, `dashboardPayload` (~703), `buildArtifact` (~1073), `readerPayload` (~1160), `bundleHtml` (~1290), the mode-branching functions (~451, 607, 1334, 1397, 1413, 1435), `dispatch` (~498), command registration (~1494) and `readLocation` (~1526). This is the core of the change.
- **`src/panel/render.ts`**. Contains `renderArtifact`, `classifyLink`, `RenderTarget`, `RenderPayload` and `ReaderLocation`. The link base and the location type need generalising.
- **`src/panel/messages.ts`**. Contains the `Message` union, `validate`, and the containment checks. Add `openProject` and `openDoc`.
- **`src/views/navTree.ts`**. Contains `NavTreeProvider` and `DASHBOARD_NODE`. Add a `project` kind and node.
- **`src/webview/projectMode.ts`** (new). Renders the TL;DR card and the grouped doc rows.
- **`src/webview/reader.ts`**. Needs breadcrumb and link handling for doc mode.
- **`src/model/parseProjectDocs.ts`** (new). A pure function that extracts the TL;DR.
- **`src/strings.ts`**. Add `NAV.project`, `PANEL.titleProject` and a `PROJECT` block.
- **`package.json`**. Add the `maister.openProject` command and its icon, the menus, and a `when:false` entry in `commandPalette`.

### Related Files
- `src/webview/dashboardMode.ts` (554 lines) and `src/webview/risksMode.ts` (491 lines) are the templates to follow.
- `src/webview/components.ts` provides `summaryCard`, `row`, `el` and `chip`.
- `src/webview/shim.ts` provides the ready/post handshake.
- `src/model/parseSummary.ts` finds TL;DR headings and can be reused.
- `src/model/relPath.ts` provides `resolveInside` and `containedRelPath`.
- `src/index/watcher.ts` is where an optional docs watcher would go.
- `media/webview.css` is the only stylesheet. Reuse its `.summary-card`, `.list`, `.trow`, `.group-heading` and `rd-` classes.
- `esbuild.mjs` needs no changes.

## Current Functionality
When the user runs `maister.openDashboard`, `TaskPanel.show({mode:'dashboard'})` runs. It calls `render()`, then `buildView`, which produces the HTML via `bundleHtml(title, bundle)` together with a payload. The panel then applies context keys and publishes. The webview replies with `ready`, and the host delivers the pending payload. The panel keeps a history stack of up to 50 entries and supports back and forward.

To show an artifact, the host renders the markdown (markdown-it with `html:false`). Links are rewritten to `data-artifact`, `data-file` or `data-external`, resolved relative to the task folder. `buildArtifact` falls back to the dashboard when no task is indexed for the folder.

The watcher covers task files only. The docs under `.maister/docs` are INDEX.md, `project/{vision,tech-stack}.md` and `standards/{global,frontend}/*.md`.

### Data Flow
The host discovers the docs, parses them and builds a payload `{type:'project', tldr:{goal, techStack[]}, groups[]}`. The `projectMode` webview renders it. When the user clicks a row, the webview posts `openDoc`. The host validates the message, confirms the path is under `.maister/docs`, and calls `show({mode:'doc'})`. `renderArtifact` runs with the docs link base and sends a `RenderPayload` to the reader bundle. Clicking a link inside a doc posts `openDoc` again, or `openFile`/`openExternal` for other targets.

## Dependencies
- **Imports:** `vscode` (host only), `markdown-it`, and the internal model, render and messages modules. No new runtime dependencies.
- **Consumers of the changed files:** `panel.ts`, `render.ts` and `messages.ts` are used by every panel mode and the tests that cover them. That is about 8 or more files.
- **Impact scope:** medium. The new modes are added alongside the existing ones, but the shared mode switches run on every render.

## Test Coverage

| Harness | Existing tests |
|---|---|
| Unit (mocha) | `manifest.test.ts`, `messages.test.ts`, `render.test.ts`, `strings.test.ts`, `parseSummary.test.ts` (fixtures in `test/fixtures/tasks/summary-headings/`) |
| Integration (`@vscode/test-electron`, VS Code 1.138 and 1.90) | `navTree.test.ts`, `panel.test.ts`, `reader.test.ts`, `dashboardMode.test.ts`, `trust.test.ts`, with helpers in `test/helpers/tempWorkspace.ts` |
| DOM (Playwright) | `test/dom/harness.ts`, `surfaces.spec.ts`, `security.spec.ts`, `themes.spec.ts` |

**Gaps:** nothing tests `.maister/docs` yet. The new work needs:
- unit tests for `parseProjectDocs` and for `openDoc` validation, including traversal and non-`.md` rejection
- integration tests for the project mode and the doc mode
- DOM tests for the `projectMode` surface.

## Coding Patterns
- **Payload types:** exported from the webview module and imported on the host side with `import type`. Payloads are tagged `{type:'<mode>'}`.
- **Strings:** all UI text lives in `strings.ts` and goes through `format()`.
- **Separation:** `vscode` is never imported in the model, render or messages modules.
- **Rendering:** the webview only builds the DOM; markdown is rendered on the host.
- **Imports:** use `.ts` extensions.
- **Comments:** cite spec section numbers.
- **Security:** CSP with nonces. Every clickable element is a `<button>` or `<a>` with an accessible name.

## Complexity Assessment

| Factor | Value | Level |
|---|---|---|
| File count | about 10 changed or new | High |
| `panel.ts` size | 1556 lines | High |
| Consumers | shared panel code | Medium |
| Test coverage | strong existing harnesses | Low risk |

**Overall: Moderate.** The patterns are well established, but the changes are spread across many files.

## Key Findings
- **Strengths:** clean mode and bundle architecture, reusable components, bundles picked up automatically, strict validation, and good tests.
- **Concerns:** `readerPayload` and `buildArtifact` assume a task, the mode switches are scattered, and some tests pin exact counts.
- **Opportunities:** a small refactor so the reader can take a doc source without a `Task` object. `parseSummary` can be reused.

## Impact Assessment
- **Primary changes:** `panel.ts`, `render.ts`, `messages.ts`, `navTree.ts`, `strings.ts`, `package.json`, `reader.ts`, plus the new `projectMode.ts` and `parseProjectDocs.ts`.
- **Test updates:** manifest, surfaces and harness, plus new unit, integration and DOM tests.
- **Risk level: Medium.** The biggest risks are weakening path containment and missing a mode branch, which leads to a silent fallback or missing resource roots.

## Recommendations
1. Start with pure functions and their unit tests: docs discovery grouping, `parseProjectDocs`, and `openDoc` validation.
2. Extend `PanelLocation` and handle every mode branch. Grep for `mode ===` and for `switch` statements in `panel.ts`, and add `readLocation` support.
3. Add the `projectMode` bundle using `summaryCard` and grouped `row`s: Project docs first, then Standards grouped by folder.
4. Adapt the reader to show doc locations, with a breadcrumb back to Project and links between docs resolved against `.maister/docs`.
5. Add the nav node and command. Update `manifest.test.ts` and `surfaces.spec.ts` on purpose.
6. Optionally add a watcher for `.maister/docs/**/*.md` that re-publishes when the project or doc mode is showing.

Avoid:
- routing docs through `openArtifact`
- turning on `html:true`
- opening a second `WebviewPanel`
- adding a new CSS file
- adding a YAML dependency
- hard-coding English strings.

## Next Steps
Run the gap analysis. Resolve the open questions above (live refresh, links that leave `.maister/docs`, TL;DR fallback rules) before writing the specification.
