# Code Review Re-verification — Maister Lens security fix pass

## TL;DR
C1 (containment), C2 (nonce to a remote `<script src>`) and C4 (YAML alias bomb) are **closed**, each verified by execution, including decoding, encoding and parser cases the implementer did not try.
**C3 is not closed.** The hand-written scanner's `<head>` is not Chromium's `<head>`: five distinct task-authored documents pass recognition, are hosted, and run in Chromium **with no CSP at all** — `eval` and dynamically injected inline scripts both execute. Confirmed in a real Chromium, not inferred.
A second, independent hole makes C2's fix largely moot at runtime: `shim.ts` hands the extension's nonce to any script whose `src` merely *contains* `dashboard-data.js`, so `https://evil.example/vendor/dashboard-data.js` executes under `script-src 'nonce-…'` — proven in Chromium. Pre-existing; the first pass missed it.
Fix 5, Fix 6 and the `openFile` follow-up hold. W1–W5 all still stand exactly as described; W2 is now the last surviving member of C1's family and gained one extra sink (`revealInExplorer`).

## Key Decisions
- C3 was judged against the same threat model as the first pass (spec § 8.3: task-authored `dashboard.html` is untrusted). Hosting is trust-gated, so this needs a trusted workspace plus a hostile or model-authored dashboard — the same preconditions as the original C3, so severity is unchanged.
- "CSP works" was treated as an execution question, not a placement question: every probe page's own script attempts `eval()` and appends an unnonced inline `<script>`. Both succeed only when no policy is in force.
- The shim nonce-laundering finding is reported even though it predates this pass, because it determines whether C2's fix achieves anything.

## Open Questions / Risks
- **C3 is the blocker.** Until recognition is a strict positive match rather than a best-effort scan, a task-authored dashboard can run with no policy in a trusted workspace. The scanner is well written; the problem is that "find `<head>` in an arbitrary document" has no correct regex-or-cursor answer short of a conforming parser.
- **N1 and C3 compound.** With C3 open the attacker does not need N1; with C3 closed, N1 alone still restores a remote-script channel. Both need to go.
- A small functional risk in the new scanner could not be ruled out for real dashboards: a `<script>` inside a `<template>` now receives a `nonce`, and Chromium's nonce hiding means the value is not carried by `cloneNode`, so a cloned template script would not run. No current Maister dashboard does this (all four in the repo were checked), but it is a live-fire behaviour change.
- All 7 manual checklist items remain unsigned. The AC3 "no CSP violations" pass would **not** catch any C3 vector, because in every one there is no policy to violate — the fixture would need to assert a policy *is* present and enforced.

---

## Per-finding verdicts

| # | Finding | Verdict | Evidence |
|---|---|---|---|
| C1 | `resolveInside()` decode order | **Closed** | 45-case battery through the real `resolveInside` |
| C2 | Nonce granted to a `<script src>` with a quoted `>` | **Closed** (statically) — but see N1 | 10 tag-syntax variants through the real `hostDashboardHtml` |
| C2b | `EXISTING_CSP_META` sibling | **Closed** | `<meta content="a>b" http-equiv="Content-Security-Policy">` now removed |
| C3 | Document hosted with no CSP | **Still open** | 5 vectors hosted and run in Chromium with zero policy |
| C4 | `maxAliasCount: -1` | **Closed** | bomb variants fail in 4–21 ms with the library's own message; caps on both read paths |
| F5 | `maister.revealInExplorer` / `sourceUri()` | **Closed**, `openSource` not regressed | code path read; inherits W2 |
| F6 | Packaging | **Closed** | `extensionVersion` has zero readers repo-wide |
| FU | `openFile` folder + decode | **Closed**, both halves | unit + integration tests, producer's frame of reference checked |
| W1–W5 | Not fixed | **Still open, unchanged** | each re-read |
| N1 | Shim launders the nonce to any remote `…dashboard-data.js` | **New (pre-existing, missed in pass 1)** | remote script executed in Chromium under a live CSP |
| N2 | Panel never restores its location | **New (pre-existing)** | no bundle ever writes a `PanelLocation` into webview state |

