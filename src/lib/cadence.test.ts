import { describe, expect, it } from "vitest";
import { deriveState, evaluateLog } from "./cadence";
import type { ExerciseConfig } from "./types";

const TZ = "America/Los_Angeles";

const squats: ExerciseConfig = {
  name: "Squats",
  minRestDays: 1,
  overdueDays: 5,
  weeklyOnly: false,
  active: true,
};
const running: ExerciseConfig = {
  name: "Running",
  minRestDays: 2,
  overdueDays: 7,
  weeklyOnly: true,
  active: true,
};

// Helper: a local-noon ISO `n` days before `ref` (avoids midnight/DST edges).
function daysAgo(ref: Date, n: number): string {
  const d = new Date(ref);
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

const NOW = new Date("2026-06-04T20:00:00Z"); // afternoon PT

describe("deriveState (dashboard status)", () => {
  it("never done -> overdue", () => {
    expect(deriveState(squats, [], NOW, TZ).status).toBe("overdue");
  });

  it("past overdueDays -> overdue", () => {
    expect(deriveState(squats, [daysAgo(NOW, 6)], NOW, TZ).status).toBe("overdue");
  });

  it("one day before overdue -> dueSoon", () => {
    // overdueDays=5, so daysSince 4 or 5 => dueSoon (>= overdueDays-1)
    expect(deriveState(squats, [daysAgo(NOW, 4)], NOW, TZ).status).toBe("dueSoon");
  });

  it("within min rest -> resting", () => {
    // minRestDays=1, logged today (gap 0) -> resting
    expect(deriveState(squats, [daysAgo(NOW, 0)], NOW, TZ).status).toBe("resting");
  });

  it("outside min rest, not overdue -> ready", () => {
    expect(deriveState(squats, [daysAgo(NOW, 2)], NOW, TZ).status).toBe("ready");
  });
});

describe("evaluateLog (warnings)", () => {
  it("first ever log -> no warnings", () => {
    const w = evaluateLog(squats, [], NOW, TZ);
    expect(w.restWarning).toBe(false);
    expect(w.weeklyWarning).toBe(false);
  });

  it("same-day re-log warns on rest (gap 0 < minRest 1)", () => {
    const w = evaluateLog(squats, [daysAgo(NOW, 0)], NOW, TZ);
    expect(w.restWarning).toBe(true);
  });

  it("next-day log does not warn (gap 1 == minRest 1)", () => {
    const w = evaluateLog(squats, [daysAgo(NOW, 1)], NOW, TZ);
    expect(w.restWarning).toBe(false);
  });

  it("running within trailing 7 days warns weekly", () => {
    const w = evaluateLog(running, [daysAgo(NOW, 3)], NOW, TZ);
    expect(w.weeklyWarning).toBe(true);
  });

  it("running at the 7-day boundary does not warn weekly", () => {
    const w = evaluateLog(running, [daysAgo(NOW, 7)], NOW, TZ);
    expect(w.weeklyWarning).toBe(false);
  });

  it("running too soon also triggers rest warning (gap 1 < minRest 2)", () => {
    const w = evaluateLog(running, [daysAgo(NOW, 1)], NOW, TZ);
    expect(w.restWarning).toBe(true);
    expect(w.weeklyWarning).toBe(true);
  });
});
