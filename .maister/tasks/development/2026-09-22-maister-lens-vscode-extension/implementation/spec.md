# Specification: Maister Lens — VS Code Extension

## TL;DR
Build the Maister Lens extension exactly as `analysis/design-context/feature-spec.md` §§ 1–8 describes it, with the amendments A1–A18 below taking precedence wherever the two differ.
They close the ten spec gaps and the audit's two criticals: `folderUri` is the task identity, one consolidated webview message table is the security allowlist, `risksMode.ts` joins the § 1.4 layout, task-argument commands are hidden from the Command Palette, one shared open-risks function feeds every count, AC13 applies to Maister Lens's own strings only, list-shaped `phase_summaries` entries have explicit extraction semantics, and every AC names a harness that can actually run it.
Nothing is reusable in this repo — it is greenfield — so "reuse" means Maister's own `dashboard.html` hosted unmodified, the two real task folders as fixtures, shared webview primitives across the five bundles, and VS Code theme variables as the only design tokens.
Runtime dependencies stay `yaml` + `markdown-it`; charts are hand-written SVG; the host never parses or evaluates `dashboard-data.js`.
Tests: mocha unit (no host) + `@vscode/test-electron` integration on a pinned stable build, AC7/AC9 measured by a non-gating benchmark, a structural DOM pass over generated webview HTML, an explicit manual checklist, and 2–8 focused tests per task group.

## Key Decisions
- feature-spec.md is referenced, not restated — this spec only records the delta (§ "Amendments"), so implementation follows the amendment where the two disagree.
- Task identity is `TaskRef.folderUri` everywhere (index keys, persisted entries, `PanelLocation`, every message payload); `relPath` survives only for display and for composing `/maister:*` commands — it collides across multi-root workspaces.
- One consolidated webview message table covers all five surfaces in both directions and doubles as the security allowlist; anything absent from it is dropped and logged.
- Risks-mode filtering (text, task-status toggles, show-resolved, group-by) stays inside the webview over the full `risks` payload; only the workflow-type facet round-trips through the shared `setFilter`.
- Task-argument launch commands are hidden from the Command Palette (`commandPalette: when: false`) and reachable only from ▶ buttons — the palette carries no task context and Quick Picks were declined in design decision D7.
- One `openRisksOf(task)` function (unresolved state risks + artifact § 7 risks, deduplicated per task) feeds the Now row, the Dashboard KPI tile and Risks mode, so a count always matches what a click opens.
- AC13 governs Maister Lens's own user-facing strings, which live in one module a unit test scans; Maister's own phase names ("Running E2E tests") are constant input, shown verbatim, and exempt.
- Claude Code launch chain: `claude-vscode.editor.open(undefined, prompt)` → an `env.uriScheme`-built URI (only when the extension is installed but the command is missing or throws, treated as success) → the next entry in `targetOrder`.
- Every acceptance criterion names the harness that can actually run it (A16): the host-observable half in the integration suite, the DOM half as structural assertions over generated webview HTML, and the remainder explicitly manual — the extension host cannot assert inside a webview DOM.
- No chart library, no sanitizer, no status-bar item, no Quick Pick navigation, no writes to any Maister file.

## Open Questions / Risks
- The Claude Code command signature is undocumented (observed in 2.1.278) and ignores the prompt when a session is already open; AC11's pre-fill path can only be verified manually, plus a mocked `executeCommand` unit test.
- `workbench.action.chat.open` is registered in VS Code 1.138 whether or not Copilot can answer, so the availability check is weak; the one-time caveat notice is the only mitigation.
- `env.openExternal` resolves `true` even when nothing handles the URI, so the Claude URI attempt effectively ends the chain — hence the gate on the extension being installed.
- Node v26.7.0 is very new: esbuild, mocha and `@vscode/test-electron` must be smoke-tested before any feature code is written.
- The mockups' `/screen/*` links are preview-server leftovers (non-navigable) and their "Browse" wording is stale — Browse was merged into Overview; the spec wins on wording, the mockups win on layout.
- The hosted dashboard depends on `asWebviewUri` + `<base href>` tolerating the real loader's `?t=<epoch>` cache-buster — unverified and unverifiable without a running host, and AC3 and AC4 both rest on it. De-risked in the first smoke test with a pre-authorised contingency (A18).
- Claude Code 2.1.278 declares `engines.vscode: ^1.94.0`, above this extension's `^1.90.0` floor, so the optional `test:min` run can never exercise the `claudeCode` target (A10).
- The workflow registry is pinned to Maister 2.2.3; a newer Maister's phases render by raw id with a warning rather than being hidden.

---

## Goal
Ship a TypeScript VS Code extension that makes every Maister task in a workspace visible, readable and actionable inside the editor — always rendered, never as source — and puts each task's next `/maister:*` action one click away.

## User Stories
- As **Marek** (engineering contributor), I want every unfinished task with its current phase, last decision, recent artifacts and open risks in a sidebar tree, so I can see what is being written right now and resume it in one click.
- As **Ada** (business-oriented contributor), I want to search and filter all tasks from the sidebar and read any artifact rendered — with its TL;DR, decisions and risks pinned — so I can follow engineering output without opening raw markdown.
- As **Irena** (delivery lead), I want KPI tiles, filter charts and a portfolio-wide list of open risks, so I can see failed verifications, quiet tasks and unresolved risks in aggregate.
- As **any contributor**, I want Maister's own `dashboard.html` shown unmodified inside the editor with live data, so nothing is lost relative to opening it in a browser.
- As **a user of an untrusted workspace**, I want tasks listed and markdown rendered while no model-authored HTML executes and no workflow can be launched.

## Core Requirements

Each requirement is satisfied by the referenced feature-spec section **as amended** by the A-items below.