---

## C1 — closed

`relPath.split('#')[0].split('?')[0]` → `decodeURIComponent` → `containedRelPath`, which refuses a scheme, a leading `/`, any backslash, and any `..` that pops past the root. Run against `file:///…/t1`:

| input | result |
|---|---|
| `%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd` | `null` |
| `..%2f..%2fx.md`, `sub/%2e%2e%2f%2e%2e%2fsecret.md`, `a/../../../b.md` | `null` |
| `%2e%2e%5cwindows%5csystem32`, `%2f%2fetc%2fpasswd` | `null` |
| `%2E%2E%2Fx`, `%2e%2E%2fx` (mixed case) | `null` |
| `%c0%ae%c0%ae/x`, `%e0%80%ae/x`, `%ed%a0%80/x` (overlong / surrogate UTF-8) | `null` — `decodeURIComponent` throws, the `catch` fails closed |
| `..`, `../`, `./../x`, `.`, `""` | `null` |
| `file:///etc/passwd`, `FILE:///…`, `https://…`, `//evil/x`, `C:/Windows/x`, `c%3a%2fwindows` | `null` |
| `\\server\share\x`, `%5c%5cserver%5cshare` (UNC) | `null` |
| `%252e%252e%252fetc%252fpasswd` (double encoded) | `"%2e%2e%2fetc%2fpasswd"` — a single literal segment |
| `artifacts/../artifacts/x.md`, `x.md#frag`, `x.md?q=1`, `./dashboard.html` | correctly normalized |

Double encoding is safe because nothing downstream decodes twice: `decodeURIComponent` has exactly two call sites (`messages.ts:118`, `render.ts:127`), and every consumer feeds the result into `vscode.Uri.joinPath`, which appends to the already-decoded path literally.

`parseState`'s N12 is not weakened — `containedArtifactPath` still converts Windows separators *before* `containedRelPath`. One cosmetic change: a first path segment containing a colon (`plan:v2/x.md`) is now read as a scheme and refused.

**The "absolute URL now refused" claim is true and safe.** `shim.ts:101` posts the *raw* `getAttribute('href')`, never the resolved DOM property, and the real Maister dashboard builds every link from task-relative `MAISTER_DATA` paths (verified in all dashboards in the repo — the only literal hrefs are `#`). Nothing legitimate sends an absolute URL.

## C2 — closed statically; see N1 for why that is not enough

Every tag-syntax variant is now classified as Chromium classifies it:

| document | nonced? |
|---|---|
| `<script data-x=">" src="https://evil.example/x.js">` (the original C2) | no |
| `<script/src=x.js>`, `<script\nsrc=x.js>` | no |
| `<script src ="x.js">`, `<script src= "x.js">` | no |
| `<script src=x.js>`, `<script src='x.js'>` | no |
| `<script data-a=1 src=a.js src=b.js>` | no |
| `<SCRIPT SRC="https://evil/x.js">` | no |
| `<script src=x.js //>` | no |
| `<script src="x.js>` (unterminated quote) | document refused entirely |
| `<script\u0000 src=x.js>` | nonced — but Chromium's tag name is `script\uFFFD`, so it is not a script for either side |
| `<script nonce="attacker">` | ours is emitted first, and HTML keeps the first duplicate attribute |

## C3 — **still open**

`scanTags` models three tag names plus well-formed comments. It has no model of the rest of the HTML tokenizer (attribute values of unscanned tags, RAWTEXT/RCDATA elements, `noscript` with scripting enabled) or of tree construction. So it finds `<head>` where Chromium does not, and the policy is written where Chromium ignores it.

Each document below passed `signatureOf`, produced a non-null hosted document, and was loaded in headless Chromium:

