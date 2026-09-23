# Code Review — Maister Lens

## TL;DR
4 critical, 5 warnings, 7 informational across 14.9k lines (src + test). Status: ❌ Critical Issues.
Three criticals share one root cause in different clothes: **containment and CSP are enforced with string/regex tricks that fall to standard percent-encoding and quoted-attribute inputs** — all three reproduced by execution, not inferred.
The fourth is `maxAliasCount: -1` in the YAML parser, which switches off the library's own resource-exhaustion guard on the one file parsed for every task, in untrusted workspaces too.
Everything else is sound: disposal is complete, error boundaries degrade rather than throw, and there is no TODO/FIXME/`any`/`@ts-`/`eslint-disable` anywhere in `src/` or `test/`.

## Key Decisions
- `html: false` as the entire markdown sanitization strategy (spec § 6.2 step 3) is **respected, not reported** — verified sound: every tag in the output is produced by the extension's own renderer rules, hrefs/srcs/alt all pass through `escapeHtml`, heading slugs strip to `\p{Letter}\p{Number}-`. No sanitizer dependency is needed.
- A2.1's narrowing of `navigate` to the hosting task folder, Overview's separate trust-gate wording, the 2.2.3 registry pin, and `openFile` reaching anywhere inside a workspace folder are all deliberate spec decisions — respected, not reported as defects.
- `haystack()` recomputation (work-log ruling 4, bench 1.3 ms / 300 tasks) is noted as a scaling ceiling, not a defect.

## Open Questions / Risks
- C1/C2/C3 assume a task-authored `dashboard.html` or webview payload that is hostile. That is exactly the threat model spec § 8.3 adopts (model-authored HTML/JS), so it was treated as in scope. If the team's real posture is "the dashboard is always ours", C2 and C3 drop to warnings — **C1 does not**, because `navigate` from a hosted page is the intended untrusted channel.
- All 7 manual checklist items remain unsigned. C3 in particular would surface in the AC3 "no CSP violations" pass only if the fixture lacks a `<head>`, which none of them do.

---

## Critical

### C1 — `resolveInside()` decodes *after* normalizing, so percent-encoded `..` escapes every containment check
`src/panel/messages.ts:102-124` · fixable: yes

`new URL()` normalizes but leaves `%2e%2e%2f` encoded, so `target.pathname.startsWith(root.pathname)` passes; `decodeURIComponent` then runs on the *result* and returns a path containing live `..` segments.

Reproduced against a task folder `file:///…/.maister/tasks/development/t1`:

| input | returned |
|---|---|
| `%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd` | `../../../etc/passwd` |
| `..%2f..%2fx.md` | `../../x.md` |
| `sub/%2e%2e%2f%2e%2e%2fsecret.md` | `sub/../../secret.md` |
| `a/../../../b.md` | `null` (correctly refused) |

`vscode.Uri.joinPath` resolves `..` to the parent, and `workspace.fs.readFile` is not bounded by `localResourceRoots`.

**Failure scenario**: a hosted dashboard posts `{type:'navigate', href:'%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f.env'}`; `validateNavigate` (messages.ts:231) accepts, `panel.ts:471 → route() → show({mode:'artifact'})` → `readerPayload` (panel.ts:1119) reads the file and posts its rendered contents into the webview. The same gap reaches `openArtifact` (messages.ts:204), `openSource` (:334), `openInBrowser` (:246 — arbitrary `.html` handed to `env.openExternal`, trust-gated) and `openFile` (:257). Non-`.md`/`.html` paths take the `vscode.open` branch, opening any file on disk in an editor.

The module's own doc comment claims "percent-encoded separators are all covered"; `test/unit/messages.test.ts` contains no `%`-encoded case. The correct order already exists twice in this codebase — `render.ts:134-140` decodes *then* normalizes, and `parseState.ts:126-152` does the same — so the fix is to make `resolveInside` the third: decode first, then reject any result with an empty/`.`/`..` segment, a leading `/`, or a backslash.

### C2 — nonce is granted to a `<script src>` whose attributes contain a quoted `>`, defeating `default-src 'none'`
`src/panel/hostDashboard.ts:27` · fixable: yes

`INLINE_SCRIPT_OPENING = /<script(?![^>]*\bsrc=)([^>]*)>/gi` — the lookahead's `[^>]*` cannot cross a `>` inside a quoted attribute value, so the tag is misclassified as inline and nonced while keeping its `src`. Reproduced:

```
in : <script data-x=">" src="https://evil.example/x.js"></script>
out: <script nonce="N" data-x=">" src="https://evil.example/x.js"></script>
```

