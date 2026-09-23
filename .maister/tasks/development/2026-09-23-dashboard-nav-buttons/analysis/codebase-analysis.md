# Codebase Analysis Report

## TL;DR
Both features are additive and nearly free: the `maister.openDashboard` command, the `openDashboard` webview message, its validation and its host dispatch all already exist.
Feature (1) "Open Dashboard above Now" is a manifest-only change — "Now" is the `maister.now` **tree view**, not a webview button, so the button is a `view/title` entry at `navigation@0`.
Feature (2) "back to dashboard on a task" copies the risks breadcrumb (`src/webview/risksMode.ts:429-433`) into `src/webview/fallbackTask.ts:render()` plus two new `FALLBACK` strings.
Main catch: a task can render in **two** documents — the native fallback bundle and Maister's re-hosted `dashboard.html`, which forbids DOM insertions.
No origin tracking exists, so a conditional "only when opened from dashboard" variant would require new message + `PanelLocation` fields.

## Key Decisions
- Implement (1) as a `contributes.menus["view/title"]` entry for `view == maister.now` at `group: navigation@0` — zero TypeScript, matches the Overview precedent, and avoids renumbering assertions in `manifest.test.ts`.
- Implement (2) by mirroring the risks breadcrumb rather than wiring `TaskPanel.back()` — the established semantic is a forward navigation that pushes `{mode:'dashboard'}`, and it survives reload (history is not persisted).
- Show the back link **unconditionally** in the fallback task view — risks' crumb is unconditional too, and conditional display would require new plumbing across messages, location, validation and serialization.
- Add own `FALLBACK.breadcrumb*` string keys instead of borrowing `RISKS.*` — the codebase keeps one string block per surface.

## Open Questions / Risks
- "Above the now button" is ambiguous: sidebar title-bar icon (recommended), a row inside the Now tree, or a button at the top of the Overview webview. Confirm with the operator before implementing.
- The hosted `dashboard.html` task view cannot take a DOM back-button without breaking the documented "exactly three insertions" invariant in `src/panel/hostDashboard.ts:4-12`. Either inject from `src/webview/shim.ts`, restrict the feature to the fallback view, or rely on the existing editor-title `maister.openDashboard` action (already visible on every panel task).
- The panel editor title already pins an "Open Dashboard" action (`package.json:305-309`), so feature (2) may be partly redundant — worth confirming the operator wants an in-page control anyway.
- `messages.ts` is a security boundary; any new type/field must be allowlisted or it is refused and logged.

---

**Date**: 2026-09-23
**Task**: Add an "Open Dashboard" button above the Now view, and a "back to dashboard" control at the top of a task opened from the dashboard.
**Analyzer**: codebase-analyzer skill (2 Explore agents: File Discovery + Code Analysis, Pattern Mining)

---

## Summary

Maister Lens keeps all navigation in the extension host: webviews only `postMessage` an allowlisted type and the host calls `TaskPanel.show(location)`. Both requested controls reuse the already-existing `openDashboard` path end to end, so no new command, message type, validation case or dispatch branch is needed. The only genuinely new code is one manifest menu entry, one `<nav>` + `.link` button in the fallback task bundle, two strings, and test updates in two files.

---

## Files Identified

### Primary Files