| hosted document | Chromium result |
|---|---|
| `…<body><noscript><head></noscript><script>…</script>` | `inline:true injected:true eval:true` — **no CSP**, shim never loaded |
| `…<body><template><head></template><script>…</script>` | `inline:true injected:true eval:true` — **no CSP** |
| `…<body><p>hi</p><head><script>…</script>` | **no CSP** — console: *"The Content Security Policy … delivered via a `<meta>` element outside the document's `<head>` … is ignored"* |
| `…<body><div title="<head>"></div><script>…</script>` | **no CSP** — the insertion is written inside the attribute value |
| `<script>PAYLOAD</script><script>var poison="</scriptx <head>";</script>` | **no CSP** |
| baseline (`<head><meta charset>`) | `injected:false eval:false`, one CSP violation logged — the probe is sound |
| `<! <head> >` (bogus comment) | CSP **is** enforced; harmless |

The last attack is the nastiest: `closingScriptAt` uses `/<\/script/gi`, which matches `</scriptx`, but Chromium ends RAWTEXT only at `</script` followed by whitespace, `/` or `>`. The scanner resumes reading *inside* live script text and finds a `<head>` there.

**Recommendation.** Do not keep widening the scanner — each vector is a different tokenizer state and the list is not finite. Either:
- **(a)** require the document to match a strict prefix grammar from byte 0 (optional doctype → `<html …>` → optional whitespace/comments → `<head …>`), refusing anything else to the § 5.4 fallback — which is what "recognized Maister dashboard" ought to mean; or
- **(b)** refuse any document containing `noscript`, `template`, or a `</script` not followed by `[\s/>]`, as a cheap stopgap.

Option (a) also closes the attribute-value and RAWTEXT cases for free, because a conforming head is reached before any of them can occur.

## C4 — closed

- `doc.toJS()` with the library default: three bomb shapes (9×9, 10×12, 30×6) and a large-anchor variant all fail in **4–21 ms** with `Excessive alias count indicates a resource exhaustion attack`, RSS delta ≤ 30 MB. The reason now reaches the user through `unreadableTask`.
- Both read paths cap before `readFile`: `taskIndex.ts:429` and `taskIndex.ts:627`. Covered by `parseState.test.ts:210,223`.
- Deep nesting without aliases (`[` ×200 000) is caught too: `RangeError` recorded as a parse issue, no throw.

**Is 2 MiB defensible?** Safe but generous. A 1.24 MiB alias-free flat mapping costs **221 ms and 126 MB RSS** in one `parseState`, so 2 MiB costs roughly 350 ms / ~200 MB transient — per task, and `buildEntry` runs concurrently. The repo's own files are 13 KB and 26 KB. **256 KiB would still be 10× the largest real file and cuts the worst case ~8×.**

## Fix 5 — holds
`sourceUri()` reads correctly: a named `folderUri` answers on its own, and with no artifact named the target is that task's `orchestrator-state.yml` — the right call, since the tree's task-node context menu passes only `folderUri`. `openSource` is unchanged.

One inherited caveat: `sourceUri()` does not run `argument.artifactRelPath` through `resolveInside`. Every live caller supplies a path N12 already contained — except entries restored from the persisted index, which W2 says are unvalidated. **Fix 5 adds one more sink for W2.**

## Fix 6 — holds
`repository`/`bugs`/`homepage` present, CHANGELOG link absolutized, `extensionVersion` has zero readers anywhere.

## `openFile` follow-up — holds, both halves
`validateOpenFile` takes the folder from `context.workspaceRootUri` (the most-specific workspace folder containing the task on screen) and puts it *in* the accepted message; `dispatch` joins against `message.folderUri`, never `folders[0]`. The path goes through `resolveInside` → decoded → `containedRelPath`. Covered by `messages.test.ts:192` and `panel.test.ts:184`.

