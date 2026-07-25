// Motivation analytics — last-N-day activity summary and progress detection.
// Pure + server-side so it's unit-testable. See dashboard route for wiring.

import { dayDiff, localDateKey } from "./cadence";
import type { LogEntry } from "./types";

/** Leading number in a string ("60-70 lb" -> 60, "10/side" -> 10). null if none. */
export function parseNum(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Most recent log for an exercise (by timestamp), or null. */
export function lastEntryFor(logs: LogEntry[], exercise: string): LogEntry | null {
  let best: LogEntry | null = null;
  for (const l of logs) {
    if (l.exercise !== exercise) continue;
    if (!best || Date.parse(l.timestamp) > Date.parse(best.timestamp)) best = l;
  }
  return best;
}

export interface ProgressItem {
  exercise: string;
  kind: "weight" | "reps" | "sets";
  from: string;
  to: string;
}

export interface Summary {
  windowDays: number;
  sessions: number; // total logs in the window
  activeDays: number; // distinct days with at least one log
  progress: ProgressItem[];
  byDay: { date: string; count: number }[]; // length=windowDays, oldest first, today last
}

/**
 * Build the activity summary over the trailing `windowDays`, plus a list of
 * recent "wins" — exercises whose latest actuals beat the prior session.
 * Only entries that recorded actuals (weight/reps/sets) count toward progress.
 */
export function buildSummary(
  logs: LogEntry[],
  now: Date,
  timeZone: string,
  windowDays = 7,
): Summary {
  const todayKey = localDateKey(now, timeZone);
  const inWindow = logs.filter((l) => {
    if (!l.timestamp) return false;
    const d = dayDiff(localDateKey(l.timestamp, timeZone), todayKey);
    return d >= 0 && d < windowDays;
  });

  const days = new Set(inWindow.map((l) => l.date || localDateKey(l.timestamp, timeZone)));

  // Per-day session counts for the strip visual.
  const dayCounts = new Map<string, number>();
  for (const l of inWindow) {
    const d = l.date || localDateKey(l.timestamp, timeZone);
    dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
  }
  const MS = 86_400_000;
  const todayMs = Date.parse(todayKey + "T00:00:00Z");
  const byDay = Array.from({ length: windowDays }, (_, i) => {
    const dateKey = new Date(todayMs - (windowDays - 1 - i) * MS).toISOString().slice(0, 10);
    return { date: dateKey, count: dayCounts.get(dateKey) ?? 0 };
  });

  // Progress: per exercise, compare the two most recent entries that have actuals.
  const byExercise = new Map<string, LogEntry[]>();
  for (const l of logs) {
    if (!byExercise.has(l.exercise)) byExercise.set(l.exercise, []);
    byExercise.get(l.exercise)!.push(l);
  }

  const progress: ProgressItem[] = [];
  for (const [exercise, entries] of byExercise) {
    const withActuals = entries
      .filter((e) => e.weight || e.reps || e.sets)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    if (withActuals.length < 2) continue;

    const [latest, prev] = withActuals;
    // Only celebrate if the latest session is within the window.
    if (dayDiff(localDateKey(latest.timestamp, timeZone), todayKey) >= windowDays) continue;

    const cmp = (a?: string, b?: string) => {
      const na = parseNum(a);
      const nb = parseNum(b);
      return na !== null && nb !== null ? na - nb : null;
    };

    const dW = cmp(latest.weight, prev.weight);
    const dR = cmp(latest.reps, prev.reps);
    const dS = cmp(latest.sets, prev.sets);

    if (dW !== null && dW > 0) {
      progress.push({ exercise, kind: "weight", from: prev.weight!, to: latest.weight! });
    } else if ((dW === 0 || dW === null) && dR !== null && dR > 0) {
      progress.push({ exercise, kind: "reps", from: prev.reps!, to: latest.reps! });
    } else if (dS !== null && dS > 0) {
      progress.push({ exercise, kind: "sets", from: prev.sets!, to: latest.sets! });
    }
  }

  return {
    windowDays,
    sessions: inWindow.length,
    activeDays: days.size,
    progress,
    byDay,
  };
}