Under `script-src 'nonce-N'` a nonce authorizes *any* src, remote included. This is the hole that matters: with `default-src 'none'` there is no `connect-src`, so `fetch`/XHR are blocked and `img-src` is pinned to `cspSource data:` — a remote `<script src>` is the only way task data leaves the machine, and it also imports attacker-controlled code into the hosted page.

**Fix**: determine `src`-ness by parsing the tag's attributes, or refuse to host any document whose `<script>` tags do not survive a strict attribute scan.

### C3 — a dashboard with no `<head>` is hosted with **no CSP at all**
`src/panel/hostDashboard.ts:55-66`, recognition at `:73-87` · fixable: yes

`insertSecurityHeader` falls back charset-meta → `<head>` → *before the first `<script>`* → prepend. `signatureOf` requires only `dashboard-data.js`, `MAISTER_DATA`, an inline script, and no `<iframe>` — never a `<head>`. A minimal recognized document (`<!DOCTYPE html><html><body><div></div><script>/*MAISTER_DATA dashboard-data.js*/</script></body></html>`) matches neither `CHARSET_META` nor `HEAD_OPENING`, so the insertion lands in `<body>`. Chromium ignores a `<meta http-equiv="Content-Security-Policy">` delivered outside the document head, and ignores a `<base>` there too.

Result: task-authored inline JS executes in the webview with the extension's policy silently absent — the inverse of § 8.3's posture, and it **fails open** rather than degrading to § 5.4's native summary.

**Fix**: make an insertion point inside `<head>` a recognition requirement, and reject (→ fallback view) when one cannot be found.

Related, same family, lower severity alone: `EXISTING_CSP_META` (`:26`) also fails on `>`-in-attribute — `<meta content="a>b" http-equiv="Content-Security-Policy" …>` survives removal. Harmless while our meta is in head (multiple policies intersect and can only tighten), but load-bearing the moment C3's placement bug applies.

### C4 — `maxAliasCount: -1` disables yaml's resource-exhaustion protection on untrusted input
`src/model/parseState.ts:407` · fixable: yes

`doc.toJS({ maxAliasCount: -1 })` turns off the `yaml` library's billion-laughs guard on `orchestrator-state.yml`, parsed for every discovered task at activation and on every watcher change — including in **untrusted** workspaces, where parsing is gated by nothing. A ~10-line nested-alias file was run against both paths on the pinned dependency:

```
maxAliasCount: -1  → threw: Invalid string length  (after burning memory/CPU to the string cap)
library default    → threw: Excessive alias count indicates a resource exhaustion attack  (instant)
```

`parseState`'s try/catch means it does not throw out of the module (the "never throws" contract holds), but the host has already paid the expansion cost; a bomb tuned just under the string cap succeeds, materializes in the extension host, and is then persisted to the index file. Opening a repository is enough — no click. Neither the spec nor the work-log records a reason for the override, and `getDetail` (`taskIndex.ts:614`) correctly uses the default.

**Fix**: drop the override; add a size cap before `readFile` in `buildEntry` (`taskIndex.ts:412`), which currently reads a state file of any size.

---

## Warnings

### W1 — multi-root attribution wipes itself
`src/index/taskIndex.ts:658-676` · fixable: yes

`attribution.ts` itself is clean (`execFile`, no shell, `--`, `:(glob)` pathspec, 10 s timeout, 16 MB buffer). The defect is the caller: the outer loop runs per workspace folder and the inner loop over *all* entries. On the second folder's pass, a task from the first folder gets `authors.get(...) ?? null` → `null`, both `continue` guards fall through, and `entry.task = { ...entry.task, author: null }` erases the author just found. With ≥2 workspace folders, only tasks in the last folder keep attribution, and each reconcile re-fires spurious `changed` entries.

**Fix**: accumulate authors across folders first, then apply once.

### W2 — persisted index and persisted panel location are trusted more than the comments claim
`src/panel/panel.ts:1481`, `src/index/taskIndex.ts:232-260` · fixable: yes

`panel.ts:1481` says "A persisted location is untrusted input like any other", but `readLocation` checks only `typeof artifactRelPath === 'string'` — no `resolveInside`. `deserializeTask` validates `ref.folderUri`, `artifacts` being an array and the three dates, then spreads `candidate as unknown as Task`, so every `ArtifactRef.relPath` in the cached file enters the live snapshot unchecked and is published *before* reconcile (`:288-297`). Same class as C1 — fix together.

### W3 — the existing-terminal launch branch skips the quoting the new-terminal branch applies
`src/launch/launch.ts:294` vs `:299` · fixable: yes

