# Code Review Report

**Date**: 2026-09-28
**Path**: task files (messages.ts, panel.ts, followUps.ts, followUpsMode.ts + related)
**Scope**: all
**Status**: Issues Found (no critical)

## TL;DR
Navigate containment is sound: decode-then-normalize via `containedRelPath`, base dir supplied by the panel only, scheme/absolute/backslash refused. `dashboard-data.js` is parsed as data (JSON, then YAML) with strict per-entry validation. Republish race guard is correct; `render()` itself has no equivalent guard. Webview uses DOM construction only (no innerHTML).

## Key Decisions
- Treat `navigate` climbing above `hostBaseRelDir` but staying inside the task folder as allowed (intended).

## Summary
- Critical: 0
- Warnings: 2
- Info: 3

## Warnings
1. **src/panel/panel.ts:771-773 (render)** — `render()` awaits `buildView` with no sequence/location guard (unlike `republish`, 1701-1707). Two overlapping renders (rapid navigate/back, or index change during show) can land out of order, leaving stale HTML/payload for a location that is no longer current. Fix: capture a render sequence and skip assignment if superseded.
2. **src/panel/panel.ts:745-751 / 773** — `hostFolderUri` derives from the current `location` immediately, while `hostBaseRelDir` is only updated after `buildView` resolves. During that window a `navigate` from the still-displayed previous page is validated against the new task folder with the old base dir. Containment still holds (target stays inside an indexed task folder), so impact is misrouting, not escape. Fix: clear `hostBaseRelDir` (set undefined) before the await, or store host folder+base together with the view.

## Informational
1. **src/webview/followUpsMode.ts:79,226** — `current` is assigned but never read (dead state).
2. **src/panel/panel.ts:1041-1058** — `readDashboardData` re-reads every completed task's `dashboard-data.js` on each dashboard/follow-ups build; fine at current scale, cache by mtime if task counts grow.
3. **src/model/followUps.ts:47-56** — YAML fallback on untrusted file: relies on `yaml` defaults (no custom tags, alias-count limit). Acceptable; consider `parseYaml(body, { maxAliasCount: 0 })`-style hardening if desired.

## Metrics
- Max function length: ~45 lines (panel.render)
- Max nesting depth: 3
- Potential vulnerabilities: 0
- N+1 query risks: 0

## Prioritized Recommendations
1. Add a sequence guard to `render()`.
2. Invalidate `hostBaseRelDir` before awaiting the new view.
3. Remove unused `current`.
