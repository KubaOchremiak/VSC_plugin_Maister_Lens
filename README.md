# Maister Lens

A single view layer over Maister tasks and artifacts inside VS Code.

Maister writes its work into `.maister/tasks/<type>/<date>-<slug>/` — a state file, markdown
artifacts, an HTML dashboard. Maister Lens reads those folders and answers "what is my task
doing?" from the sidebar, opens every artifact **rendered** instead of as source, and hands the
next `/maister:*` command to an assistant or a terminal.

Maister Lens is **read-only**. It never writes a task file, never edits state, and never runs a
workflow itself.

## The two sidebar views

| View | What it shows |
|---|---|
| **Now** (tree) | Every unfinished task (`in_progress`, `pending`, `blocked`), newest write first. Each task expands to its progress line, its last recorded decision, up to five recently modified artifacts and its open-risk count. The view badge carries the unfinished count. An inline ▶ runs the task's next action. |
| **Overview** (webview) | Orientation and the full portfolio in one column: a search box over task titles, descriptions, tags, recorded decisions, risks and artifact TL;DRs; Mine / Everyone; STATUS, TYPE and ATTENTION filter tiles; and the filtered task list grouped by type, status, author or month. |

Both views render from an in-memory index of the workspace — they never read files themselves.

## The four panel modes

One panel (`Maister · …`) is reused for everything, with its own back/forward history in the
editor title bar.

| Mode | What it shows |
|---|---|
| **Task** | Maister's own `dashboard.html` for that task, hosted verbatim in a sandboxed webview. When the file is missing or of an unrecognised vintage, a built-in fallback view renders the same facts from the state file: banner, phases, decisions, risks, artifacts and the raw state. |
| **Artifact** | A markdown artifact rendered as a document — breadcrumb, key-artifact chips, a pinned summary card and the body. An artifact with an `.html` companion can be toggled between the two with **Toggle Styled / Markdown View**. |
| **Dashboard** | A cross-task dashboard: four KPI tiles, the active filter chips, four charts and a task table. It shares one filter with Overview, so a tile pressed in the sidebar is reflected here. |
| **Risks** | Open risks across all tasks, or scoped to one task, grouped by task. Resolved risks appear only while **Show resolved** is on. |

Artifacts are always shown rendered through the extension's own navigation. **Open Source File**
is the one, explicit way to reach the underlying text in a normal editor.

## Settings

| Setting | Type | Default | Meaning |
|---|---|---|---|
| `maisterLens.staleness.quietDays` | number (1–365) | `3` | An unfinished task is flagged quiet after this many days without activity. |
| `maisterLens.attribution.enabled` | boolean | `true` | Derive task authors from git history. Turning it off hides Mine / Everyone and leaves every task's author unknown. |
| `maisterLens.launch.targetOrder` | array | `["claudeCode", "copilotChat", "terminal", "clipboard"]` | Launch destination preference order; the first available target is used. |
| `maisterLens.launch.autoSubmit` | boolean | `false` | Submit launched commands immediately where the target allows it. Claude Code always pre-fills. |
| `maisterLens.launch.terminalName` | string | `""` | Preferred terminal name for the terminal launch target. |

## Launching workflows

Maister Lens composes `/maister:*` commands and hands them to an assistant or a terminal. It
never writes a task file and never runs a workflow itself.

`maisterLens.launch.targetOrder` sets the preference order; the first available target is used,
and a target that fails hands the command to the next one. The clipboard always succeeds, so a
launch never fails silently. After every dispatch a status-bar message names the destination.

| Target | What happens |
|---|---|
| `claudeCode` | Opens a new Claude Code conversation with the command pre-filled. Press Enter to run it. |
| `copilotChat` | Puts the command in the Copilot Chat box. `/maister:*` commands are Claude Code plugin skills, so Copilot can only carry the workflow out if your Copilot setup provides Maister's skills. |
| `terminal` | Types the command into the terminal you choose, or into a new terminal that starts Claude Code. `maisterLens.launch.autoSubmit` decides whether it is submitted. |
| `clipboard` | Copies the command. |

**Known limitation — the Claude Code URI entry point.** When the Claude Code extension is
installed but its editor command is missing or fails, Maister Lens falls back to a
`…://anthropic.claude-code/open?prompt=…` URI. That URI is handled by Claude Code's **primary
editor** — the prompt lands in the existing Claude Code editor rather than in a new tab like the
command path. VS Code cannot report whether a URI was handled at all, so this attempt is always
treated as a success and the launch chain ends there; it is only ever tried when the Claude Code
extension is installed.

