# Production Readiness Report — Maister Lens

**Date**: 2026-09-23
**Path**: `/Users/jakub/dev_WORKSPACE/VSC_Maister_plugin`
**Target**: production (publish to VS Code Marketplace / Open VSX)
**Status**: With Concerns

## TL;DR

The extension itself is publish-grade: security model is tight, activation is lazy and
non-blocking, disposal is complete, prod deps are two with zero CVEs, 71 tests green.
**But `npx vsce package` fails today with exit 1 and produces no `.vsix`** — a missing
`repository` field plus a relative link in `CHANGELOG.md`. Add `repository` and the artifact
builds. `publisher` is still the placeholder `maister`, and all 7 manual checklist items
(including the headline hosted-dashboard render) are unsigned.
**GO WITH MITIGATIONS** — three blockers, all closable in well under a day plus one human pass.

## Key Decisions

- Judged as an editor extension, not a service. Monitoring, secrets, connection pooling, rate
  limiting, migrations and HTTPS are **not applicable** and are scored as such rather than failed.
- The hosted-dashboard design (nonce every inline script in model-authored HTML) is treated as an
  **accepted, correctly fenced** risk, not a vulnerability — see C7.
- Unsigned manual verification is rated a blocker rather than a concern because a Marketplace
  first impression is not revocable and the work-log itself refuses to close it.

## Open Questions / Risks

1. Which Marketplace publisher ID will be used? It must be decided before packaging, and it is
   hardcoded a second time in `src/index/taskIndex.ts:777`.
2. Will Open VSX be targeted in the same release? `ovsx` is not in devDependencies and no
   publish script exists.
3. The workflow registry is pinned to Maister 2.2.3 — is there a process to bump it when Maister
   ships new phases? The degradation is graceful, but it silently accumulates.

---

## Executive Summary

- **Recommendation**: **GO WITH MITIGATIONS**
- **Overall Readiness**: ~82%
- **Deployment Risk**: **Low** once B1/B2 are closed; **Medium** until B3 is signed
- **Blockers**: 3 · **Concerns**: 10 · **Recommendations**: 4

## Category Breakdown

| Category | Score | Status |
|---|---|---|
| Packaging & distribution | 60% | **Fails today** — `vsce package` exits 1 |
| Activation & performance | 95% | Ready |
| Degraded modes | 85% | Ready with concerns |
| Error handling & observability | 70% | With concerns |
| Security hardening | 95% | Ready |
| Resource management | 95% | Ready |
| Update & compatibility risk | 75% | With concerns |

*Not applicable to this artifact*: secrets management, monitoring/metrics stack, error-tracking
SaaS, health endpoints, connection pooling, rate limiting, DB migrations, HTTPS enforcement,
CORS. None are counted against the score.

---

## Blockers (Must Fix)

### B1 — `npx vsce package` fails with exit 1 and produces no `.vsix`
**Location**: `package.json` (no `repository`), `CHANGELOG.md` (last line, `[README.md](README.md)`)
**Reproduced**:
```
ERROR  Couldn't detect the repository where this extension is published.
       The link 'README.md' will be broken in CHANGELOG.md.
exit=1  ·  no .vsix produced
```
There is no shippable artifact. vsce cannot rewrite the relative link to an absolute URL without
knowing the repo. Confirmed that this is the *only* hard stop: re-running with
`--baseContentUrl/--baseImagesUrl` packages cleanly (16 files, 196 KB) and downgrades the
repository complaint to a warning.
**Fix**: add `"repository": { "type": "git", "url": "https://github.com/<org>/<repo>.git" }` (plus
`bugs` and `homepage`) to `package.json`. One field closes both halves.
**Fixable**: yes, trivially.

### B2 — `publisher` is the placeholder `maister`, and the ID is hardcoded a second time
**Location**: `package.json:6`; `src/index/taskIndex.ts:777`
`"publisher": "maister"` will be rejected by `vsce publish` unless that publisher is actually
owned. Separately, `taskIndex.ts` does
`vscode.extensions.getExtension('maister.maister-lens')?.packageJSON?.version ?? '0.0.0'`.
Renaming the publisher makes that lookup return `undefined` and the persisted
`extensionVersion` silently becomes `'0.0.0'` — with no error, because the field is written but
**never read** by `readPersisted()` (which gates only on `schemaVersion` and `registryVersion`,
`taskIndex.ts:716`). It is harmless today and a latent trap tomorrow.
**Fix**: set the real publisher; either delete the unused `extensionVersion` field or derive the
ID from `context.extension.id` instead of a string literal.
**Fixable**: yes.

### B3 — All 7 manual verification checklist items are unsigned
**Location**: `verification/manual-checklist.md`
The work-log's own residual gap list, item 1: AC3 (hosted dashboard renders with real data, no
CSP violations, survives re-render), AC4 (one live link click through the shim), AC11 (Claude Code
pre-fill against a real installation), AC14 (screen-reader pass), the four-theme pass, the mockup
comparison and hosted-dashboard fidelity are **unverified**. The hosted dashboard is the product's
headline surface, and the A18 probe plus the Playwright `file://` test are strong proxies but are
not the real webview origin under the real CSP.
**Fix**: a human runs and signs the checklist against a live VS Code host. No automation closes it.
**Fixable**: not by code — requires a person.

