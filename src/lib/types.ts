// Shared domain types. See docs/DESIGN.md §3-§4.

export interface ExerciseConfig {
  name: string;
  minRestDays: number;
  overdueDays: number;
  weeklyOnly: boolean;
  unit?: string;
  category?: string;
  active: boolean;
  // Recommended prescription (shown on the card so you don't look it up).
  sets?: string;
  reps?: string;
  weight?: string;
  tip?: string;
  // Form-demo reference (e.g. a YouTube link), shown in the card's info panel.
  link?: string;
}

export interface LogEntry {
  id: string;
  exercise: string;
  timestamp: string; // ISO 8601
  date: string; // YYYY-MM-DD (local day)
  // Optional actuals captured after logging, for future reference.
  weight?: string;
  reps?: string;
  sets?: string;
  note?: string;
}

export type Status = "overdue" | "dueSoon" | "resting" | "ready";

export interface ExerciseState {
  exercise: string;
  config: ExerciseConfig;
  lastDone: string | null; // ISO of most recent log, or null
  daysSince: number | null;
  status: Status;
  // Actuals from the most recent log, for "last time" recall + prefill.
  last?: { weight?: string; reps?: string; sets?: string; timestamp: string };
}

export interface LogWarnings {
  restWarning: boolean; // gap < minRestDays
  weeklyWarning: boolean; // weeklyOnly && logged within trailing 7 days
  messages: string[];
}

export interface Meta {
  displayName?: string; // shown in the header, configured in the `meta` tab
  timezone?: string;
}