The producer's frame of reference was also checked — where this class of fix usually goes wrong: `render.ts`'s `workspaceFile()` builds `data-file` as task-folder-relative-to-its-workspace-folder. Producer and consumer now agree; with `folders[0]` they did not.

## W1–W5 — all still stand
- **W1** `taskIndex.ts:667-685` unchanged — with ≥2 folders, only the last folder's tasks keep attribution.
- **W2** `panel.ts:1521` and `taskIndex.ts:232` unchanged. **Priority rises**: it is now the only surviving instance of C1's root cause, and Fix 5 gave it an extra sink. Two refinements: the reach is bounded by needing write access to the extension's global storage (hence not critical); and the persisted-*location* half is inert in practice (see N2), so the persisted **index** is the live half.
- **W3** `launch.ts:294` vs `:299` unchanged.
- **W4** `messages.ts:387` still hard-codes `isTrusted: true`; `overviewView.ts:455` still stringifies a possibly-`undefined` `raw`.
- **W5** `grep -rn onDidChangeWorkspaceFolders src` → no matches.

## New defects

### N1 — the shim hands the CSP nonce to any script whose `src` *contains* `dashboard-data.js` (critical; pre-existing)
`src/webview/shim.ts:57` — `if (src === null || !src.includes('dashboard-data.js')) return;` then `setAttribute('nonce', shimNonce)`. A substring test on the raw `src`, no origin or shape check, so an absolute cross-origin URL passes.

Proven end to end against the **built** `dist/webview/shim.js` under a live `script-src 'nonce-…'` policy: `http://127.0.0.1:PORT/vendor/dashboard-data.js` **executed** (`window.__exfil === true`) while `…/vendor/other.js` was refused by CSP — so the policy was in force and the shim, not a hole in the CSP, let the first through. That is precisely the exfiltration channel `default-src 'none'` exists to remove, and it makes C2's static fix academic for a hostile dashboard.

**Fix**: require the resolved URL to be same-origin with `<base>` (`new URL(src, document.baseURI).origin === location.origin`) and the path to *end* with `/dashboard-data.js` before the query string.

### N2 — the panel never restores its location (functional; pre-existing)
`readLocation` (`panel.ts:1521`) expects a `PanelLocation` in the webview's serialized state, but no bundle writes one: `reader.ts:201` stores `{key, scrollY}`, `dashboardMode.ts:137` `{sortKey, ascending}`, `risksMode.ts:125` the risk filters, `overview.ts:97` its own state. `candidate.mode` is always `undefined`, so `deserializeWebviewPanel` always falls through to `{mode:'dashboard'}` and a reloaded window loses the task or artifact the user had open (§ 5.1).

### N3 — control characters survive containment (info)
`containedRelPath` accepts NUL and other control characters (`a%00.md` → `a\u0000.md`). Not exploitable today — Node and VS Code reject NUL in a path — but `secret.env%00.html` satisfies `openInBrowser`'s extension gate. One `if (/[\u0000-\u001f]/.test(text)) return null;` removes the class.

### N4 — a task-authored `<base href>` placed before ours wins (info)
Confirmed in the host output: an author's `<base href="https://evil/">` earlier in `<head>` is kept, and HTML honours the first `<base>` with an href. Contained by the CSP (modulo N1), so functional rather than a hole. Removing a foreign `<base>` alongside the foreign CSP meta is a one-line addition.

## Metrics
- Re-verified by execution: 45 containment inputs, 24 hosted-document shapes, 7 Chromium page loads, 4 YAML bomb shapes, 1 cross-origin nonce test against the built shim.
- Suite: 46 unit passing; `eslint src test` clean; `tsc --noEmit` clean; runtime dependencies exactly `markdown-it` + `yaml`.
- **Net: 1 critical still open (C3), 1 new critical (N1)**, 5 warnings unchanged, 4 new informational. C1, C2, C2b, C4, Fix 5, Fix 6 and the `openFile` follow-up are closed.