---

## Concerns (Should Fix)

### C1 — Marketplace listing metadata is absent
`package.json` has no `icon`, `categories`, `keywords`, `bugs` or `homepage`. The listing will
show the default grey placeholder icon (the activity-bar `media/maister.svg` is a different
thing — the gallery icon must be a PNG of at least 128×128), land in category "Other", and be
effectively unsearchable. Low effort, high visibility.

### C2 — Multi-root: a folder added at runtime is never watched
**Location**: `src/index/watcher.ts:180`, `src/index/taskIndex.ts:307`
Nothing in `src/` subscribes to `onDidChangeWorkspaceFolders`. `TaskIndex.folders` reads
`vscode.workspace.workspaceFolders` live, so a manual **Refresh** picks up a new folder — but
`TaskWatcher` captures the folder list once in its constructor and creates one
`FileSystemWatcher` per folder at that moment. A folder added to an already-multi-root workspace
gets no watcher and no reconcile: its tasks never update live until the window is reloaded, with
no message anywhere.

### C3 — Bundle ships unminified with a dangling sourcemap reference
**Location**: `esbuild.mjs`
`dist/extension.js` is **678.93 KB** and vsce flags it. There is no `minify` and `sourcemap: true`
is unconditional, so the shipped bundle carries `//# sourceMappingURL=extension.js.map` while
`.vscodeignore` excludes `**/*.map` — a 404 whenever a user opens devtools on the extension host.
A production flag on the build script roughly halves the download and removes the dangling ref.

### C4 — The output channel is the sole error sink and is undiscoverable
**Location**: `src/extension.ts:13`; notifications only at `taskIndex.ts:787`, `watcher.ts:166`,
`host.ts:74`
Everything else — discovery failures, per-task index failures, persist failures (first attempt),
every refused webview message, every launch-target failure, git failures — goes only to the
"Maister Lens" output channel. There is **no `Maister Lens: Show Output` command** and no
notification carrying a "Show Log" action, so a user has no path to the log except knowing it
exists. The messages themselves are good: actionable, no stack traces, no internals leaked.

### C5 — A corrupt state file makes a task vanish with no in-UI signal
**Location**: `src/index/taskIndex.ts:437-440`
`parseState()` never throws (verified: empty and unreadable input both yield an `unreadableTask`
with a recorded issue), so *parse* degradation is handled well. But if the `readFile` itself fails
— truncated mid-write, permissions, a symlink loop — `buildEntry` logs one line and returns
`null` when there is no cached entry. The task silently disappears from the Now tree. The user
sees a task they were just looking at stop existing.

### C6 — `parseIssues` are invisible whenever the hosted dashboard works
**Location**: `src/webview/fallbackTask.ts:142`, `267`
Parse issues render only in the built-in fallback Task view. In the normal trusted-workspace path
with a valid `dashboard.html`, a task parsed with warnings (unknown status, unknown workflow
segment, bad timestamps) shows no marker in the Now tree, in Overview or in the panel.

### C7 — The hosted dashboard executes model-authored inline script under a nonce
**Location**: `src/panel/hostDashboard.ts:43-47`
`INLINE_SCRIPT_OPENING` rewrites *every* inline `<script>` in the task's `dashboard.html` to carry
the generated nonce, and the CSP grants `style-src … 'unsafe-inline'`. Recognition
(`signatureOf`) is a structural string check — contains `dashboard-data.js`, contains
`MAISTER_DATA`, has an inline script, has no iframe — not a signature or a version check. So in a
**trusted** workspace, a hostile `.maister/tasks/*/dashboard.html` gets arbitrary script execution
inside a webview.
**This is the intended design and it is fenced correctly**: workspace-trust gated
(`panel.ts:977`, `1056`), `default-src 'none'`, `enableCommandUris: false`, no `vscode` API
reachable (the shim claims the single `acquireVsCodeApi()`), every link and `window.open`
funnelled through the A2 allowlist with containment enforced by URL normalization
(`resolveInside`), and `localResourceRoots` confined to `media/`, `dist/webview/` and the task
folders. Flagged so the trust boundary is a stated, deliberate choice — worth one sentence in the
Marketplace description.

### C8 — `dispatch()` has one silent-failure hole
**Location**: `src/launch/launch.ts` (`dispatch`)
The documented guarantee is "the clipboard always succeeds, so a launch never fails silently."
If `clipboard` is in `targetOrder` and `clipboardTarget` throws, the catch logs one line, the loop
ends, `order.includes('clipboard')` is true, and the function returns `null` — no status message,
no notification. The user pressed ▶ and nothing at all happened.