A new terminal gets `claude ${quoteForShell(command, host.shell())}`; a user-chosen existing terminal gets `chosen.sendText(command, submit)` raw. The command embeds `task.ref.relPath`, derived from on-disk directory names with no charset validation, so a task folder named `x; curl …` yields shell metacharacters typed into whatever terminal the user picked. Trust-gated and requires a hostile checkout plus a user pick, but the asymmetry is the bug — `quoteForShell` itself is correct for pwsh/cmd/POSIX.

### W4 — Overview re-implements the trust gate the allowlist is supposed to own
`src/panel/messages.ts:387`, `src/views/overviewView.ts:459-465` · fixable: yes

`validate(raw, { isIndexed, isTrusted: true })` hard-codes the gate open, and Overview re-checks `startWorkflow`/`runNextAction` by hand. Correct today only because `OVERVIEW_TYPES` excludes `openInBrowser`; adding any trust-gated type to that set removes its gate silently, against the module's stated "one security allowlist" purpose. Same function `:455`: `JSON.stringify(raw).slice(0, 200)` throws `TypeError` when `raw` is `undefined`, and the call site is `void this.handleMessage(raw)` (`:271`), so it surfaces as an unhandled rejection rather than a refusal log.

### W5 — workspace folders added after activation are never watched
`src/extension.ts:33` · fixable: yes

The watcher is built from the activation-time folder list and nothing subscribes to `onDidChangeWorkspaceFolders`. `TaskIndex.folders` and `TaskPanel.folders` are dynamic getters, so a manual Refresh indexes a newly added folder — but its files are never observed live.

---

## Informational

1. `src/views/overviewView.ts:265` — `localResourceRoots: [this.context.extensionUri]` grants the whole extension directory, where the panel (`panel.ts:1275-1287`) correctly narrows to `media` + `dist/webview`. Narrow it to match.
2. `src/panel/panel.ts` is 1,502 lines — roughly twice its nearest neighbour, carrying history, message routing, three payload builders, hosting, HTML shells and command registration. The payload builders are the natural extraction.
3. Duplication: `escapeHtml` (`panel.ts:304`) duplicates `md.utils.escapeHtml` (`render.ts:202`) and omits `'`; the `run(command, argument)` wrapper is byte-similar in `panel.ts:545` and `overviewView.ts:503`; `reason(error)`/`detail(error)` exists four times.
4. `taskIndex.ts:437-452` — `refreshArtifacts` stats artifacts sequentially while `extractSummaries` (`:479`) uses `mapWithConcurrency(…, 8)`. On the warm path this is the slower of the two.
5. `taskIndex.ts:145-175` — `listFiles` walks a task folder recursively with unbounded depth and file count, one `stat` at a time, with no symlink guard.
6. `src/index/query.ts:47-65` — `haystack()` rebuilds and lowercases everything on every query. 1.3 ms at 300 tasks; the first thing to memoize if task counts reach thousands.
7. `src/views/nowTree.ts:166-178` — `taskChildren` awaits `recentArtifacts(task)` purely to decide whether to render the group node, then does it again on expand. The LRU of 20 absorbs it for small workspaces.

## Metrics
- Files analyzed: 28 in `src/`, 9 test helpers consulted.
- Largest module: `src/panel/panel.ts` 1,502 lines; next `src/index/taskIndex.ts` 801.
- Longest function: `parseState()` ~208 lines — long but flat, one labelled rule per block; not reported.
- Security findings: 4 critical (3 verified by execution, 1 by execution + regex probe), 3 warnings.
- Injection sinks: 1 `innerHTML` (`webview/reader.ts:168`, fed only by host-rendered HTML), 0 `eval`/`new Function`, 0 shell execution.
- TODO/FIXME/`any`/`@ts-`/`eslint-disable`: 0 across `src/` and `test/`.

## Prioritized recommendations
1. **C1** — rewrite `resolveInside` to decode before normalizing and reject any `..`/absolute/backslash segment; add the `%2e%2e%2f`, `..%2f` and `sub/%2e%2e%2f` cases to `test/unit/messages.test.ts`. One fix closes five message types.
2. **C4** — remove `maxAliasCount: -1` and cap state-file size before read. One line; removes a zero-interaction DoS that fires in untrusted workspaces.
3. **C3** — require a `<head>` insertion point in `signatureOf`, so an unplaceable CSP degrades to the fallback view instead of hosting unprotected.
4. **C2** — decide `src`-ness by attribute parsing, not lookahead.
5. **W2** — run persisted `artifactRelPath`s and the restored panel location through the fixed containment check.
6. **W1** — collect attribution across all workspace folders before applying it.
7. **W3/W4/W5** — quote the existing-terminal branch, move Overview's trust gate into `validate` (and guard the `JSON.stringify` log), subscribe to `onDidChangeWorkspaceFolders`.
8. Informational 1–3 are cheap and standards-driven; 4–7 are performance notes to revisit only if task counts grow.
