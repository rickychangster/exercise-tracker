import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, sha256Hex } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST { passphrase } -> sets the auth cookie if it matches ACCESS_PASSPHRASE.
export async function POST(req: NextRequest) {
  const passphrase = process.env.ACCESS_PASSPHRASE;
  const body = await req.json().catch(() => null);
  const submitted = typeof body?.passphrase === "string" ? body.passphrase : "";

  if (!passphrase) return NextResponse.json({ ok: true, open: true });
  if (submitted !== passphrase) {
    return NextResponse.json({ error: "Incorrect passphrase" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await sha256Hex(passphrase), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 days
  });
  return res;
}
