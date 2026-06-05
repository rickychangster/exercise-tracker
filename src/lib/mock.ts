// Mock data provider — used when no backend is configured, so the app runs
// instantly on clone (great for a demo before wiring Google Sheets).
// Generic sample exercises; logs are in-memory and reset on restart.

import type { ExerciseConfig, LogEntry, Meta } from "./types";

const SAMPLE_CONFIG: ExerciseConfig[] = [
  { name: "Push-ups", minRestDays: 1, overdueDays: 4, weeklyOnly: false, category: "upper", active: true, sets: "3", reps: "12", tip: "Full range, slow negative" },
  { name: "Pull-ups", minRestDays: 1, overdueDays: 5, weeklyOnly: false, category: "upper", active: true, sets: "3", reps: "8", tip: "Dead hang at the bottom" },
  { name: "Squats", minRestDays: 1, overdueDays: 4, weeklyOnly: false, category: "lower", active: true, sets: "3", reps: "15", tip: "Knees track over toes" },
  { name: "Plank", minRestDays: 0, overdueDays: 3, weeklyOnly: false, category: "core", active: true, sets: "3", reps: "45 sec", tip: "Squeeze glutes, neutral spine" },
  { name: "Run", minRestDays: 2, overdueDays: 7, weeklyOnly: true, unit: "km", category: "cardio", active: true, reps: "5 km", tip: "Conversational pace" },
];

const SAMPLE_META: Meta = { displayName: "there", timezone: "America/Los_Angeles" };

const mockLog: LogEntry[] = [];

export const mockProvider = {
  async getConfig(): Promise<ExerciseConfig[]> {
    return SAMPLE_CONFIG.filter((c) => c.active);
  },
  async getLogs(): Promise<LogEntry[]> {
    return [...mockLog];
  },
  async getMeta(): Promise<Meta> {
    return SAMPLE_META;
  },
  async appendLog(entry: LogEntry): Promise<void> {
    if (!mockLog.some((e) => e.id === entry.id)) mockLog.push(entry);
  },
  async updateLogDetails(
    id: string,
    details: { weight?: string; reps?: string; sets?: string },
  ): Promise<boolean> {
    const e = mockLog.find((x) => x.id === id);
    if (!e) return false;
    Object.assign(e, details);
    return true;
  },
  async deleteLogRow(id: string): Promise<boolean> {
    const i = mockLog.findIndex((x) => x.id === id);
    if (i === -1) return false;
    mockLog.splice(i, 1);
    return true;
  },
};
