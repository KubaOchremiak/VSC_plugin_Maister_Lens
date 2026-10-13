# Changelog

All notable changes to Maister Lens are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Edit button** — every markdown page in the reader (task artifacts and `.maister/docs`
  standards and project docs) has a top-right Edit button that opens the file in VS Code's
  text editor.

## [0.1.1] — 2026-09-28

### Fixed

- Opening a task moves the reusable panel to the active editor group, including when
  the panel was previously opened or restored in another group. Background refreshes
  preserve its location and focus.
- The companion back button now reads "← Lens Dashboard".
- Relative links inside a hosted HTML companion resolve against the companion's own folder;
  a refused link now shows a warning instead of failing silently.
- Group expanders (Dashboard, Follow-ups) hide and reveal their lists again.

### Added

- Lifecycle lens Marketplace artwork and a theme-colored Activity Bar icon.
- Reproducible packaging commands, release checklist and support documentation.

- **Overview view** — a new single-row tree at the top of the Maister container that opens the
  cross-task Dashboard panel. It reuses the existing **Maister: Open Dashboard** command and
  declares no new command of its own. On an existing profile VS Code keeps your sidebar
  arrangement, so the view appears first only on a fresh profile; **Views: Reset View Locations**
  restores the intended order.
- **Back links on task panels** — a "← Dashboard" breadcrumb is now the first control on a task
  panel, both in the built-in fallback task view and on a hosted `dashboard.html`, so the
  cross-task Dashboard is always one keystroke away.
- **Project page** — a **Project** item in the sidebar opens a page with a TL;DR of the
  project's goal and tech stack and every `.maister/docs` file grouped by folder. Each doc opens
  rendered in the panel with a **← Project** link, and the page refreshes live when the docs change.

### Changed

- **Follow-ups replaces Risks** — the Risks view is now **Follow-ups**: what completed tasks
  left open (unfixed verification issues, unresolved risks, deferred follow-up decisions, E2E
  follow-ups), with a verdict breakdown. The Dashboard KPI tile, `maister.openFollowUps` command
  and per-task links point to it.
- **Breaking:** the `maister.openRisks` command id is removed; it is replaced by
  `maister.openFollowUps`. Update any custom keybindings or tasks that invoke the old id.
- The Now tree no longer shows a per-task open-risks node.
- Filter labels and counts use matching theme colors in default, hover and selected states.
- Native webview controls follow light, dark and high-contrast theme classes.
- Repository links and MIT holder now identify Jakub Ochremiak (Maister Lens); the
  publisher ID is an unregistered placeholder pending account setup.

- The **Overview** webview is now called **Tasks**, freeing the name for the new navigation view.

## [0.1.0] — 2026-09-23

First release.

### Added

- **Now view** — a tree of every unfinished Maister task, newest write first, with progress,
  the last recorded decision, recently modified artifacts, open-risk counts and an inline
  next-action button. A view badge carries the unfinished count.
- **Overview view** — search across task titles, descriptions, tags, decisions, risks and
  artifact TL;DRs; Mine / Everyone; status, type and attention filter tiles; and the filtered
  task list grouped by type, status, author or month.
- **Panel with four modes** — Task (Maister's own `dashboard.html` hosted verbatim, with a
  built-in fallback view when it is missing or of an unrecognised vintage), Artifact (markdown
  rendered as a document, with an `.html` companion toggle), Dashboard (cross-task KPIs, charts
  and task table sharing one filter with Overview) and Risks (open risks grouped by task).
- **Launching** — `/maister:*` commands composed from a task's next action or from
  **Start Workflow…**, dispatched to Claude Code, Copilot Chat, a terminal or the clipboard in
  the configured order.
- **Settings** — `maisterLens.staleness.quietDays`, `maisterLens.attribution.enabled`,
  `maisterLens.launch.targetOrder`, `maisterLens.launch.autoSubmit` and
  `maisterLens.launch.terminalName`.
- **Workspace Trust support** — declared as `limited`: in an untrusted workspace no
  model-authored HTML is executed and launching is disabled, while indexing, both views,
  Dashboard, Risks and markdown reading continue to work.
- **Tests** — mocha unit tests, a `@vscode/test-electron` integration suite (plus an engine-floor
  run on VS Code 1.90.0), a Playwright structural DOM suite over the generated webview HTML, a
  non-gating 300-task benchmark, and a manual verification checklist for the criteria no
  harness can reach.

### Known limitations

See the "Known limitations" section of [README.md](https://github.com/KubaOchremiak/VSC_Maister_plugin#readme).
