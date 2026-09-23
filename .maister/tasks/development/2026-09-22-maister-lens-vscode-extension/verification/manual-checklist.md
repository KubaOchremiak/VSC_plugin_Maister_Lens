# Maister Lens — Manual Verification Checklist

**Scope.** These are the acceptance criteria that spec amendment **A16** assigns to the
**Manual** harness: anything requiring a live host rendering third-party HTML, a real assistant,
a real screen reader, or a human's eye. A16's rule governs this document — *"Manual" means a
signed checklist item, never an implied automation.* Nothing here is covered by `npm test`,
`npm run test:integration`, `npm run test:min` or `npm run test:dom`, and nothing here may be
marked done on the strength of an automated run.

**A failed item is a defect, not a waiver** (task group 11 acceptance criteria). Record the
failure in the Result box, raise it, and re-run the item after the fix.

**Environment to record once, at the top of a signing session.**

| Field | Value |
|---|---|
| Extension version / commit | |
| VS Code version | |
| OS and architecture | |
| Claude Code extension version | |
| GitHub Copilot Chat version (if installed) | |
| Workspace used | |
| Date of session | |

**Preparation common to every item**

1. `npm install && npm run build`, then launch the Extension Development Host (F5) — or install
   the packaged `.vsix` — against a workspace containing **two real** Maister task folders,
   each with its own `dashboard.html` and `dashboard-data.js`.
2. Trust the workspace unless an item says otherwise.
3. Open **View → Output → "Maister Lens"** and keep it visible; an unexpected line there is
   itself a finding.

---

## Item 1 — AC3 (manual remainder): hosted dashboard renders with its data, with no CSP violations

**Discharges:** AC3's manual half per A16 — *"Renders with its data, no CSP violations,
re-renders within 1.5 s."* The integration suite only proves the three insertions carry a fresh
nonce and that a `dashboard-data.js` change posts a `refresh` within 1.5 s; it cannot see the
rendered DOM or the webview's console.

**Steps**

1. Open the first real task from **Now** so the panel enters Task mode.
2. Confirm Maister's own dashboard appears — phase glyphs, decisions, risks, artifact links —
   and that the numbers are **the task's real data**, not an empty skeleton.
3. **Developer: Open Webview Developer Tools** → Console. Reload the panel
   (**Developer: Reload Webviews**).
4. Read the whole console. Look specifically for `Refused to …` / `Content Security Policy`
   entries, and for `Failed to load resource` on `dashboard-data.js`.
5. In the Network tab (or by inspecting the appended `<script>`), confirm `dashboard-data.js` is
   requested **with its `?t=` cache-buster intact** (the A18 dependency).
6. With the panel open, edit the task's `dashboard-data.js` (change one visible number) and save.
   Time how long until the panel shows the new value.
7. Repeat steps 1–6 against the **second** real task folder.

**Expected result**

- The dashboard renders fully populated for both task folders.
- **Zero** CSP violation messages in the webview console. No other error that originates from the
  hosting (a warning from Maister's own script that also occurs in a browser is not a defect —
  note it if seen).
- `dashboard-data.js` loads with its query string present.
- The re-render completes **within 1.5 s** of the save, for both folders.

**Result:** ☐ Pass ☐ Fail — notes: _______________________________________________

**Signature:** ____________________  **Date:** ____________

---

## Item 2 — AC4 (manual remainder): one real click inside the live hosted dashboard

**Discharges:** AC4's manual half — one real click in a live host. The integration half proves a
`navigate` message changes the panel location and opens no editor tab and no browser; the DOM
half proves the shim turns a click on `a[target="_blank"]` into a `navigate` post. Neither is a
human clicking in the real extension host.

**Steps**

1. In Task mode on a real task, find an artifact link inside Maister's dashboard (the artifact
   list or a hero card).
2. Click it **once**.
3. Observe: the editor tab strip, the system browser, and the panel itself.
4. Use **Back** in the editor title bar and confirm you return to the task.

**Expected result**

- The artifact opens **rendered, in the same panel**, in Artifact mode.
- **No** external browser window or tab opens.
- **No** new VS Code editor tab opens, and the artifact is **not** shown as source.
- Back returns to the hosted dashboard.

**Result:** ☐ Pass ☐ Fail — notes: _______________________________________________

**Signature:** ____________________  **Date:** ____________

---

## Item 3 — AC11 (manual remainder): launch targets against real assistants

**Discharges:** AC11's manual half — *pre-fill against the installed version*. The unit tests use
a mocked host. `npm run test:min` **cannot** cover the Claude Code target at all: Claude Code
2.1.278 requires VS Code `^1.94.0`, so on the 1.90.0 engine floor the extension cannot load
alongside it and those branches are unreachable. This item is the only check that exists.

