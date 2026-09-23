# Production Readiness Report — dashboard-nav-buttons

**Date**: 2026-09-23T17:19:00Z · **Target**: production (VS Code Marketplace / Open VSX via `vsce`)
**Path**: `/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin` (working-tree change set)

## TL;DR
The feature is ready to ship: all four harnesses pass green (54 unit, 39+1 integration, 13 DOM, lint clean, `tsc` exit 0), the packaged file set is the same shape as before, and the security posture is untouched. Recommendation: **GO WITH MITIGATIONS**. **No blockers attributable to this feature.** Two release-process blockers predate it and would block any publish (placeholder `publisher`; `[Unreleased]` CHANGELOG against `package.json` 0.1.0), plus one genuine release-hygiene risk in the working tree.

## Key Decisions (verified)
- Manifest-order mitigation is documentation-only (audit W4) — **adequate**, with one wording gap.
- `activationEvents` deliberately unchanged — **confirmed correct**.
- `injectBackLink()` silently skips when `document.body` is absent — **the right behaviour**, because a persistent fallback affordance already exists.
- `ViewColumn.Beside` → `Active` at `src/panel/panel.ts:1342` ruled out of scope (D6) — honoured, but flagged as a commit-hygiene risk.

## Open Questions / Risks
1. A hosted `dashboard.html` that rewrites `document.body` after load will silently erase the back link. Mitigated by the editor title-bar button, not by the shim.
2. The `view/title` "Open Dashboard" button is still bound to the renamed **Tasks** view, now redundant with the new **Overview** row.
3. The CHANGELOG **Changed** entry does not say the old name the way a confused user would search for it.

---

## Verdict

| | |
|---|---|
| **Recommendation** | **GO WITH MITIGATIONS** |
| **Status** | with_concerns |
| **Overall readiness** | 88% |
| **Deployment risk** | **Low** for the feature; **Medium** for the release as currently staged |
| **Counts** | Blockers from this task: **0** · Pre-existing publish blockers: **2** · Concerns: **4** · Recommendations: **3** |

## Category breakdown

| Category | Score | Status | Note |
|---|---|---|---|
| Configuration (manifest/contributions) | 95% | Ready | Well-formed, order asserted by test, no new command |
| Monitoring & observability | n/a | **Not applicable** | No server, no runtime infrastructure. This change is a fixed tree row and two DOM nodes with no failure surface worth instrumenting; reporting a "missing health check" would be inventing a gap. |
| Resilience / graceful degradation | 85% | With concerns | Defensive styling and a bodyless-path test; one uncovered re-render mode |
| Performance | 100% | Ready | Bundle set unchanged; shim grew ~130 bytes |
| Security | 100% | Ready | CSP untouched; runtime deps clean |
| Deployment / packaging | 70% | With concerns | Packaging unaffected; release metadata not release-ready |

---

## Evidence against the six stated concerns

### 1. Manifest change is user-visible on upgrade — mitigation adequacy
**Adequate for a Marketplace release, with one wording gap.** The diagnosis is correct and both docs state it honestly rather than over-promising. `README.md` explains that VS Code remembers each user's arrangement and names **Views: Reset View Locations**; the CHANGELOG repeats it inline in the **Added** entry rather than burying it. For a `0.1.x` extension this is proportionate — the alternative (programmatically forcing view order) has no supported API and would be hostile to users who deliberately rearranged their sidebar.

**Concern C1** — the rename entry does not name the old location the way a user will search for it. A user who updates, looks for "Overview", finds a one-row tree where their portfolio used to be, then reads *"The **Overview** webview is now called **Tasks**"* has to work out that *their* Overview became Tasks while a *different* new thing now holds the name "Overview". The name is simultaneously reused and vacated — the confusing case. Suggested rewording: *"The portfolio webview has been renamed from **Overview** to **Tasks**. The name **Overview** now belongs to the new navigation tree — if you are looking for your task list, search and filters, it is under **Tasks**."*

CHANGELOG passes the Marketplace link constraint: `test/unit/manifest.test.ts:205` extracts every `](...)` target and asserts none is repo-relative; the new entry adds no links, so the assertion holds (verified passing).