| # | Requirement | Source |
|---|---|---|
| R1 | Extension manifest: id `maister-lens`, engine `^1.90.0`, TS strict, esbuild two targets, activation events incl. `onWebviewPanel:maister.panel`, capabilities `untrustedWorkspaces: limited` / `virtualWorkspaces: false`, `extensionKind: ["workspace"]` | § 1.1–1.2, § 1.6 |
| R2 | Contributions: activitybar container `maister`, views `maister.now` (tree) + `maister.overview` (webview), all commands, menus (incl. the Now title bar, **A15**), context keys, `viewsWelcome`, five settings | § 1.3, § 1.6 + **A3, A4, A15** |
| R3 | Source layout under `src/` per § 1.4 | § 1.4 + **A3, A5, A6, A13** |
| R4 | Domain types and workflow registry (5 workflows, phases, activeForms, icons, HERO_MAP heroes), pinned to Maister 2.2.3 | § 2.1–2.2 |
| R5 | `parseState` never throws; normalization rules N1–N15; every oddity recorded as a `ParseIssue` | § 2.3 + **A8, A14, A17** |
| R6 | Phase status derivation with `not_recorded` gaps and no guessed skips | § 2.4 + **A17** |
| R7 | `parseSummary`: first 8 KB, leading-region heading match, TL;DR / Key Decisions / Risks, both "Open Questions / Risks" and "Open Questions & Risks" | § 2.5 + **A8** |
| R8 | Two-tier index: tier 1 `Task` per folder (persisted), tier 2 `TaskDetail` LRU(20) | § 3.1 |
| R9 | Discovery by `.maister/tasks/*/*/orchestrator-state.yml` with `null` excludes, per workspace folder | § 3.2 |
| R10 | Persisted index at `storageUri/index-v1.json`: schema+registry version gate, mtime/size invalidation, atomic debounced write, flush on deactivate, silent rebuild on corruption | § 3.3 + **A1** |
| R11 | Load algorithm: instant cached paint → discover → stat (16) → reconcile (8) → publish fresh, under `withProgress` on the Overview view | § 3.4 |
| R12 | Watcher on `.maister/tasks/**`: 250 ms per-task debounce, ≤ 1 snapshot per 500 ms, 60 s relative-time refresh, `watcherExclude` one-time notice | § 3.5 |
| R13 | Query engine over tier 1: AND text tokens, facets, ranking, staleness; no full text | § 3.7 |
| R14 | Git attribution: one `execFile` per repo, `isMe` by `user.email`, degraded cases, `attribution.enabled` setting | § 3.8 |
| R15 | Now tree: unfinished tasks, view badge, node properties, children Progress / Last decision / Recent artifacts / Open risks, accessible labels | § 4.1, § 4.3 + **A9, A5** |
| R16 | Overview webview: search, Mine/Everyone, status/type/attention tiles as toggles, grouped task list with rows, next-action buttons, hero expander, empty states, shared `TaskQuery` | § 4.2 + **A2** |
| R17 | Panel singleton `maister.panel` with four modes, own history (max 50), native editor-title actions, serializer restore | § 5.1 + **A1** |
| R18 | Task mode: `recognize()` structural signature; hosted dashboard with exactly three HTML insertions + shim (nonce patching, refresh bridge, link interception, API ownership) | § 5.2–5.3 + **A18** |
| R19 | Fallback task view: banner, header with next action, phases, hero cards, decisions, risks, all-artifacts listing, raw-state disclosure | § 5.4 + **A2** |
| R20 | Dashboard mode: 4 KPI tiles, 4 hand-written SVG charts with Table links and bar-as-filter behaviour, filtered task table with Next column | § 5.5 + **A5** |
| R21 | Risks mode: breadcrumb, 4 KPI tiles, local filter bar, groups by task ordered by `activityMtime`, no severity or age | § 5.7 + **A2, A3, A5** |
| R22 | Artifact reader: variants and defaults, markdown pipeline (`html:false`, checklists, anchors, link rewriting, image and size rules, LRU 30), reader layout, live update with scroll restore | § 6 |
| R23 | HTML companion re-hosting with the same three insertions; refused for `<iframe>` or > 2 MB | § 6.4 |
| R24 | Launch: composed `/maister:*` text, next-action derivation, Start Workflow flow, target resolution chain, terminal targeting and shell quoting, visible outcome message | § 7 + **A7** |
| R25 | Degraded modes, workspace trust gating, error-handling rules, security controls, accessibility | § 8.1–8.4 |
| R26 | Test suites, fixtures and performance benchmark; every AC verified by a harness that can execute it | § 8.6 + **A10, A16** |
| R27 | Packaging and repo hygiene: MIT LICENSE, publisher placeholder, `.gitignore`, `.vscodeignore`, README, CHANGELOG, project-doc corrections | **A11** |

---

## Amendments to feature-spec.md

These supersede feature-spec.md wherever they differ. Everything not listed here stands as written.

### A1 — Task identity is `folderUri` (resolves C-1, gap "Incomplete Features 1")

`TaskRef.folderUri` (the absolute URI string of the task directory) is the sole identity key. It replaces `relPath` in:

| Place | Was | Becomes |
|---|---|---|
| `IndexSnapshot.tasks` | `ReadonlyMap<relPath, Task>` | `ReadonlyMap<folderUri, Task>` |
| `TaskIndex.getDetail(…)` | `relPath` | `folderUri` |
| `onDidChange.changed` | `readonly relPath[]` | `readonly folderUri[]` |
| `PersistedIndex.entries` | `Record<relPath, …>` | `Record<folderUri, …>` |
| `PanelLocation` (`task`, `artifact`, `risks`) | `relPath` | `folderUri` |
| Every webview message payload (A2) | `relPath` | `folderUri` |
| Tree item `id` | `now:{relPath}` | `now:{folderUri}` |

`relPath` (workspace-folder-relative) remains on `TaskRef` and is used **only** for display and for composing `/maister:work {relPath}`-style commands. Index-membership validation stays a single map lookup on `folderUri`. Persisted entries whose `folderUri` no longer resolves to an open workspace folder are dropped on load.

### A2 — Consolidated webview message table (resolves C-2, gaps 1 and 2)

This table replaces § 4.2's `{type:'overview'}` wording, the § 5.6 table and the § 6.5 additions. **It is the security allowlist**: `panel/messages.ts` (new module) exports one `validate(raw): Message | null` used by the panel *and* the Overview view provider. A message is accepted only if its `type` is in this table, its payload shape matches exactly (no extra keys required, unknown keys ignored, every listed key present and of the right primitive type), and every rule in the last column passes. Anything else is dropped and logged to the output channel — never acted on.

**Webview → extension**

| `type` | Payload | Senders | Host-side validation |
|---|---|---|---|
| `ready` | — | all five bundles | none; triggers the initial push for that surface |
| `navigate` | `{ href: string }` | shim (hosted dashboard, hosted companion) | resolve `href` against the hosting document's directory; must normalize to a path **inside the hosting task folder**; else ignore + log. Routed per § 5.3's target table **as narrowed by A2.1** |
| `openTask` | `{ folderUri: string }` | overview, fallbackTask, dashboardMode, risksMode, reader (breadcrumb, hero chip) | `folderUri` ∈ index |
| `openArtifact` | `{ folderUri, artifactRelPath, variant: 'md' \| 'html', anchor?: string }` | overview (hero expander row), fallbackTask, reader, risksMode (risk source link) | `folderUri` ∈ index; `artifactRelPath` normalizes inside that task folder; `variant` in enum; `anchor` matches `/^[-\w.]{1,128}$/` |
| `openSource` | `{ folderUri, artifactRelPath?: string }` | fallbackTask (Open state file), reader toolbar | as above; omitted `artifactRelPath` means `orchestrator-state.yml` |
| `openFile` | `{ workspaceRelPath: string }` | reader (`data-file` links) | resolves inside some workspace folder; else refuse + log |
| `openExternal` | `{ url: string }` | reader (`data-external` links) | scheme is `http:` or `https:` only |
| `openInBrowser` | `{ folderUri, artifactRelPath: string }` | fallbackTask banner ("Open dashboard in browser") | **requires `isWorkspaceTrusted`** (A2.2); `folderUri` ∈ index; path normalizes inside the task folder **and** ends `.html`; dispatched via `env.openExternal` on the file URI |
| `setFilter` | `{ patch: Partial<TaskQuery> }` | overview, dashboardMode, risksMode (**type facet only**) | each patch key is a known `TaskQuery` field; `text` is a string ≤ 200 chars; `types` / `statuses` / `verdicts` are arrays of ≤ 16 enum members; `author` is `'me'`, `'others'`, or `{ email }` with `email` a string ≤ 320 chars; `quietAtLeastDays` is a finite number in 0–3650; `createdAfter` / `createdBefore` parse as dates |
| `clearFilter` | — | overview, dashboardMode ("Clear all") | none |
| `setGroupBy` | `{ groupBy: 'type' \| 'status' \| 'author' \| 'month' }` | overview | enum; persisted to `workspaceState` |
| `openDashboard` | — | overview ("Show all {n}", "Show all in Dashboard"), risksMode breadcrumb | none; opens Dashboard mode with the current shared filter |
| `openRisks` | `{ folderUri?: string }` | dashboardMode (Open risks KPI tile), fallbackTask (Risks heading), overview | when present, `folderUri` ∈ index (scopes the mode to that task) |
| `startWorkflow` | — | overview empty state | requires `isWorkspaceTrusted`; else drop + log |
| `runNextAction` | `{ folderUri }` | overview row, fallbackTask header, dashboardMode Next cell, risksMode group header | `folderUri` ∈ index; requires `isWorkspaceTrusted`. **The host recomputes the action from the index** — the webview never supplies command text |

