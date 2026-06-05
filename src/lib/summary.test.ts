import { describe, expect, it } from "vitest";
import { buildSummary, lastEntryFor, parseNum } from "./summary";
import type { LogEntry } from "./types";

const TZ = "America/Los_Angeles";
const NOW = new Date("2026-06-04T20:00:00Z");

function entry(exercise: string, daysAgo: number, extra: Partial<LogEntry> = {}): LogEntry {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return {
    id: `${exercise}-${daysAgo}`,
    exercise,
    timestamp: d.toISOString(),
    date: d.toISOString().slice(0, 10),
    ...extra,
  };
}

describe("parseNum", () => {
  it("extracts the leading number", () => {
    expect(parseNum("60-70 lb")).toBe(60);
    expect(parseNum("10/side")).toBe(10);
    expect(parseNum(undefined)).toBeNull();
    expect(parseNum("min")).toBeNull();
  });
});

describe("lastEntryFor", () => {
  it("returns the most recent entry for an exercise", () => {
    const logs = [entry("Squat", 3), entry("Squat", 1), entry("Row", 0)];
    expect(lastEntryFor(logs, "Squat")?.id).toBe("Squat-1");
    expect(lastEntryFor(logs, "Nope")).toBeNull();
  });
});

describe("buildSummary", () => {
  it("counts sessions and active days in the window", () => {
    const logs = [entry("A", 0), entry("B", 0), entry("C", 2), entry("D", 9)];
    const s = buildSummary(logs, NOW, TZ, 7);
    expect(s.sessions).toBe(3); // the 9-day-old one is outside
    expect(s.activeDays).toBe(2); // today + 2 days ago
  });

  it("flags a weight increase as progress", () => {
    const logs = [
      entry("Goblet Squat", 5, { weight: "25", reps: "9" }),
      entry("Goblet Squat", 1, { weight: "30", reps: "9" }),
    ];
    const s = buildSummary(logs, NOW, TZ, 7);
    expect(s.progress).toEqual([
      { exercise: "Goblet Squat", kind: "weight", from: "25", to: "30" },
    ]);
  });

  it("flags more reps at equal weight", () => {
    const logs = [
      entry("Pushup", 4, { weight: "0", reps: "10" }),
      entry("Pushup", 1, { weight: "0", reps: "12" }),
    ];
    const s = buildSummary(logs, NOW, TZ, 7);
    expect(s.progress[0]).toMatchObject({ kind: "reps", from: "10", to: "12" });
  });

  it("does not flag when nothing improved", () => {
    const logs = [
      entry("Curl", 4, { weight: "20", reps: "10" }),
      entry("Curl", 1, { weight: "20", reps: "10" }),
    ];
    expect(buildSummary(logs, NOW, TZ, 7).progress).toHaveLength(0);
  });
});