### 2. Activation and packaging — confirmed clean
`activationEvents` is unchanged and correctly so:
```
['workspaceContains:.maister/tasks/*/*/orchestrator-state.yml',
 'workspaceContains:.maister/config.yml',
 'onWebviewPanel:maister.panel']
```
`contributes.views` entries generate implicit `onView:` activation events at or above the declared `^1.90.0` floor, so `maister.nav` activates the extension when the container is first revealed without a manifest entry. A small *improvement*: in a workspace with no `.maister` folder, revealing the container now activates the extension and renders a usable row.

`.vscodeignore` needs no change — it already excludes `src/**`, `test/**` and `**/*.ts`, covering the three new files. Confirmed with `vsce ls`: exactly 14 files (`package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, `media/webview.css`, `media/maister.svg`, `dist/extension.js`, seven webview bundles). No source, no tests, no `.map`.

### 3. Bundle integrity — confirmed unchanged
`esbuild.mjs` globs `src/webview/*.ts`; no file was added there. A clean build produces the same seven bundles: `components, dashboardMode, fallbackTask, overview, reader, risksMode, shim`. Only `shim.js` changed size (6,429 bytes). `navTree.ts` lives under `src/views/`, so it is bundled into `dist/extension.js` by the host target — correct.

Worth noting rather than flagging: `shim.ts` now imports `FALLBACK` from `../strings.ts`, its first dependency on the shared strings module. esbuild tree-shakes to the single `FALLBACK` object, so cost is negligible — but the shim, previously self-contained, is now coupled to `src/strings.ts`. `test/unit/strings.test.ts` already guards the copy staying in step with the Risks view.

### 4. Graceful degradation inside an arbitrary `dashboard.html`
**The silent skip is the right behaviour. One uncovered failure mode.**

The defensive work is real: every property hostile CSS could use to hide the link (`display`, `visibility`, `position`, `float`, `overflow`, `max-height`, `opacity`, `z-index`) is set inline via CSSOM, which outranks the page's own stylesheet rules and is *not* blocked by the hosted CSP — `style-src` governs markup `style` attributes and stylesheets, not `element.style.setProperty`. The hosted CSP at `src/panel/hostDashboard.ts:92` is unmodified and the Chromium-enforced policy test still passes. Injection is correctly ordered against `document.readyState`, and `test/dom/shim.spec.ts:100` proves the bodyless path skips cleanly, raises no page error, and leaves nonce carry-over and link interception working.

Silent is correct: surfacing a notification when a user's own dashboard has no `<body>` would be an error message about a condition the user cannot act on, in a read-only view layer — violating the project's own error-handling standard (*clear user messages*).

**Concern C2** — a dashboard that replaces `document.body` after load silently loses the back link. The shim injects once and never re-checks; no `MutationObserver`. A task-authored dashboard whose script does `document.body.innerHTML = ...` on load — a common pattern for script-rendered pages — wipes the injected `<nav>`. No test covers this.

Held to **warning rather than blocker** because a persistent fallback exists: `contributes.menus['editor/title']` binds `maister.openDashboard` under `when: activeWebviewPanelId == 'maister.panel'`, so the panel's title bar carries an Open Dashboard button regardless of what the hosted page does to its DOM. A user can never be stranded. The back link is an enhancement over an affordance that already works — the right shape for something running inside untrusted third-party markup. Closing it would take a scoped `MutationObserver` on `document.body` childList, roughly ten lines, but it is a **nice-to-have**, not a ship gate.

### 5. Rollback — clean, and a strength
- **No new command** — `manifest.test.ts` asserts the count stays at 9 and nothing starting with `maister.nav` is declared. Nothing external can depend on a new command id.
- **No new message type** — `{ type: 'openDashboard' }` already existed at `src/panel/messages.ts:59`, already posted from `overview.ts` and `risksMode.ts`. The host handler at `src/panel/panel.ts:513` is untouched.
- **No new webview bundle** — no packaging or CSP surface to unwind.
- **No persisted state** — `NavTreeProvider` is stateless, so there is no stored snapshot to migrate or invalidate on downgrade. The workspace-storage task index is untouched.
- **Revert is a single `git revert`** plus deleting one new source file.

Residue after revert is cosmetic: users who ran **Views: Reset View Locations** keep the reset arrangement. Harmless.

### 6. CHANGELOG release mechanics — action required at release
The entry sits under `## [Unreleased]` above `## [0.1.0] — 2026-09-23`, while `package.json` still reads `"version": "0.1.0"`. At release this must be folded into a version heading and the manifest bumped in the same commit, or 0.1.0 ships twice with different contents. Given a user-visible rename plus a new view, **0.2.0** is the right target under semver for a pre-1.0 additive-plus-rename change.

The no-repo-relative-links assertion (`manifest.test.ts:205`) is satisfied and stays satisfied as long as the folded heading is a plain `## [0.2.0] — <date>` with no link-reference footer. **That is the trap** — the conventional Keep a Changelog footer uses link references, and adding an `[Unreleased]` footer that outlives the release is the usual way these drift.

---

## Blockers

**None attributable to this task.** Two pre-existing blockers gate any Marketplace publish and should be tracked separately:

| # | Issue | Location | Fixable |
|---|---|---|---|
| B1 | `"publisher": "maister"` is still the placeholder documented in `tech-stack.md` as "must be changed before publishing". `vsce publish` will fail or publish under the wrong identity. | `package.json` | yes |
| B2 | Version not bumped; changes sit under `## [Unreleased]` while `package.json` says `0.1.0`. | `package.json`, `CHANGELOG.md` | yes |

## Concerns

| # | Severity | Category | Issue | Location |
|---|---|---|---|---|
| C1 | warning | deployment | CHANGELOG rename entry does not name the old location the way a confused user will search for it; "Overview" is simultaneously vacated and reused. | `CHANGELOG.md` |
| C2 | warning | resilience | `injectBackLink()` runs once with no re-check; a hosted dashboard that replaces `document.body` after load silently loses the link. Mitigated by the always-present `editor/title` Open Dashboard button. | `src/webview/shim.ts` |
| C3 | warning | deployment | **Release hygiene:** `src/panel/panel.ts:1342` carries an uncommitted, out-of-scope `ViewColumn.Beside` → `Active` change (D6) — a one-line behavioural change to where panels open, sitting in a tree with 13 other modified files. A `git commit -a` sweeps it into this feature's commit, where it is invisible in review and mis-attributed on any later bisect. **Stage this feature's files explicitly by path.** Not this feature's defect; a real risk to this feature's commit. | `src/panel/panel.ts:1342` |
| C4 | info | configuration | The `view/title` Open Dashboard button is still bound to `view == maister.overview` (now titled **Tasks**). Harmless, but with a dedicated Overview nav row above it, a dashboard button in the Tasks header is redundant chrome and muddles which view "owns" the dashboard. | `package.json` menus |

## Recommendations (nice to have)
- **R1** — Add a DOM test for the body-replaced-after-load case, even if the resolution is "documented as unsupported". Converts an unknown into a known.
- **R2** — Consider a `viewsWelcome` or `description` on `maister.nav`. A single unlabelled row reading "Dashboard" under a header reading "Overview" is redundant to a first-time user; the accessible label ("Open the Maister dashboard") is better copy than the visible one.
- **R3** — CI is documented as "not yet set up". Everything here was run by hand. Before a public release the four harnesses plus `vsce ls` deserve a workflow, because the packaging assertions in `manifest.test.ts` are the kind that only fail when nobody is watching.

## Verification evidence

| Check | Result |
|---|---|
| `npm test` (unit) | **54 passing** |
| `npm run test:integration` (trusted) | **39 passing** |
| `npm run test:integration` (untrusted) | **1 passing** |
| `npm run test:dom` | **13 passing**, incl. 3 new shim tests and the Chromium-enforced CSP test |
| `npm run lint` | clean |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run build` | 7 webview bundles — set unchanged |
| `npx vsce ls` | 14 files, no source/test/map leakage |
| `npm audit --omit=dev` | **0 vulnerabilities** (runtime deps: `yaml`, `markdown-it`) |
| `npm audit` (incl. dev) | 3 (2 moderate, 1 high) — all via `mocha` → `serialize-javascript`; dev-only, absent from the VSIX. Not a ship gate. |

## Next steps (prioritized)
1. Stage this feature's files **by explicit path**; leave `src/panel/panel.ts` out (C3).
2. Reword the CHANGELOG **Changed** entry to name old and new locations unambiguously (C1).
3. At release: bump `package.json` to `0.2.0`, fold `[Unreleased]` into `## [0.2.0] — <date>`, add no link-reference footer (B2).
4. Replace the placeholder `publisher` before any `vsce publish` (B1).
5. Optional, post-release: decide on the redundant `view/title` button (C4) and whether to harden the shim against body re-renders (C2/R1).
