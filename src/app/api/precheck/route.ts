import { NextRequest, NextResponse } from "next/server";
import { evaluateLog } from "@/lib/cadence";
import { appTimezone, getConfig, getLogs } from "@/lib/data";

export const dynamic = "force-dynamic";

// GET /api/precheck?exercise=Squats&timestamp=<iso?>
// Advisory warnings to show BEFORE writing. Never blocks.
export async function GET(req: NextRequest) {
  const tz = appTimezone();
  const exercise = req.nextUrl.searchParams.get("exercise");
  const tsParam = req.nextUrl.searchParams.get("timestamp");
  const at = tsParam ? new Date(tsParam) : new Date();

  if (!exercise) {
    return NextResponse.json({ error: "exercise required" }, { status: 400 });
  }

  const [config, logs] = await Promise.all([getConfig(), getLogs()]);
  const cfg = config.find((c) => c.name === exercise);
  if (!cfg) {
    return NextResponse.json({ error: "unknown exercise" }, { status: 404 });
  }

  const priors = logs.filter((l) => l.exercise === exercise).map((l) => l.timestamp);
  const warnings = evaluateLog(cfg, priors, at, tz);
  return NextResponse.json({ warnings });
}
