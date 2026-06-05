// Cadence engine — pure, server-side, unit-tested.
// Implements the rules in docs/DESIGN.md §4 and docs/PRD.md §6.
//
// All comparisons are on CALENDAR-DAY counts in the user's timezone, matching
// the PRD's "days of rest" wording. Nothing here blocks logging; warnings are
// advisory only.

import type {
  ExerciseConfig,
  ExerciseState,
  LogWarnings,
  Status,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns YYYY-MM-DD for the given instant in the given IANA timezone.
 * Using en-CA gives ISO-like ordering (YYYY-MM-DD).
 */
export function localDateKey(iso: string | Date, timeZone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Whole calendar days between two date keys (YYYY-MM-DD). b - a. */
export function dayDiff(aKey: string, bKey: string): number {
  // Parse as UTC midnight to avoid DST drift; we only care about the date part.
  const a = Date.parse(aKey + "T00:00:00Z");
  const b = Date.parse(bKey + "T00:00:00Z");
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Calendar days since the most recent prior timestamp, relative to `now`.
 * Returns null when there is no prior log.
 */
export function daysSince(
  priorTimestamps: string[],
  now: Date,
  timeZone: string,
): number | null {
  if (priorTimestamps.length === 0) return null;
  const todayKey = localDateKey(now, timeZone);
  // Most recent prior timestamp.
  const latest = priorTimestamps.reduce((max, t) =>
    Date.parse(t) > Date.parse(max) ? t : max,
  );
  return dayDiff(localDateKey(latest, timeZone), todayKey);
}

/**
 * Dashboard status for one exercise given all of its log timestamps.
 * See DESIGN §4 "Status derivation".
 */
export function deriveState(
  config: ExerciseConfig,
  timestamps: string[],
  now: Date,
  timeZone: string,
): ExerciseState {
  const since = daysSince(timestamps, now, timeZone);
  const lastDone =
    timestamps.length === 0
      ? null
      : timestamps.reduce((max, t) => (Date.parse(t) > Date.parse(max) ? t : max));

  let status: Status;
  if (since === null) {
    status = "overdue"; // never done
  } else if (since > config.overdueDays) {
    status = "overdue";
  } else if (since >= config.overdueDays - 1) {
    status = "dueSoon";
  } else if (since < config.minRestDays) {
    status = "resting";
  } else {
    status = "ready";
  }

  return { exercise: config.name, config, lastDone, daysSince: since, status };
}

/**
 * Warnings to surface BEFORE writing a log for `config` at `at`.
 * `priorTimestamps` are the existing logs for this exercise (excluding the
 * one about to be written). Never blocks — caller decides UX.
 * See DESIGN §4 "Warnings".
 */
export function evaluateLog(
  config: ExerciseConfig,
  priorTimestamps: string[],
  at: Date,
  timeZone: string,
): LogWarnings {
  const messages: string[] = [];

  // Rest warning: gap (calendar days) since most recent prior log < minRest.
  const gap = daysSince(priorTimestamps, at, timeZone);
  const restWarning = gap !== null && gap < config.minRestDays;
  if (restWarning) {
    messages.push(
      gap === 0
        ? `You already logged ${config.name} today.`
        : `Only ${gap} day${gap === 1 ? "" : "s"} of rest since your last ${config.name} (prefers ${config.minRestDays}).`,
    );
  }

  // Weekly warning: any prior log within the trailing 7 calendar days.
  let weeklyWarning = false;
  if (config.weeklyOnly) {
    const atKey = localDateKey(at, timeZone);
    weeklyWarning = priorTimestamps.some((t) => {
      const d = dayDiff(localDateKey(t, timeZone), atKey);
      return d >= 0 && d < 7;
    });
    if (weeklyWarning) {
      messages.push(`You already did ${config.name} this week (prefers once a week).`);
    }
  }

  return { restWarning, weeklyWarning, messages };
}
