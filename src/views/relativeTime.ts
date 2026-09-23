import type { Task } from '../model/types.ts';
import { TIME, format } from '../strings.ts';

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** § 4.1 — under ten minutes a task was written; at ten minutes or more it is quiet. */
const QUIET_AFTER_MS = 10 * MINUTE_MS;

function floorAtLeast(value: number, unit: number): number {
  return Math.max(1, Math.floor(value / unit));
}

/**
 * § 4.1's activity phrase for a task row: `written 40s ago`, `written 4 min ago`,
 * `quiet for 12 min`. Hours and days extend the quiet branch, which the spec leaves at
 * minutes — a task untouched for a week would otherwise read "quiet for 10080 min".
 */
export function formatActivity(mtime: number, now: number = Date.now()): string {
  const age = Math.max(0, now - mtime);
  if (age < MINUTE_MS) {
    return format(TIME.writtenSeconds, { n: Math.floor(age / SECOND_MS) });
  }
  if (age < QUIET_AFTER_MS) {
    return format(TIME.writtenMinutes, { n: Math.floor(age / MINUTE_MS) });
  }
  if (age < HOUR_MS) {
    return format(TIME.quietMinutes, { n: Math.floor(age / MINUTE_MS) });
  }
  if (age < DAY_MS) {
    return format(TIME.quietHours, { n: Math.floor(age / HOUR_MS) });
  }
  return format(TIME.quietDays, { n: Math.floor(age / DAY_MS) });
}

/** § 4.3 — the same fact spelled out for a screen reader. */
export function formatSpokenActivity(mtime: number, now: number = Date.now()): string {
  const age = Math.max(0, now - mtime);
  if (age < MINUTE_MS) {
    return format(TIME.spokenWrittenSeconds, { n: Math.floor(age / SECOND_MS) });
  }
  if (age < QUIET_AFTER_MS) {
    return format(TIME.spokenWrittenMinutes, { n: Math.floor(age / MINUTE_MS) });
  }
  if (age < HOUR_MS) {
    return format(TIME.spokenQuietMinutes, { n: Math.floor(age / MINUTE_MS) });
  }
  if (age < DAY_MS) {
    return format(TIME.spokenQuietHours, { n: Math.floor(age / HOUR_MS) });
  }
  return format(TIME.spokenQuietDays, { n: Math.floor(age / DAY_MS) });
}

/** The bare age an artifact child carries: `4 min ago`, `1 h ago`, `3d ago`. */
export function formatAge(mtime: number, now: number = Date.now()): string {
  const age = Math.max(0, now - mtime);
  if (age < MINUTE_MS) {
    return format(TIME.agoSeconds, { n: Math.floor(age / SECOND_MS) });
  }
  if (age < HOUR_MS) {
    return format(TIME.agoMinutes, { n: floorAtLeast(age, MINUTE_MS) });
  }
  if (age < DAY_MS) {
    return format(TIME.agoHours, { n: floorAtLeast(age, HOUR_MS) });
  }
  return format(TIME.agoDays, { n: floorAtLeast(age, DAY_MS) });
}

export function ageInDays(mtime: number, now: number = Date.now()): number {
  return Math.floor(Math.max(0, now - mtime) / DAY_MS);
}

/** § 3.7 — staleness is a fact about unfinished work only. Overview rows, the Dashboard
 * quiet KPI, the Dashboard activity cell and the Risks group header all read this one rule. */
export function isQuiet(task: Task, now: number, quietDays: number): boolean {
  return task.status !== 'completed' && ageInDays(task.activityMtime, now) >= quietDays;
}

/** The compact `quiet 5d` marker an Overview row shows at the staleness threshold. */
export function formatQuietMarker(mtime: number, now: number = Date.now()): string {
  return format(TIME.quietShort, { n: ageInDays(mtime, now) });
}