**Extension → webview**

| `type` | Payload | Receiver |
|---|---|---|
| `overview` | `{ stats, groups, activeFilter, groupBy, freshness }` — row fields only, ≤ 50 tasks per group, never full `Task` objects (renames § 5.6's `stats`) | Overview |
| `task` | fallback-view payload built from `Task` + `TaskDetail` per § 5.4 | fallbackTask |
| `dashboard` | `{ kpis, charts, rows, filter }` — charts pre-aggregated over the whole index, rows capped at 1,000 | dashboardMode |
| `risks` | `{ kpis, groups, filter }` — the **full** unresolved-and-resolved risk set for the current scope (A5), so local filtering needs no round-trip | risksMode |
| `render` | the § 6.2 payload | reader |
| `refresh` | — | shim (calls `window.loadData?.(false)`) |

**Webview-local state — deliberately no message:** Overview group collapse and search text, Dashboard table sort, Risks-mode text search / task-status toggles / show-resolved / group-by, and reader `scrollY`. All persist via `vscode.getState()/setState()`.

**A2.1 — `navigate` containment wins over § 5.3's cross-task row.** § 5.3's target row *"`dashboard.html` of this **or another** task → Task mode for that task"* is narrowed to **this task only**. A link pointing at another task's `dashboard.html` is outside the hosting task folder, so it is ignored and logged like any other out-of-folder target — the containment rule is the single final word, and Overview is the supported way to reach another task. This keeps one rule instead of two and matches the § 8.3 security posture.

**A2.2 — trust rules on the outbound-content messages.** `openInBrowser` joins `startWorkflow` and `runNextAction` as trust-gated: in an untrusted workspace the message is dropped and logged, **and the fallback banner's "Open dashboard in browser" button is not rendered at all**. This closes the hole that § 8.1 otherwise opens — because an untrusted workspace *forces* the fallback view, its banner would be the most reachable path to handing model-authored HTML to the system browser, outside the sandbox. With this rule, § 8.1's "the hosted dashboard and HTML companions are not executed" and § 8.3's "disabled entirely in untrusted workspaces" hold as written.
`openExternal` from the reader stays available in untrusted workspaces: it carries only `http:`/`https:` URLs extracted from markdown, never task-authored HTML, and VS Code's own trusted-domain prompt applies. This is a deliberate exception, recorded here so § 8.3 is not read as forbidding it.

### A3 — `risksMode.ts` and `maister.openRisks` placements (resolves gaps 2 and 3)

- `src/webview/risksMode.ts` is added to the § 1.4 layout as the fifth browser bundle: `overview.ts, dashboardMode.ts, fallbackTask.ts, reader.ts, risksMode.ts, shim.ts`.
- `maister.openRisks` is contributed in `menus["view/title"]` at `navigation@2` for `view == maister.overview` (icon `warning`), in `menus["editor/title"]` `navigation` with `when: activeWebviewPanelId == 'maister.panel'`, and stays **visible** in the Command Palette (it takes no task argument; invoked bare it opens Risks mode unscoped).
- § 5.6 and § 5.7 are renumbered so the message protocol (now A2) reads after Risks mode.

### A4 — Task-argument commands hidden from the Command Palette (resolves gap 4, decision I-1)

`maister.openTask`, `maister.openArtifact`, `maister.openArtifactSource`, `maister.revealInExplorer`, `maister.runNextAction`, `maister.resumeTask`, `maister.startDevelopmentFromDesign`, `maister.designFromResearch` and `maister.developFromResearch` each get `menus.commandPalette: { command: …, when: "false" }`. They are reachable only from ▶ / context-menu surfaces: Now tree items, Overview rows, the fallback task view header, Dashboard **Next** cells, Risks group headers and the panel editor title.

Palette-visible commands are exactly: `maister.openDashboard`, `maister.openRisks`, `maister.refresh`, `maister.startWorkflow` (`when: isWorkspaceTrusted`), `maister.overview.groupBy`, `maister.overview.clearFilter`, `maister.panel.back`, `maister.panel.forward`, `maister.panel.toggleVariant`. The § 1.3 "Palette … when next action is Resume" wording is withdrawn.

### A5 — One definition of "open risks" (resolves gap 5, decision I-2)

`src/model/risks.ts` (new module) exports:

```
collectRisks(task): Risk[]           // state risks (phase_summaries) + every registered artifact's § 7 risks,
                                     //  deduplicated per task on normalized text; the artifact wins as `source`
openRiskCount(task): number          // collectRisks(task).filter(r => !r.resolved).length
```

`collectRisks` is the single source for: the Now tree's "{n} open risks" child (§ 4.1), the Dashboard **Open risks** KPI tile and its "across {k} tasks" context line (§ 5.5), and Risks mode's data and KPI tiles (§ 5.7). Each returned risk carries `{ text, resolved, source, sourceKind: 'state' | 'artifact', folderUri }`. Because every surface reads the same function, the number shown always equals the number of rows a click reveals (AC18).

### A6 — AC13 restated (resolves gap 6, decision I-3)

**AC13 (amended):** *No user-facing string authored by Maister Lens contains "running", "waiting", "stalled" or "abandoned".*

- **Exempt as constant input:** Maister's own phase names and `activeForm`s transcribed into `model/workflows.ts` — e.g. development phase 12 "Run E2E tests" / "Running E2E tests". They are displayed **verbatim**; paraphrasing them would break the honesty rule the AC exists to protect (the UI would name a phase Maister does not).
- **Also exempt:** task data (titles, descriptions, decisions, risks) — user content the extension only relays.
- **In scope:** every user-facing string Maister Lens authors, which all live in one module, `src/strings.ts` (new): view titles and welcome text, tree labels and descriptions, tooltips, accessible labels, banners, notifications, status-bar messages, webview copy and empty states. Webview bundles import from the same module.
- **Enforcement — one mechanism only:** a mocha unit test reads `src/strings.ts` and asserts no exported string value matches `/\b(running|waiting|stalled|abandoned)\b/i`. This is the mechanism the Phase-2 gate ratified (I-3 option *(i)*).
  The boundary — that no user-facing string is authored outside `strings.ts` — is a **code-review convention, not a test**. A whole-tree literal scan (I-3 option *(ii)*, which the gate did not choose) would need a TypeScript AST pass to distinguish a `TreeItem` label from a log line, codicon id or CSS class; specifying a second mechanism for an AC the first already satisfies would be a speculative addition under `global/minimal-implementation.md`.

### A7 — Launch chain (amends § 7.4, resolves gap 8, decision I-10)

**claudeCode target**, in order:

1. Available only if `extensions.getExtension('anthropic.claude-code')` exists. If not, skip to the next entry in `targetOrder`.
2. `await ext.activate()`, then `commands.executeCommand('claude-vscode.editor.open', undefined, prompt)`. Success ends the chain.
3. **URI fallback** — used only when step 1 passed but the command is absent from `commands.getCommands(true)` or threw: `env.openExternal(Uri.parse(`${env.uriScheme}://anthropic.claude-code/open?prompt=${encodeURIComponent(prompt)}`))`. Built from `env.uriScheme` so Insiders and VSCodium work. `openExternal` cannot report "unhandled", so this is **treated as success and ends the chain** — documented in README and § 8.5 as a known limitation.
4. Only if the extension is not installed does the chain advance to the next target.

**copilotChat:** `commands.executeCommand('workbench.action.chat.open', { query: prompt, isPartialQuery: !autoSubmit })`. Availability is `extensions.getExtension('GitHub.copilot-chat')` plus the command being registered — a **weak** check, because VS Code 1.138 registers the command regardless of whether chat can answer. Therefore the first time Copilot is used as a target, a one-time notice (tracked in `globalState`) states that `/maister:*` commands run only if the user's Copilot setup provides Maister's skills, with an **Adjust launch order** button opening the `targetOrder` setting.

**terminal** and **clipboard** are unchanged from § 7.5 / § 7.4. Every target is wrapped in try/catch; a throw is logged and the chain advances. `clipboard` always succeeds.

**Resume composition** is `/maister:work {relPath}` for all five types (§ 7.1, § 7.2, AC12) — *not* `/maister:{type}`.

### A8 — Tolerant parsing: the observed-drift test matrix (amends § 2.3, § 2.5, § 2.6)

The parser must tolerate all of the following; each row is both a rule and a required fixture.

| Drift | Rule | Fixture |
|---|---|---|
| `options` under `orchestrator.options` **or** top-level `options` | N7 — read both, `orchestrator.options` wins on conflict | hand-written, both levels |
| `phase_summaries` under any `*_context` key (`task_context`, `design_context`, `research_context`, `migration_context`, `performance_context`) or at the top level | N8 — first present wins, more than one records a warning | real product-design task + hand-written |
| Summary keys semantic (`gap_analysis`) or positional (`phase-3`) | N9 — key kept verbatim as `Decision.source` / `Risk.source`, never mapped to a phase | both real tasks |
| A summary entry that is a **list**, not a map | **N9 as extended by A14** — items are classified by shape and land in `decisions` / `risks` / `artifacts`; unclassifiable items raise a `warning` issue. Fixture assertion in A14 | snapshot of this development task |
| Phases starting at 0 (product-design) or 1 (all others) | § 2.4 derivation is registry-driven, not index-driven | both real tasks |
| `task_ids` absent, present-but-empty (`{}`), or partly filled; `auto_fix_attempts` absent, empty or partly filled | absent and empty are both ignored (N15), never an error; a populated `auto_fix_attempts` is surfaced per A17 | hand-written + real product-design task (`task_ids: {}`) |
| `orchestrator.failed_phases` non-empty | **A17** — recorded as a `warning` issue and surfaced as a fact; phase status stays `not_recorded` (no `failed` `PhaseStatus`) | hand-written, populated `failed_phases` |
| Migration tasks in `tasks/migrations/` while the type is `migration` | N1 — type from `dirSegment` via the registry (`migrations` → `migration`), never from the folder name alone | hand-written |
| `## Open Questions / Risks` and `## Open Questions & Risks` (and `and`) headings | § 2.5 heading regex covers `/`, `&`, `and` | hand-written pair |
| `dashboard-data.js` written as an unquoted JS object literal | **Never parsed or evaluated in the extension host**; loaded only inside the webview sandbox via the shim's nonce patch (§ 5.3) | real product-design task |
| Corrupt / truncated YAML, empty file | Task returned with `status: 'unknown'`, folder-derived title, one `error` issue; every other task still indexes | hand-written |
| Tasks with no `dashboard.html` (`html_output: false`, 2.1.7-era) | `hasDashboard: false` → fallback view with the § 5.4 banner | hand-written |
| Unknown workflow directory segment | type `unknown`, still listed, warning recorded | hand-written |

The governing rule is unchanged: **the parser never throws**, and nothing guessed or skipped is silently discarded.

### A9 — Now tree "Recent artifacts" group node (resolves gap 8, decision I-5)

§ 4.1's third child becomes a collapsible group node labelled **Recent artifacts** with up to 5 artifact children (mtime descending), as the approved `sidebar-now-overview` mockup draws it. Progress, Last recorded decision and Open risks remain direct children of the task node.

### A10 — Test strategy (amends § 8.6, decisions I-6, I-7, I-11)

- **Unit** — mocha, no VS Code host, over the pure modules: `parseState` against every A8 fixture, `parseSummary`, phase derivation, `collectRisks`/`openRiskCount`, the query engine, `recognize()`, the three HTML insertions, link rewriting, shell quoting, next-action derivation, target-order resolution with mocked availability, message validation (`panel/messages.ts`), and the A6 string scan.
- **Integration** — `@vscode/test-electron` against a **downloaded pinned stable** build cached in `.vscode-test/` (`npm run test:integration`), plus an optional `npm run test:min` run against **1.90.0** to check the declared engine floor. `test:min` validates the engine claim only: Claude Code 2.1.278 declares `engines.vscode: ^1.94.0`, so the `claudeCode` launch branch can never load there — do not chase it.
  **Scope limit that drives A16:** the extension host has no handle on a webview's DOM. Integration tests assert what the host can observe — messages posted and received, commands executed, panel location and context keys, and the HTML string a generator produced — never rendered content or clicks.
- **DOM (structural)** — the harness for the webview half of A16. Playwright loads each bundle's **generated HTML** with fixture data in a plain browser page, with `acquireVsCodeApi` stubbed so posted messages are captured. Assertions are **structural, never pixel comparison**: named selectors exist, section and field order match, exact copy strings match `src/strings.ts`, every interactive element is a `<button>`/`<a>` with an accessible name, and a simulated activation posts the expected message payload. Comparison against the approved mockups moves to the manual checklist, because four of the five are declared *approximate layout* and all six render full VS Code window chrome rather than an isolated webview body — there is no common DOM to diff. This is not a third parallel harness: it is gated by the specific criteria A16 assigns to it.
- **Performance** — AC7 and AC9 are measured by a **benchmark script** (`npm run bench`), not enforced as CI gates. It generates 300 realistic task folders into a temp dir at run time and reports cold index, warm snapshot and query timings.
- **Fixtures** — `test/fixtures/tasks/` holds committed **snapshots** of the two real task folders in this repo (so the live tasks may keep changing) plus the hand-written hazard fixtures of A8. The 300-task perf set and the two-author git repository are **generated into temp dirs at run time**, never committed.
- **Manual checklist** — the criteria no harness reaches, recorded and signed off rather than implied to be automated: hosted-dashboard rendering **with its data and with no CSP violations**, and live refresh, against real tasks; a real click inside the hosted dashboard (AC4); Claude Code pre-fill (AC11); the four themes; a screen-reader pass (AC14); and a visual comparison of each surface against its mockup. **AC3's automated half is explicitly downgraded here**: § 8.7 assigns it "Integration + manual", and A16 narrows the integration half to the insertion and refresh-message assertions — rendering and CSP cleanliness are manual.
- `orchestrator.options.skip_test_suite` is `false` for this task, so verification runs the suites that cover the ACs.

### A11 — Packaging, hygiene and documentation (resolves gap 7, decisions I-8, I-9)

- `package.json`: `publisher: "maister"` (placeholder, to be changed before `vsce publish`), `license: "MIT"`; `LICENSE` file added.
- `.gitignore`: `node_modules/`, `dist/`, `out/`, `*.vsix`, `.vscode-test/`, `.playwright-mcp/`. The tracked `.playwright-mcp/console-*.log` is untracked with `git rm --cached`.
- `.vscodeignore` excludes `src/`, `test/`, `.vscode-test/`, analysis assets.
- `README.md` rewritten: what the extension does, the two views and four panel modes, settings, launch targets and their caveats, why each of the two runtime dependencies exists, known limitations (§ 8.5 plus the A7 URI caveat).
- `CHANGELOG.md` created with a `0.1.0` entry.
- At finalization: `.maister/docs/project/tech-stack.md` corrected (webviews, workspace-storage persistence, `yaml` + `markdown-it`, esbuild, mocha/test-electron) and `.maister/docs/project/vision.md`'s "and repository changes" line amended — git is used for attribution only. The § 8.6 testing standards are proposed via `/maister:standards-update`.

### A12 — No status-bar item (resolves gap 7 of the gap analysis, decision I-4)

The `◈ Maister: 2 unfinished` element in the sidebar mockup is **not** implemented. The `maister.now` view badge already carries the count, § 1.6 claims to be the complete manifest, and no AC covers it.

### A13 — Shared modules that the layout did not name

Three modules are added to § 1.4 because the amendments above require a single implementation each:

| Module | Purpose | Consumers |
|---|---|---|
| `src/strings.ts` | Every Maister Lens-authored user-facing string (A6) | extension host + all webview bundles |
| `src/model/risks.ts` | `collectRisks` / `openRiskCount` (A5) | nowTree, dashboardMode data builder, risksMode data builder |
| `src/panel/messages.ts` | `validate(raw)` against the A2 table; path containment and index-membership helpers | panel, overviewView |

### A14 — List-shaped `phase_summaries` entries: extraction semantics (extends N9)

N9 says a list-shaped entry is *accepted* but never said what is extracted from it. N10–N12 read `entry.decisions`, `entry.risks` and `entry.artifacts` — keys a list does not have — so a literal implementation would contribute **zero** decisions from this repo's own designated fixture and lose four real decisions silently, breaching § 2's "never silently discarded" contract and corrupting both the Now tree's *Last recorded decision* child and AC7's decision search.

**A `phase_summaries` entry may take exactly three shapes:**

| Shape | Handling |
|---|---|
| **Map** (the § 2.3 default) | Unchanged: `summary`, `decisions`, `risks`, `artifacts` read per N10–N12 |
| **List** | Treated as a heterogeneous item array, classified per the table below. `summary` is `null`; the entry key remains the `Decision.source` / `Risk.source` |
| **Scalar string** | Treated as the entry's `summary`; no decisions, risks or artifacts |

**Per-item classification for a list entry**, first match wins:

| Item | Classified as | Produces |
|---|---|---|
| Object with a `decision` key | Decision | `{ text: String(item.decision), rationale: item.rationale != null ? String(item.rationale) : null, source: <entry key> }` |
| Object with a `risk` or `text` key | Risk | N11's `resolved:` / `(resolved` rule applied to the value |
| Object with a `path` key | ArtifactRef | N12 rules: label, `html` twin, task-folder containment, dedup on path |
| Plain string | Decision, `rationale: null` | Maister's summary contract makes a bare list under a summary key a decision list |
| Anything else — `null`, a number, a nested list, or an object with none of the keys above | **Not classified** | Dropped **and** recorded as `{ severity: 'warning', field: 'phase_summaries.{key}[{i}]', message: 'list item not recognized as a decision, risk or artifact' }` |

Deduplication (N10) and the resolved rule (N11) apply to the results exactly as for map-shaped entries.

**Required fixture assertion** (`test/fixtures/tasks/` snapshot of this development task): parsing its `task_context.phase_summaries.clarifications` yields **exactly 4 decisions**, in file order, with texts `"Scope: full spec AC1-AC18"`, `"Tests: mocha unit + test-electron integration; perf as benchmark script"`, `"Claude Code launch: editor.open then URI fallback then next target"`, `"publisher placeholder maister, MIT"`, each with `rationale: "user choice"` and `source: "clarifications"`; **0 risks, 0 artifacts and 0 parse issues** from that entry. A second fixture mixes an unclassifiable item into a list and asserts the `warning` issue is present and the classifiable siblings still land.

### A15 — `maister.now` view-title menu (closes the § 1.6 completeness claim)

No section gave the `when`, `group`, icon or order for `view == maister.now`, though § 1.3 says `maister.refresh` and `maister.startWorkflow` appear there and § 1.6 claims to be a complete `package.json` source. `menus["view/title"]` gains, matching the `＋ ↻` the approved sidebar mockup renders:

| Command | Icon | Position | `when` |
|---|---|---|---|
| `maister.startWorkflow` | `add` | `navigation@1` | `view == maister.now && isWorkspaceTrusted` |
| `maister.refresh` | `refresh` | `navigation@2` | `view == maister.now` |

### A16 — Verification methods: which harness actually runs each AC

The extension host cannot click, query or assert inside a webview DOM — `@vscode/test-electron` runs mocha *in the host*, which can only post and receive messages. Eight criteria that § 8.7 assigns to "Integration" are assertions about rendered content. Each is therefore **split** into the part each harness can execute, and the remainder is named as manual. The **Verified by** column of the traceability table below is authoritative; § 8.7's column is superseded wherever they differ.

| Harness | What it may assert |
|---|---|
| **Unit** (mocha, no host) | Pure-function results over fixtures |
| **Integration** (`@vscode/test-electron`) | Messages posted and received, message validation outcomes, commands executed and their arguments, panel location and context keys, editor/tab state, index and watcher behaviour, and the **HTML string a generator produced** |
| **DOM** (Playwright over generated HTML, A10) | Structural assertions on that HTML in a real browser: selectors, section and field order, exact copy, accessible names, and the message payload a simulated activation posts through the stubbed `acquireVsCodeApi` |
| **Manual** (signed checklist) | Anything requiring a live host rendering third-party HTML, a real assistant, a real screen reader, or a human's eye |

The eight splits:

| AC | Integration half | DOM half | Manual remainder |
|---|---|---|---|
| AC3 | `hostDashboard` output carries exactly the three insertions with a fresh nonce; a `dashboard-data.js` change posts `refresh` within 1.5 s | — | Renders with its data, **no CSP violations**, re-renders within 1.5 s |
| AC4 | A `navigate` message resolving to an in-task `.md` sets panel location to `{mode:'artifact'}` — and opens **no** editor tab and **no** external browser | The shim's capture listener turns a click on the real dashboard's `a[target="_blank"]` into a `navigate` post with that `href` | One real click in a live host |
| AC5 | Every extension navigation to an artifact routes through `render.ts`; `vscode.open` is reached **only** via `openSource` | Reader HTML contains the summary card whenever `summary` is non-null | — |
| AC6 | The `task` payload for the `html_output:false` fixture carries banner reason, phases, decisions and risks | Generated fallback HTML renders all four sections in § 5.4 order | — |
| AC8 | `setFilter` / `clearFilter` / `openDashboard` round-trips; Overview and Dashboard read the same `TaskQuery` instance | A bar activation posts `setFilter` with the right patch; charts keep all-task counts while table rows are filtered; each **Table** link's numbers equal its chart's | — |
| AC14 | Tree items expose complete `accessibilityInformation.label`s | Every interactive element in every generated surface is a `<button>`/`<a>` with an accessible name and a tab-reachable order | Screen-reader pass |
| AC17 | `runNextAction` from each of the four surfaces executes the composed command; `openTask` launches nothing | Each surface renders exactly one next-action control per row, distinct from the title control | — |
| AC18 | The `risks` payload lists each risk once per task, ordered by `activityMtime`, with no severity or age field | **Show resolved** reveals resolved rows rendered struck through with a visible "Resolved" label | — |

AC1, AC2, AC7, AC9, AC10, AC12, AC13, AC15 and AC16 keep their § 8.7 methods as amended by A10 (AC7/AC9 benchmark, AC11 manual + mocked `executeCommand`).

### A17 — `failed_phases`, `started_phase` and `auto_fix_attempts` are observable (corrects § 2.1)

§ 2.1 justifies having no `failed` `PhaseStatus` by claiming *"a phase-level failure is not observable from state"*. That is **factually wrong**: both real state files carry `orchestrator.failed_phases`, and Maister's own `dashboard.html` renders a failed-phase glyph. `orchestrator.started_phase` (`phase-6`, `phase-8` in the two real files) and a populated `auto_fix_attempts` are likewise observable. N15 would drop all three without a `ParseIssue`, contradicting § 2's governing contract.

**The behaviour stands; the rationale and the discard do not.**

- **Corrected rationale:** `PhaseStatus` has no `failed` value because a failed phase is not a *durable* state — Maister retries it, and the field records attempts rather than an outcome the UI could keep asserting. A gap therefore stays `not_recorded`, which remains the honest answer.
- **Nothing silently discarded (N15 amended):** a non-empty `failed_phases` or a populated `auto_fix_attempts` records a `warning` `ParseIssue` naming the phases.
- **Surfaced as fact, not as a state:** the fallback view's header parse-issues link and its Raw state section state it plainly — *"{n} phases recorded as failed: phase-3, phase-7"* and *"auto-fix attempts recorded for phase-7"*. No new phase glyph, no new status word, and nothing AC13 forbids.
- **`started_phase` as a cross-check:** the § 2.4 derivation still decides `currentPhaseId`. When `started_phase` disagrees with it, a `warning` issue records both values — the derivation wins, and the disagreement is visible rather than hidden.
- A hazard fixture with populated `failed_phases` and `auto_fix_attempts` joins the A8 matrix.

### A18 — The hosted dashboard's resource-resolution dependency, de-risked first

Everything in R18 and R23 rests on one unverified behaviour: the real loader executes `s.src = "dashboard-data.js?t=" + Date.now()`, so the webview requests `…vscode-cdn.net/<taskFolder>/dashboard-data.js?t=1758…`. **The spec has never stated that the webview resource resolver tolerates the query component.** If it does not, AC3 and AC4 both fail and two of the four panel modes lose their primary path.

- **Stated as a dependency:** `asWebviewUri` + `<base href>` must resolve a relative `src` **with its query string intact**.
- **Moved into the first smoke test**, beside the Node 26 toolchain check and before any feature code: host the real `dashboard.html` from a committed fixture snapshot in a webview and confirm `window.MAISTER_DATA` is populated with the `?t=` cache-buster present.
- **Pre-authorised contingency**, in order, so the discovery costs no re-planning: (1) if the query breaks resolution, the shim — which already rewrites the node — strips the query before insertion, and live refresh then relies on the `refresh` message plus the resource loader serving from disk per request; (2) if resolution fails regardless, `recognize()` returns `'unrecognized'` for every vintage, Task mode degrades to the § 5.4 fallback with its **Open dashboard in browser** banner, and the loss is recorded in § 8.5.

---

## Visual Design

Mockups in `analysis/design-context/` are **binding inputs** for layout, copy, field order and states — implementation-planner will attach a `Visual References` block to every UI task group.

| ID | Mockup | Binding for | Fidelity |
|---|---|---|---|
| `screen:sidebar-now-overview` | `analysis/design-context/mockups/sidebar-now-overview.html` | Now tree node and child order (incl. the A9 **Recent artifacts** group), inline ▶ placement; Overview search box, Mine/Everyone, STATUS/TYPE/ATTENTION tile rows, group headers, row anatomy | Approximate layout, exact copy and field order |
| `screen:task-fallback-view` | `mockups/task-fallback-view.html` | Fallback banner, header + primary next-action button, phase glyph list, hero cards, decisions, risks, all-artifacts, raw-state disclosure | Approximate layout, exact section order |
| `screen:artifact-reader` | `mockups/artifact-reader-implementation-plan.html` | Breadcrumb, hero chips, pinned summary card, checklist line, body typography | Approximate layout, exact card contents |
| `screen:dashboard-mode` | `mockups/dashboard-mode.html` | 4 KPI tiles, filter chip bar, 2×2 chart grid with Table links, task table columns incl. **Next** | Pixel-guide for the tile/chart grid; exact column order |
| `screen:open-risks` | `mockups/open-risks.html` | Risks-mode breadcrumb, KPI tiles, filter bar, group card header fields, risk row + source line | Approximate layout, exact field order |
| `screen:start-workflow-flow` | `mockups/start-workflow-flow.html` | Type prompt, description input, target-order outcome messaging | Flow reference |
| `component:hosted-dashboard` | *(not mocked)* | Maister's own `dashboard.html`, hosted unmodified | Verbatim — no restyling |

Three mockup defects are **not** to be reproduced: their `/screen/*` links are preview-server leftovers (non-navigable); their "Browse" / "from the Now or Browse title bar" wording is stale — Browse was merged into Overview, so the spec's wording wins; and `open-risks.html` renders resolved rows and a `· {n} resolved shown struck through` heading clause while its **Show resolved** toggle is off. § 5.7 wins there: the default heading is `{open} open across {k} tasks`, resolved rows and the resolved clause appear **only** while Show resolved is on. Styling uses VS Code theme variables exclusively; the mockups' Dark+ palette is a rendering of those variables, not a set of literals to copy.

---

## Reusable Components

### Existing Code to Leverage

The repository contains **no source code** — `package.json`, `tsconfig.json`, `src/`, `test/`, `.vscode/` and `.gitignore` all do not exist. "Reuse" therefore means external and intra-project reuse:

| Asset | Path / source | How it is leveraged |
|---|---|---|
| Maister's `dashboard.html` | Each task folder; reference copy in maister 2.2.3 `skills/orchestrator-framework/assets/dashboard.html` | **Hosted verbatim** in Task mode — never reimplemented. Its `loadData`, 5 s polling and `aLink` behaviour are relied on unchanged |
| `HERO_MAP` | Same file, lines 249–276 | Transcribed into `model/workflows.ts` as the per-type hero artifact lists |
| Real task folders | `.maister/tasks/product-design/2026-09-22-maister-viewer-vscode-plugin/`, `.maister/tasks/development/2026-09-22-maister-lens-vscode-extension/` | Committed as fixture snapshots; the second is the N9 list-summary fixture, the first the object-literal `dashboard-data.js` fixture |
| Webview CSP + nonce pattern | Installed extensions `42crunch.vscode-openapi` (`out/webapps/web-view.js`, `out/preview.js`) and `anthropic.claude-code` | Reference implementations of nonce CSP, `localResourceRoots` and `asWebviewUri` — read as patterns, no code copied |
| Shared webview primitives | `media/` CSS + a `src/webview/components.ts` module | Tile, chip, row and summary-card primitives imported by `overview.ts`, `dashboardMode.ts`, `risksMode.ts`, `fallbackTask.ts` and `reader.ts` via esbuild — **not duplicated per bundle** |
| VS Code theme variables | `--vscode-*` | The only design tokens; no custom palette, satisfying the CSS standard's design-token and minimal-custom-CSS rules |
| `yaml`, `markdown-it` | npm | Replace hand-rolling YAML flow mappings and CommonMark+GFM — the only two runtime dependencies |

### New Components Required

| Component | Why new code is unavoidable |
|---|---|
| `model/` (types, workflows, parseState, parseSummary, risks) | No parser exists for Maister state; tolerance rules N1–N15 and A8 drift are specific to this data |
| `index/` (taskIndex, watcher, attribution) | No index exists; the two-tier + persistence design is specific to the performance targets |
| `views/` (nowTree, overviewView) | VS Code providers must be authored per extension |
| `panel/` (panel, hostDashboard, render, messages) | Hosting and message validation are the security core; nothing off the shelf applies |
| `webview/` five bundles + shim | Browser-side surfaces; the shim's nonce/appendChild patch has no equivalent |
| `launch/launch.ts` | The four-target chain and shell quoting are specific to this extension |
| `strings.ts` | A6 requires one scannable location; cheaper than a lint rule over the whole tree |

**Deliberately not built** (over-engineering guard): no chart library or wrapper, no HTML sanitizer (`html:false` is the strategy), no syntax highlighter, no abstraction layer over the VS Code API, no plugin/registry architecture for workflow types beyond the static table, no status-bar item, no Quick Pick navigator, no write path of any kind. Every module listed above has an immediate caller in the requirements.

---

## Technical Approach

**Layering (bottom-up, each layer depends only on those before it).** `model/` → `index/` → `views/` → `panel/` → `launch/`, with `strings.ts` and `webview/components.ts` as leaf modules everyone imports. Pure logic (parsers, derivation, query, risks, recognize, insertion, link rewrite, quoting, target order, message validation) stays **free of the `vscode` module** so it is unit-testable without a host; classes appear only where the API demands providers or the panel singleton. Everything disposable is registered in `context.subscriptions`.

**Data flow.** `workspace.findFiles` per folder → `parseState` → tier-1 `Task` keyed by `folderUri` → persisted + published snapshot → Now tree and Overview render from the snapshot only (views never read files). Opening a task builds a tier-2 `TaskDetail`; a recognized `dashboard.html` is hosted, otherwise the fallback view renders. The shim routes clicks and `window.open` into `navigate`; the host validates every message against A2 and then opens Artifact mode, another task, a file or an external URL. Watcher changes update the index and post `refresh` / re-render the open artifact.

**Security posture.** Model-authored JavaScript executes only inside a webview under a per-render 32-byte nonce CSP with `default-src 'none'`, with the shim acquiring `acquireVsCodeApi()` first so no later script gets a messaging handle; the host never parses or evaluates it. Markdown is rendered with `html:false` as the sanitization strategy. Every resolved path is containment-checked. `execFile` is used without a shell. Untrusted workspaces run no hosted HTML and expose no launch commands.

**Error handling.** Per the global error-handling standard: the parser never throws; every parse, stat and summary extraction is individually wrapped so one bad task cannot affect another; a single "Maister Lens" output channel is the sink; notifications are reserved for the three actionable cases (watcher exclude, Copilot caveat, index persistence failing twice).

**Risk handled first.** The first task group scaffolds the project and proves, before any feature code is written: esbuild bundling, one mocha test and one `@vscode/test-electron` launch on Node v26.7.0 — **and** the A18 resource-resolution check, hosting the real fixture `dashboard.html` in a webview and confirming `window.MAISTER_DATA` is populated with the `?t=` cache-buster intact. A18 is the higher-value of the two: the toolchain risk costs a dependency swap, the resolution risk costs two panel modes.

---

## Implementation Guidance

### Testing Approach
- **2–8 focused tests per implementation task group.** Test verification runs only the new tests for that group, not the entire suite.
- Group-level focus: scaffold → smoke (build + one test run); model → parser hazard fixtures and summary extraction; index → persistence, invalidation, watcher debounce; views → tree contents and Overview payload shape; panel → message validation, `recognize()`, the three insertions, link rewriting; launch → target order with mocked availability, next-action derivation, shell quoting; risks → `collectRisks` dedup; strings → the A6 scan.
- Integration tests run against a downloaded pinned stable VS Code (`test:integration`), with an optional 1.90.0 engine-floor run (`test:min`). AC7/AC9 are a benchmark script, not a gate (A10).
- The DOM suite (Playwright over each bundle's generated HTML with `acquireVsCodeApi` stubbed) runs once the webview bundles exist and carries the DOM half of AC4, AC5, AC6, AC8, AC14, AC17 and AC18 per A16. Its assertions are structural; mockup comparison is a manual checklist item.
- Criteria assigned to **Manual** in the A16 table are signed-off checklist items, not automation debt.

### Standards Compliance
- **`global/minimal-implementation.md`** — the spec is large but every module has an immediate caller; the "Deliberately not built" list above is the explicit guard, and no future stubs or speculative abstractions are specified.
- **`global/conventions.md`** — predictable `src/<domain>/` layout, two documented runtime dependencies, README and CHANGELOG (A11), testing standards defined before merge (A10).
- **`global/error-handling.md`** — clear user messages, fail-safe parsing, centralized output-channel sink, graceful degradation table (§ 8.1), resource cleanup via `context.subscriptions`.
- **`global/validation.md`** — host-side validation of every webview message (A2) is the "server-side always" analogue; allowlists over blocklists (message types, link schemes, path containment).
- **`global/coding-style.md` / `commenting.md`** — camelCase modules grouped by domain, descriptive names, no dead code, comments only where intent is non-obvious (the shim's patch, the undocumented Claude command).
- **`frontend/components.md`** — shared tile/chip/row/summary-card primitives with minimal props, composed across the five bundles.
- **`frontend/css.md`** — VS Code theme variables as the only design tokens, minimal custom CSS.
- **`frontend/accessibility.md`** — semantic HTML, keyboard operability everywhere, `aria-pressed` / `aria-sort` / `role="status"`, focus visible via `--vscode-focusBorder`, never colour alone, full spoken labels on tree items (§ 4.3, § 8.4). The hosted dashboard and companions are the recorded exception.
- **`frontend/responsive.md`** — the Overview layout is fluid across 250–400 px sidebar widths; the panel surfaces reflow at full width.
- No testing or backend standards exist for this project; § 8.6 / A10 proposes the testing ones at finalization.

---

## Acceptance Criteria Traceability

**Verified by** is authoritative per A16; it supersedes § 8.7's column wherever they differ. "Manual" means a signed checklist item, never an implied automation.

| AC | Spec section | Module(s) | Verified by |
|---|---|---|---|
| AC1 | R12 (§ 3.5), R15 (§ 4.1) | `index/watcher.ts`, `index/taskIndex.ts`, `views/nowTree.ts` | Integration |
| AC2 | R5, R6 (§ 2.3–2.4), A8, A14, A17 | `model/parseState.ts` | Unit |
| AC3 | R18 (§ 5.2–5.3), A18 | `panel/hostDashboard.ts`, `webview/shim.ts`, `index/watcher.ts` | Integration (three insertions, nonce, `refresh` within 1.5 s) + **Manual** (renders with data, no CSP violations, re-render) — A10 |
| AC4 | R18, A2 + A2.1 (`navigate`) | `webview/shim.ts`, `panel/messages.ts`, `panel/panel.ts` | Integration (panel location changes; no editor tab, no browser) + DOM (click → `navigate` post) + Manual (one live click) |
| AC5 | R22 (§ 6.1–6.3) | `panel/render.ts`, `webview/reader.ts` | Integration (`vscode.open` only via `openSource`) + DOM (summary card present) |
| AC6 | R19 (§ 5.4), A8 | `webview/fallbackTask.ts`, `model/parseState.ts` | Integration (payload) + DOM (four sections in order) |
| AC7 | R13 (§ 3.7), A10 | `index/taskIndex.ts` (query), benchmark script | Unit + benchmark (non-gating) |
| AC8 | R16, R20, A2 (`setFilter`, `clearFilter`, `openDashboard`) | `views/overviewView.ts`, `webview/overview.ts`, `webview/dashboardMode.ts` | Integration (filter round-trip, shared query) + DOM (bar → `setFilter`, charts unfiltered, Table parity) |
| AC9 | R10, R11, A10 | `index/taskIndex.ts`, benchmark script | Benchmark (non-gating) |
| AC10 | R5, A8 | `model/parseState.ts`, `index/taskIndex.ts` | Unit + Integration |
| AC11 | R24, A7 | `launch/launch.ts` | Unit (mocked `executeCommand`) + **Manual** (pre-fill against the installed version) — A10 |
| AC12 | R24 (§ 7.2), A7 (Resume form) | `launch/launch.ts`, `model/workflows.ts` | Unit |
| AC13 | A6 | `src/strings.ts` + string-scan unit test | Unit |
| AC14 | R15, R16, R25 (§ 4.3, § 8.4) | all view and webview modules | Integration (tree labels) + DOM (accessible names, tab order) + **Manual** (screen reader) |
| AC15 | R25 (§ 8.1), A2.2 | `package.json` `when` clauses, `panel/panel.ts`, `launch/launch.ts` | Integration |
| AC16 | R14 (§ 3.8), R16 | `index/attribution.ts`, `views/overviewView.ts` | Integration (generated two-author repo) |
| AC17 | R15, R16, R19, R20, A4 | `views/nowTree.ts`, `webview/overview.ts`, `webview/fallbackTask.ts`, `webview/dashboardMode.ts` | Integration (dispatch from four surfaces; title launches nothing) + DOM (one distinct control per row) |
| AC18 | R21, A5 | `model/risks.ts`, `webview/risksMode.ts` | Integration (payload: dedup, order, no severity/age) + DOM (Show resolved → struck-through rows) |

---

## Out of Scope

- **Repository / git change browsing.** Git is used only to attribute a task to whoever first committed its state file. `vision.md`'s "and repository changes" line is corrected at finalization (A11).
- **Full-text search** over artifact bodies — search covers metadata plus each registered artifact's § 7 summary block only.
- **A status-bar item** (A12) — the view badge carries the count.
- **Quick Pick task selection / navigation** — declined in design decision D7; the Start Workflow type and description prompts are launch inputs, not navigation.
- **Writing to any Maister file.** The extension composes commands and hands them off; it never edits `orchestrator-state.yml`, artifacts or dashboards.
- **Charting or sanitizer libraries** — the four charts are hand-written SVG; `markdown-it` with `html:false` is the sanitization strategy. Runtime dependencies stay at two.
- Syntax highlighting, Mermaid rendering, remote images/fonts, standalone `mockups/` folders without a state file, and `quick-*` workflows (§ 8.5 known limitations).
- Automated verification of the Claude Code pre-fill path (AC11 manual), and hardening against a future Maister that loads dashboard data by a mechanism other than a `<script src>` element.

## Success Criteria

1. All eighteen acceptance criteria in § 8.7, **as amended by A6**, pass by the method the traceability table's **Verified by** column names (A16) — unit, integration, DOM, benchmark, or a signed manual checklist item. No criterion is claimed as automated where A16 marks it manual.
2. `npm run build`, `npm run lint`, `npm test` (unit) and `npm run test:integration` all succeed on Node v26.7.0; `npm run test:min` succeeds against VS Code 1.90.0.
3. Benchmark output records cold index of 300 generated tasks < 5 s, warm cached snapshot < 300 ms, and a decision-text query < 100 ms over 300 tasks.
4. Every message the five webview bundles send appears in the A2 table; a test sends messages that are unlisted, malformed, outside the index, path-escaping and trust-gated-while-untrusted, and asserts all are dropped and logged.
5. The A14 fixture assertion holds: this task's own `phase_summaries.clarifications` yields exactly four decisions with no parse issues.
6. `openRiskCount(task)` equals the number of rows Risks mode shows for that task, on every fixture (AC18).
7. Runtime dependency count is exactly two (`yaml`, `markdown-it`); `npm ls --prod --depth=0` confirms it.
8. `vsce package` produces a `.vsix`; `git status` is clean of build output and the `.playwright-mcp` log.
9. README, CHANGELOG, `tech-stack.md` and `vision.md` describe the shipped extension with no contradictions.
