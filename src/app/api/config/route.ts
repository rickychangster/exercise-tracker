import { NextResponse } from "next/server";
import { getConfig } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getConfig();
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, hint: "GET /api/health for diagnostics" },
      { status: 500 },
    );
  }
}
