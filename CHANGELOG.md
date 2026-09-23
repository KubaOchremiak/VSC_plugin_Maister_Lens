# Changelog

All notable changes to Maister Lens are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

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
  non-gating 300-task benchmark, and a signed manual verification checklist for the criteria no
  harness can reach.

### Known limitations

See the "Known limitations" section of [README.md](https://github.com/maister/maister-lens#readme).