**package.json**
- Declares views (`contributes.views.maister`, lines 41-52: `maister.now` first, then `maister.overview`), commands (`maister.openDashboard` at 129-134 with `icon: "dashboard"`), and title-bar menus (Now actions at 219-229, Overview's Open Dashboard at 230-234, panel editor title at 305-309).
- Sole change site for feature (1).

**src/webview/fallbackTask.ts**
- The native (non-hosted) task view bundle. `render()` at 296-307 appends `banner(payload)` then `header(payload)`; the breadcrumb `<nav>` goes before `banner`.
- Already imports `el`, `glyph`, `chip`, `format`, `FALLBACK`, `PANEL`, and has a local `post` helper (~line 75) and `actionButton` (93-97). `risksSection` at 85-91 is the in-file cross-surface link precedent.

**src/webview/risksMode.ts**
- Lines 427-433 are the exact template to mirror: `el('button', {class:'link', type:'button'}, [RISKS.breadcrumb])` → `post({type:'openDashboard'})` wrapped in `el('nav', {'aria-label': RISKS.breadcrumbLabel}, [crumb])`.

**src/strings.ts**
- All user-facing copy, one block per surface. `FALLBACK` block starts line 226; `RISKS.breadcrumb`/`breadcrumbLabel` at 329-330; `READER.breadcrumbTask` at 373-374. `format()` at 471.

**src/panel/panel.ts**
- `PanelLocation` union 49-59 (no origin field), `history`/`cursor` 318-319, `HISTORY_LIMIT` 63, `show()` 365-381, `render()` 621-655, dashboard view 659-667, payload 698-718, `buildFallback` 1211-1281, `bundleHtml` 1285-1315, `applyContextKeys` 1426-1447, command registration 1472-1510 (`maister.openDashboard` at 1489-1491), `readLocation` ~1521-1551.
- `dispatch()` 496-546 handles `openDashboard` (513-514) and `openTask` (503-504). No change expected.

### Related Files

**src/panel/messages.ts** — A2 allowlist; `openDashboard` already present at 59, 299-300, 363, 378; `openTask` validation 311-316; `TRUST_GATED` at 81 (openDashboard deliberately not gated). Change only if origin tracking is added.

**src/webview/dashboardMode.ts** — task-title cell at 428-431 posts `{type:'openTask', folderUri}`; the entry point for "opened from the dashboard".

**src/panel/hostDashboard.ts** — re-hosts Maister's own `dashboard.html`; header comment 4-12 limits it to three security-only insertions. Blocker for a DOM crumb in the hosted task view.

**src/webview/shim.ts** — owns `acquireVsCodeApi` inside the hosted page (line 20); the only viable injection point if the hosted view must also get a back link.

**src/views/nowTree.ts** — `NOW_VIEW_ID` line 8, `NowNodeKind` line 26, item command pattern 273-277, tree creation 401-409. Only touched if the button must live inside the tree body.

**src/views/overviewView.ts** — `handleMessage` 487-489 relays `openDashboard` to the command via `run()` 504-513 (swallows and logs failures).

**src/webview/overview.ts** — `render()` 319-368; button pattern at 303-305 and 362-364 (`OVERVIEW.showAllInDashboard`, `src/strings.ts:156`). Alternate site for feature (1) interpretation (c).

**src/webview/components.ts** — `el` 9-27, `hidden` 29, `glyph` 33. The only DOM builder; no `innerHTML` anywhere.

**media/webview.css** — `.link` 260-275, `.action` 277-288, `.rd-crumbs` 423-430 (reader-scoped; add a sibling class rather than reusing it).

**src/webview/reader.ts** — richer breadcrumb template at 48-58, appended first in `render()` at 178.

---

## Current Functionality

### Data Flow

```
Now tree / Overview / dashboard row
    --postMessage {type}--> messages.validate (A2 allowlist)
    --> host dispatch (panel.dispatch | overviewView.handleMessage -> executeCommand)
    --> TaskPanel.show(location) -> history push -> render()
    --> bundleHtml('<mode>') + publish(payload)   |  hostableHtml() -> hosted dashboard.html
```

Opening a task from the dashboard: `dashboardMode.ts:428` → `openTask{folderUri}` → `messages.ts:311` → `panel.ts:503` → `show({mode:'task', folderUri})` → either the hosted `dashboard.html` (`hosting:true`, `panel.ts:682-685`) or `buildFallback` → `fallbackTask.render`.

The risks breadcrumb is **not** `TaskPanel.back()`: it posts `openDashboard`, which pushes a fresh dashboard location. The editor-title arrows `maister.panel.back/forward` (`package.json:174-183`, `290-299`; `panel.ts:383-397`) are a separate mechanism driven by `maister.panel.canGoBack/canGoForward` context keys.

### Key Components

- **`TaskPanel.show(location)`** (`panel.ts:365`): dedupes against current, truncates forward history, pushes, caps at 50, re-renders.
- **`readLocation()`** (`panel.ts:~1521`): rebuilds a location from persisted webview state; falls back to `{mode:'dashboard'}`. History itself is not persisted — only the current location.
- **`messages.validate()`** (`messages.ts:294-353`): security boundary; unknown types/fields are refused and logged as `PANEL.messageRefused`.
- **`el()`** (`components.ts:9`): imperative DOM builder used by every bundle.

---

## Dependencies

### Consumers of the change surfaces

- `package.json` menus → consumed by VS Code only; `manifest.test.ts` asserts literal `navigation@N` values.
- `fallbackTask.ts` `render()` → exercised by `test/dom/surfaces.spec.ts` (including a blanket a11y loop at 190-213 over all five bundles) and `test/integration/fallbackTask.test.ts`.
- `openDashboard` message → already consumed from risksMode, overview webview, overviewView provider and panel dispatch.

**Impact Scope**: Low for feature (1) (manifest + one test). Low-Medium for feature (2) (one bundle, strings, two test files) — Medium if the hosted `dashboard.html` path must also be covered.

---

## Test Coverage

- **`test/unit/manifest.test.ts`** — feature (1)'s test file. Extend `it('contributes the Now and Overview title-bar actions (A15, A3)')` (103-125) with helpers `viewTitleEntry(command, viewId)` (70) and `commandIcon(command)` (76). Renumbering existing groups would break asserts at 106 and 111.
- **`test/dom/surfaces.spec.ts`** — feature (2)'s test file. Playwright; `openSurface(page, 'fallbackTask', fallbackPayload())` from `test/dom/harness.ts`; assert `expect(await surface.posted()).toContainEqual({ type: 'openDashboard' })`. The a11y loop auto-fails an unnamed control.
- **`test/unit/messages.test.ts:33`** already asserts `openDashboard` acceptance; **`test/integration/overview.test.ts:26-68`** already covers the round-trip. No change needed.
- **`test/unit/strings.test.ts`** auto-scans exports for forbidden wording (`running|waiting|stalled|abandoned`) — new copy must avoid those words.
- Runners: `npm test` (mocha), `npm run test:integration`, `npm run test:dom`.

**Assessment**: Good. Every change site has an existing test to extend; no new harness needed.

---

## Coding Patterns

- **DOM**: imperative `el(tag, attrs, children)` only; no template strings, no `innerHTML`.
- **Strings**: all user-facing text in `src/strings.ts`, one block per surface, interpolated with `format()`.
- **Messages**: camelCase verb types; union member + `validate()` case + (for Overview-reachable) `OVERVIEW_TYPES` and the `OverviewMessage` `Extract<>` union.
- **Commands**: `maister.<verb><Noun>`; `"category": "Maister"` is test-asserted; title-bar commands need an `"icon"`; new commands must be palette-hidden or listed in `PALETTE_VISIBLE_COMMANDS`.
- **A11y**: every control has an accessible name; glyphs get `aria-hidden` plus an `sr-only` counterpart; `<nav>` carries `aria-label`; only `button`/`a`/`input`; no positive `tabindex`.
- **CSP**: `bundleHtml` emits strict CSP + nonce + `<div id="root">`, one bundle per mode.

### Anti-patterns not to copy

- `risksSection()` (`fallbackTask.ts:84-91`) makes an `<h2>` itself a button — use `<nav>` + `.link` instead.
- Per-surface duplicated `acquireVsCodeApi()`/`post()` boilerplate is the convention; reuse the existing one in `fallbackTask.ts`, don't add a sixth copy and don't refactor.
- `'← Dashboard'` bakes the arrow into the string rather than using `glyph('←')`; acceptable, but don't mix both styles in one control.

---

## Complexity Assessment

| Factor | Value | Level |
|--------|-------|-------|
| Files to modify | 3-5 (`package.json`, `fallbackTask.ts`, `strings.ts`, 2 test files) | Low-Med |
| Dependencies | reuses existing command + message; 0 new | Low |
| Consumers | manifest menus + 1 webview bundle | Low |
| Test coverage | existing suites cover both sites | Low |

### Overall: Simple

Additive, precedented, no new plumbing — unless the operator wants origin-conditional display or coverage of the hosted task view, either of which raises it to Moderate.

---

## Key Findings

### Strengths
- Command, message, validation, dispatch and icon for `openDashboard` all already exist and are already tested.
- Two verbatim breadcrumb templates (risks, reader) plus in-file link precedent in the target file.
- Clear conventions (strings, a11y, `el`) with tests that enforce them.

### Concerns
- Two task renderers with incompatible change rules (fallback bundle vs. re-hosted `dashboard.html`).
- No origin tracking anywhere in messages or `PanelLocation`.
- `manifest.test.ts` asserts literal `navigation@N` values, so group renumbering causes churn.

### Opportunities
- Inserting at `navigation@0` gives the desired position with zero test churn.
- The editor-title `maister.openDashboard` already covers both task renderers if an in-page control proves impractical for the hosted view.

---

## Impact Assessment

- **Primary changes**: `package.json` (one `view/title` entry); `src/webview/fallbackTask.ts` (crumb `<nav>` before `banner`); `src/strings.ts` (`FALLBACK.breadcrumbDashboard`, `FALLBACK.breadcrumbLabel`).
- **Related changes**: `media/webview.css` if a dedicated crumb-bar class is wanted; `src/webview/shim.ts` only if the hosted task view must also show the link.
- **Test updates**: `test/unit/manifest.test.ts`, `test/dom/surfaces.spec.ts`.

### Risk Level: Low

Additive, reuses an already-validated message path, and both change sites have existing test coverage. Risk rises to Medium only if the hosted `dashboard.html` path or origin-conditional display is in scope.

---

## Recommendations

**Feature (1) — Open Dashboard above Now**

Add to `contributes.menus["view/title"]` in `package.json`, before the existing Now block at line 219:

```json
{ "command": "maister.openDashboard", "when": "view == maister.now", "group": "navigation@0" }
```

No TypeScript changes. Extend the Now/Overview title-bar assertion in `manifest.test.ts` using `viewTitleEntry` and `commandIcon`. Do not renumber the existing `navigation@1`/`@2` entries.

**Feature (2) — Back to Dashboard on a task**

In `src/webview/fallbackTask.ts` `render()` (296-307), prepend, mirroring `risksMode.ts:429-433`:

```ts
const crumb = el('button', { class: 'link', type: 'button' }, [FALLBACK.breadcrumbDashboard]);
crumb.addEventListener('click', () => post({ type: 'openDashboard' }));
fragment.append(el('nav', { 'aria-label': FALLBACK.breadcrumbLabel }, [crumb]));
```

Add the two keys to the `FALLBACK` block in `src/strings.ts` (around line 226), avoiding the forbidden wording scanned by `strings.test.ts`. Show it unconditionally. Add a DOM test posting-assertion in `test/dom/surfaces.spec.ts`.

**Before implementing**, confirm with the operator: (a) which "above the now button" site is meant, and (b) whether the hosted `dashboard.html` task view must also carry the back link (which would require shim injection or accepting the existing editor-title action).

---

## Next Steps

Invoke gap-analyzer with this report, carrying the two open decisions (button site; hosted-view scope) forward as explicit questions for the operator.
