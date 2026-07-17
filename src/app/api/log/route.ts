import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { evaluateLog, localDateKey } from "@/lib/cadence";
import { appTimezone, appendLog, deleteLogRow, getConfig, getLogs, updateLogDetails } from "@/lib/data";
import type { LogEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST /api/log  { exercise, timestamp?, quantity?, note?, id? }
// Writes the log (NEVER blocks) and returns the recomputed warnings.
export async function POST(req: NextRequest) {
  const tz = appTimezone();
  const body = await req.json().catch(() => null);
  if (!body?.exercise) {
    return NextResponse.json({ error: "exercise required" }, { status: 400 });
  }

  const [config, logs] = await Promise.all([getConfig(), getLogs()]);
  const cfg = config.find((c) => c.name === body.exercise);
  if (!cfg) {
    return NextResponse.json({ error: "unknown exercise" }, { status: 404 });
  }

  const at = body.timestamp ? new Date(body.timestamp) : new Date();
  const priors = logs.filter((l) => l.exercise === body.exercise).map((l) => l.timestamp);
  const warnings = evaluateLog(cfg, priors, at, tz);

  const entry: LogEntry = {
    id: typeof body.id === "string" && body.id ? body.id : uuidv4(),
    exercise: body.exercise,
    timestamp: at.toISOString(),
    date: localDateKey(at, tz),
    note: typeof body.note === "string" && body.note ? body.note : undefined,
  };

  await appendLog(entry); // idempotent on entry.id

  return NextResponse.json({ entry, warnings });
}

// PATCH /api/log  { id, weight?, reps?, sets? }
// Attach optional actuals to an already-logged row, for future reference.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const updated = await updateLogDetails(String(body.id), {
    weight: str(body.weight),
    reps: str(body.reps),
    sets: str(body.sets),
    note: str(body.note),
  });
  return NextResponse.json({ updated });
}

// DELETE /api/log?id=...  — remove a logged row (Undo).
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const deleted = await deleteLogRow(id);
  return NextResponse.json({ deleted });
}