### C9 — Pinned registry and two weak capability checks
Documented as known limitations 9–11, each with a graceful fallback, so none is a defect:
`MAISTER_VERSION = '2.2.3'` (a newer phase renders by raw id plus a warning);
`claude-vscode.editor.open` is undocumented and the URI fallback cannot report "unhandled" so it
is always counted a success; `workbench.action.chat.open` is registered even when Copilot cannot
answer, mitigated by a one-time caveat notice. The compounding risk is that these degrade quietly
across upstream releases — worth an explicit upgrade watch rather than a fix.

### C10 — Minor consistency and hygiene
- `src/views/overviewView.ts:264` omits `enableCommandUris: false` while both other webviews set
  it. Behaviour is correct (the default is off); make it explicit so a future reader cannot
  mistake it for an oversight.
- `npm audit`: 3 dev-only vulnerabilities (2 moderate, 1 high) via `mocha → serialize-javascript`.
  **`npm audit --omit=dev` reports 0** — nothing vulnerable ships. No action required for release.
- Known limitation 12: `npm run test:min`'s untrusted pass runs on the pinned VS Code build, not
  on the 1.90.0 floor. Documented and correctly argued harmless.

---

## What was verified clean

| Check | Result |
|---|---|
| `npm test` | 37 passing, 0 failing |
| `npm run lint` | clean |
| `npx tsc --noEmit` | exit 0 |
| `npm ls --omit=dev` | exactly `markdown-it@14.3.2`, `yaml@2.9.1` |
| `npm audit --omit=dev` | **0 vulnerabilities** |
| Packaged contents | 16 files, 196 KB — no `src/`, `test/`, `.maister/`, `node_modules/`, `*.map` |
| LICENSE / README / CHANGELOG | all present and picked up by vsce |

**Activation** — `activationEvents` are three narrow triggers (`workspaceContains` on the state-file
glob and on `.maister/config.yml`, plus `onWebviewPanel:maister.panel`); there is no `*`.
`activate()` ends with `void index.load()` — the index is never awaited, so the extension host is
never blocked. Benchmark figures (cold 229 ms / warm 14 ms / query 1.3 ms over 300 tasks, against
5 s / 300 ms / 100 ms) are met with wide margins and, per the work-log, were not tuned to.

**Degraded modes** — each path traced and confirmed: `html_output: false` and missing dashboard →
built-in fallback; unrecognized vintage → four distinct, human-readable reasons
(`strings.ts:200-203`); empty or corrupt YAML → `unreadableTask` with a recorded issue, never a
throw; missing git → `readAuthors` returns an empty map plus one log line, never a notification
(`attribution.ts`); untrusted workspace → declared `limited` with an accurate description, gated
at the manifest, the panel, the Overview provider *and* re-checked in the launch host; missing
Claude Code / Copilot → `hasExtension` short-circuit and the chain advances.

**Resource management** — `context.subscriptions` collects the output channel, the index, both
views, the watcher, the panel and the launch commands. `TaskIndex.dispose()` sets `disposed`,
clears both debounce timers and disposes the emitter. `TaskWatcher.dispose()` clears every
per-task timer, the publish timer, the 60 s relative-time interval and every
`FileSystemWatcher`. The detail cache is a true LRU bounded at 20 with re-insert-on-hit.
`persist()` writes temp + `fs.rename`, cleans the temp on failure, retries once, then raises
exactly one warning. `deactivate()` awaits `flush()`.

**Subprocess safety** — `execFile` only, never a shell, with `timeout: 10_000`,
`maxBuffer: 16 MB`, `windowsHide: true`, and the glob passed as a `--` pathspec argument.
Terminal input is shell-quoted per detected shell (`quoteForShell`), and launch command text is
**recomputed from the index** in `host.ts:taskOf` so no webview can supply it.

---

## Next Steps (prioritized)

1. **Add `repository` (+ `bugs`, `homepage`) to `package.json`** and re-run `npx vsce package` to
   confirm exit 0 and a `.vsix` on disk. *(B1 — unblocks the artifact)*
2. **Set the real `publisher`**, and drop or re-derive the hardcoded `maister.maister-lens` lookup
   in `taskIndex.ts:777`. *(B2)*
3. **Run and sign `verification/manual-checklist.md`** against a live host — AC3 and AC4 first.
   *(B3 — the only step needing a human)*
4. Add `icon` (PNG ≥128×128), `categories` and `keywords`. *(C1)*
5. Add `minify: true` and drop `sourcemap` for the production build. *(C3)*
6. Add a `Maister Lens: Show Output` command and give the persist-failure warning a "Show Log"
   action. *(C4)*
7. Subscribe to `onDidChangeWorkspaceFolders` and rebuild the watcher set. *(C2)*
8. Surface a parse-issue marker on the Now tree node, and show a placeholder rather than dropping
   a task whose state file cannot be read. *(C5, C6)*

Items 1–3 are the release gate. Items 4–5 should land in the same release; 6–8 are 0.1.1.
