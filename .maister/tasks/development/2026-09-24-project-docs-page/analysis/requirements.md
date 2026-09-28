# Requirements

## TL;DR
A read-only Project page opened from a sidebar item below Dashboard. It shows a TL;DR (project goal and tech stack) taken from `.maister/docs/INDEX.md`, followed by grouped shortcuts to every `.maister/docs/**/*.md`. Each doc opens in the existing rendered reader, which has a "← Project" back control.

## Key Decisions
- **Access:** the sidebar nav item is the only way in. `maister.openProject` is hidden from the command palette and gets no title-bar button.
- **Reuse:** the page is modelled on dashboardMode. Docs render with the existing reader bundle and `renderArtifact`, the UI uses `components.summaryCard`/`row`, and styling goes in the existing `media/webview.css`. There are no new dependencies or CSS files.
- **Back control:** "← Project" sits where the dashboard's "← Dashboard" breadcrumb sits and opens the Project page.

## Initial description
Build a second page like the dashboard, called "Project", with a button below "Dashboard" in the sidebar. It shows shortcuts to the project vision and all standards and doc files, and renders the .md files the same way as the dashboard and the pages that follow it. At the top, a TL;DR gives the key tech stack and the project goal (what the app is).

## Q&A (all rounds)
- **TL;DR source:** the entries under INDEX.md's Project Documentation section. The Vision entry gives the goal and the Tech Stack entry gives the stack.
- **Which docs:** all `.maister/docs/**/*.md`, grouped in this order: INDEX, project/, standards/<domain>/, then others alphabetically. Labels are humanized filenames.
- **Live refresh:** watch `.maister/docs/**` and re-publish the Project page or the doc that is open.
- **Links inside docs:** follow the reader's existing rules. A doc-to-doc link opens as a rendered doc, a link into a task opens the artifact, external links open in the browser, and other files open in the editor.
- **Multi-root:** one section per workspace folder that has `.maister/docs`.
- **Empty state:** the nav item always shows. With no docs, the page shows an honest empty state with a `/maister:init` hint. A folder whose INDEX.md has no entries shows a partial TL;DR with an honest "missing" note.
- **Reader breadcrumb:** "Project › path", plus a "← Project" back button that matches the dashboard's back control.
- **Tests:** update the pinned counts on purpose: `manifest.test.ts`, `surfaces.spec.ts`, and the harness `BundleName` union.

## Visual assets
The mockups are binding: see `analysis/design-context/INDEX.md` (5 screens).

## Reusability
- `panel.ts`: modes, history, `bundleHtml`
- `render.ts`: `renderArtifact`, `RenderCache`, `classifyLink`. The link base needs generalizing.
- `reader.ts`
- `messages.ts`: `resolveInside`
- `navTree.ts`
- `parseSummary.ts`: style of the heading parsing
- `components.ts`
- `watcher.ts`

## Scope boundaries
- **Included:** the nav node, the project and doc panel modes, the projectMode bundle, the docs parser, the `openProject`/`openDoc` messages, the docs watcher, strings, and tests.
- **Excluded:** editing docs, search, showing docs as source, a palette or title-bar entry, and new dependencies.

## Technical considerations
- About 12 mode branches in `panel.ts` must handle the new modes.
- Path containment is limited to `.maister/docs` and to `.md` files.
- `readLocation` must restore the new modes after a reload.
- Keep `vscode` out of the model and render modules.
