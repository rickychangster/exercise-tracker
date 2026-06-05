import { NextResponse } from "next/server";
import { deriveState } from "@/lib/cadence";
import { buildSummary, lastEntryFor } from "@/lib/summary";
import { appTimezone, getConfig, getLogs, getMeta } from "@/lib/data";

export const dynamic = "force-dynamic";

const ORDER = { overdue: 0, dueSoon: 1, ready: 2, resting: 3 } as const;

export async function GET() {
  try {
    return await buildDashboard();
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, hint: "GET /api/health for diagnostics" },
      { status: 500 },
    );
  }
}

async function buildDashboard() {
  const [config, logs, meta] = await Promise.all([getConfig(), getLogs(), getMeta()]);
  const tz = meta.timezone || appTimezone();
  const now = new Date();

  const states = config
    .map((c) => {
      const timestamps = logs
        .filter((l) => l.exercise === c.name)
        .map((l) => l.timestamp);
      const state = deriveState(c, timestamps, now, tz);
      const le = lastEntryFor(logs, c.name);
      if (le && (le.weight || le.reps || le.sets)) {
        state.last = {
          weight: le.weight,
          reps: le.reps,
          sets: le.sets,
          timestamp: le.timestamp,
        };
      }
      return state;
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  const summary = buildSummary(logs, now, tz, 7);

  return NextResponse.json({
    states,
    summary,
    timezone: tz,
    displayName: meta.displayName ?? null,
  });
}