**Known limitation — Copilot Chat availability.** `workbench.action.chat.open` is registered
even when Copilot cannot answer a `/maister:*` command, so availability detection is weak.
Maister Lens shows a one-time notice the first time it dispatches there.

## Workspace Trust

In an **untrusted** workspace Maister Lens keeps working, with two capabilities withdrawn:

- **No model-authored HTML is executed.** Maister's own `dashboard.html` and HTML companions
  contain model-written scripts, so Task mode always uses the built-in fallback view and
  artifacts render in the markdown variant only.
- **No launching.** Every launch command is hidden, and the commands themselves refuse if
  invoked another way.

Indexing, both sidebar views, Dashboard mode, Risks mode and markdown reading are unaffected.

Maister Lens declares `"extensionKind": ["workspace"]`, so under Remote-SSH, WSL or Dev
Containers it runs where the files live. Virtual workspaces are not supported: attribution
shells out to `git`, and indexing needs a real filesystem watcher.

## Runtime dependencies

Exactly two, both load-bearing:

- **`yaml`** — Maister's state files are YAML, including flow mappings and multi-line scalars.
  Hand-rolling that parser was the alternative.
- **`markdown-it`** — CommonMark + GFM tables for the artifact reader. It is configured
  `html: false`, which escapes any raw HTML in the markdown; that is the sanitization strategy,
  so no HTML sanitizer dependency is needed.

## Development

```sh
npm install
npm run build          # esbuild bundle into dist/
npm run watch
npm run lint
```

| Script | What it runs |
|---|---|
| `npm test` | Unit tests (mocha, no VS Code host) over the parsers, query engine, link rewriting, shell quoting and launch target order. |
| `npm run test:integration` | Integration tests in a real extension host (`@vscode/test-electron`, pinned stable build): activation, indexing, watcher, tree contents, panel messages, Workspace Trust gating. |
| `npm run test:min` | The same integration suite against the declared engine floor, VS Code 1.90.0. |
| `npm run test:dom` | Structural DOM tests (Playwright over each webview bundle's generated HTML). **The first run needs `npx playwright install chromium`.** |
| `npm run bench` | The non-gating performance benchmark over 300 generated task folders. |

Criteria that no harness can reach — hosted-dashboard rendering, the Claude Code pre-fill against
a real installation, the four themes, a screen-reader pass and mockup comparison — are a signed
manual checklist, not automation debt.

### Benchmark

Measured on Darwin arm64 over 300 generated task folders. Reported, **not** a gate:

| Measurement | Result | Target |
|---|---|---|
| Cold index | 229.3 ms | < 5 s |
| Warm start from the cached snapshot | 14.1 ms | < 300 ms |
| Decision-text query | 1.3 ms | < 100 ms |

## Known limitations (first release)

1. Standalone `.maister/tasks/mockups/*` folders have no state file and are not listed.
2. `quick-dev`, `quick-plan` and `quick-bugfix` leave no task directory, so they are invisible.
3. Maister's hosted dashboard and HTML companions follow the **OS** light/dark setting, not the
   VS Code theme. Only extension-built surfaces use VS Code's theme variables.
4. No full-text search over artifact bodies — search covers task titles, descriptions, tags,
   recorded decisions, risks and the TL;DR of each summarised artifact.
5. No syntax highlighting and no Mermaid rendering; both render as plain code blocks.
6. Remote images and fonts are not loaded; an image that cannot be shown is replaced by its alt
   text.
7. Attribution credits whoever first committed a task's state file.
8. A skipped phase and an unrecorded completion are indistinguishable — both read
   "not recorded".
9. The workflow registry is pinned to Maister 2.2.3. A newer phase id renders by its raw id with
   a warning rather than a friendly name.
10. The Claude Code launch target relies on an undocumented command, `claude-vscode.editor.open`.
    It ignores the prompt when that Claude Code session is already open, which is why the target
    is attempted only when the extension is installed.
11. Copilot Chat can carry out Maister commands only if your Copilot setup provides Maister's
    skills.
12. `npm run test:min` runs its untrusted-workspace pass on the pinned VS Code build rather than
    on 1.90.0 — the untrusted host launcher reads the pinned version. The engine-floor claim is
    unaffected (the untrusted assertions are not version-sensitive), but the gap is real.

## License

MIT. See [LICENSE](LICENSE).