**Steps — 3a, Claude Code (record the installed version; the reference version is 2.1.278)**

1. With Claude Code installed and `maisterLens.launch.targetOrder` at its default, run
   **Maister: Start Workflow…** and complete the prompt.
2. Observe where the command lands and read the status-bar message.
3. Repeat with a Claude Code session **already open** in the primary editor, and again after
   closing all Claude Code editors.
4. If the fallback URI path is taken (the status bar says *"Opened in Claude Code's primary
   editor"*), confirm the prompt landed in the **existing primary editor**, not in a new tab.

**Steps — 3b, terminal only**

5. Set `maisterLens.launch.targetOrder` to `["terminal"]` with `autoSubmit` left at `false`.
   Launch a next action from the Now tree's inline ▶.

**Steps — 3c, clipboard floor**

6. Set `maisterLens.launch.targetOrder` to `["clipboard"]` (or use a host where no assistant is
   installed) and launch again; paste the clipboard somewhere visible.

**Steps — 3d, Copilot Chat (only if Copilot Chat is installed)**

7. Set `maisterLens.launch.targetOrder` to `["copilotChat"]` and launch.

**Expected result**

- **3a:** a Claude Code conversation shows the composed `/maister:*` command **pre-filled and not
  submitted**; pressing Enter would run it. The status-bar message names the destination
  truthfully — it must say *primary editor* when the URI path was used, and must never claim a
  new conversation opened when it did not.
- **3b:** the command is typed into a terminal and left **unsubmitted**.
- **3c:** the clipboard holds exactly the composed command.
- **3d:** the command appears in the Copilot Chat input. A **one-time** caveat notice appears,
  explaining that Copilot can only carry the workflow out if its setup provides Maister's skills.
  Record whether Copilot could actually answer — a partial or refused answer is the expected,
  documented outcome and is **not** a defect of this extension.
- In every case exactly one status-bar message appears, naming the destination actually used.

**Result:** ☐ Pass ☐ Fail — notes (installed Claude Code version: ____________):

_______________________________________________________________________________

**Signature:** ____________________  **Date:** ____________

---

## Item 4 — AC14 (manual remainder): screen-reader pass

**Discharges:** AC14's manual half. The integration suite asserts tree
`accessibilityInformation.label`s and the DOM suite asserts that every interactive element is a
`button`/`a`/`input` with a non-empty accessible name in document tab order. Neither is a screen
reader speaking.

**Steps** (VoiceOver on macOS, NVDA on Windows, or Orca on Linux — record which)

1. **Now tree:** arrow through every task node and every child (Progress, Last recorded decision,
   Recent artifacts, Open risks). Listen to each spoken label in full.
2. **Overview:** Tab from the search box through Mine / Everyone, every STATUS, TYPE and
   ATTENTION tile, the group headers and the task rows. Press a tile and listen for the pressed
   state being announced. Confirm **roving focus** through the tile rows behaves — focus moves
   predictably, is never trapped, and is always audible.
3. **Artifact reader:** confirm the skip link is the first stop, then the breadcrumb, the hero
   chips (current one announced as pressed), the Summary landmark, and the document body.
   Listen to a checklist glyph — it must be announced as *done* / *not done* / *skipped*.
4. **Dashboard and Risks:** Tab through the KPI tiles, chart bars, **Table** controls, sort
   headers and the **Show resolved** toggle.

**Expected result**

- Every focusable control is announced with a meaningful name and, where applicable, its
  pressed / sorted state.
- Nothing is conveyed by colour alone — status, verdict and staleness are also spoken as words.
- Focus is always visible and never trapped; tab order matches visual order.
- No control is announced as an unlabelled "button" or "clickable".

**Result:** ☐ Pass ☐ Fail — screen reader used: ____________ — notes: _____________

**Signature:** ____________________  **Date:** ____________

---

## Item 5 — Four-theme pass over every extension-built surface

**Discharges:** § 8.4's *"verified in Light, Dark, High Contrast and High Contrast Light."* No
harness renders a theme.

**Steps** — for each of **Dark+ (default dark)**, **Light+ (default light)**, **Dark High
Contrast** and **Light High Contrast**, walk all five extension-built surfaces: Overview, the
task fallback view, the artifact reader, Dashboard mode and Risks mode.

**Expected result**

- Text, borders, chart bars and the neutral hatch remain legible and adequately contrasted in all
  four themes.
- Focus rings are visible on every control in all four themes.
- No hard-coded colour shows through — nothing keeps a dark background in a light theme or vice
  versa.
- In both high-contrast themes, borders are present where the theme requires them.
- **Expected and accepted:** Maister's **hosted** dashboard and the HTML companions follow the
  **OS** light/dark setting, not the VS Code theme (§ 8.5 limitation 3). A mismatch there is the
  documented limitation, not a defect — confirm it is only the hosted surfaces.

| Theme | Overview | Fallback | Reader | Dashboard | Risks |
|---|---|---|---|---|---|
| Dark+ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Light+ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Dark High Contrast | ☐ | ☐ | ☐ | ☐ | ☐ |
| Light High Contrast | ☐ | ☐ | ☐ | ☐ | ☐ |

**Result:** ☐ Pass ☐ Fail — notes: _______________________________________________

**Signature:** ____________________  **Date:** ____________

---

## Item 6 — Mockup comparison at real sidebar widths

**Discharges:** the visual comparison A16 moves to this checklist. Four of the five screen
mockups are declared *approximate layout* and all of them render full VS Code window chrome, so
there is no common DOM to diff — the DOM suite asserts structure and copy only.

**Steps**

1. Open each mockup in
   `analysis/design-context/mockups/` beside its live surface:

   | Mockup | Live surface |
   |---|---|
   | `sidebar-now-overview.html` | Now tree + Overview |
   | `task-fallback-view.html` | Task mode on a task with no recognised `dashboard.html` |
   | `artifact-reader-implementation-plan.html` | Artifact mode on an implementation plan |
   | `dashboard-mode.html` | Dashboard mode |
   | `open-risks.html` | Risks mode |
   | `start-workflow-flow.html` | **Maister: Start Workflow…** |

2. Compare by eye: block order, field order, copy, and the anatomy of a row/card.
3. Do the sidebar comparisons at **250 px, 300 px and 400 px** sidebar widths — drag the sidebar
   edge — and confirm the Overview layout reflows without clipping or horizontal scrolling.
4. Confirm the **three mockup defects are NOT reproduced**:
   - no `/screen/*` links anywhere (preview-server leftovers),
   - no "Browse" wording — Browse was merged into Overview,
   - Risks mode shows **no** resolved rows and **no** `· {n} resolved shown struck through`
     clause while **Show resolved** is off; its default heading is
     `{open} open across {k} tasks`.
5. **Resolve the ambiguity flagged by task group 7** (recorded below) by inspecting the artifact
   reader against `artifact-reader-implementation-plan.html`:
   - open an artifact **with** a § 7 summary block that also contains checklist items, and
   - open an artifact **with checklist items but no § 7 summary block**.

**Expected result**

- Each surface matches its mockup in block order, field order and copy, allowing for the declared
  approximate layout. Dashboard mode's tile/chart grid is a pixel guide — its tile order, chart
  grid order and table column order (including **Next**) must match exactly.
- Overview is usable and unclipped at 250 px, 300 px and 400 px.
- None of the three defects appears.
- **Group 7's ambiguity** — the mockup places the `Checklist: {done} of {total} done · {skipped}
  skipped` line **inside** the `<aside aria-label="Summary">` card, as its last line, and renders
  **no** case without a summary. The shipped behaviour is therefore correct: the checklist line
  is part of the summary card, and when `summary` is null the whole card — checklist line
  included — is omitted. AC5's DOM half ("the card is present whenever `summary` is non-null")
  and feature-spec § 6.2 ("the card *gains* the checklist line") are consistent under this
  reading: § 6.2 describes where the line goes, not a condition under which a card appears
  without a summary. Confirm against the two artifacts opened in step 5 and tick:
  ☐ with summary → card present, checklist line last inside it;
  ☐ without summary → no card and no checklist line anywhere.

**Result:** ☐ Pass ☐ Fail — notes: _______________________________________________

**Signature:** ____________________  **Date:** ____________

---

## Item 7 — Hosted-dashboard fidelity: Maister's `dashboard.html` renders unrestyled

**Discharges:** `component:hosted-dashboard`, declared **Verbatim — no restyling**. The
integration suite asserts the hosted output equals the source file apart from the five declared
changes; only a human can confirm it *looks* the same as in a browser.

**Steps**

1. Open the task's `dashboard.html` directly in a normal web browser.
2. Open the same task in Task mode in VS Code.
3. Place them side by side and compare layout, typography, spacing and every control.

**Expected result**

- The hosted dashboard is visually the same document as the browser shows: no Maister Lens
  styling, no injected buttons, headers, banners or toggles, no theme override.
- The only differences are the five declared insertions — the nonce CSP meta, the `<base href>`,
  the nonced shim script, the nonce added to the file's own inline script, and the removal of the
  file's own CSP meta — none of which is visible.
- Links behave as Item 2 describes (in-panel navigation), which is the one behavioural
  difference and is intended.

**Result:** ☐ Pass ☐ Fail — notes: _______________________________________________

**Signature:** ____________________  **Date:** ____________

---

## Session sign-off

All seven items executed against a real host; every failure recorded above has been raised as a
defect and the item re-run after the fix.

**Verifier:** ____________________  **Signature:** ____________________  **Date:** ____________
