import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, sha256Hex } from "@/lib/auth";

// Passphrase gate. If ACCESS_PASSPHRASE is unset, the app is fully open
// (demo mode). If set, every page/API requires a cookie matching the
// passphrase hash; otherwise pages redirect to /login and APIs return 401.
export async function middleware(req: NextRequest) {
  const passphrase = process.env.ACCESS_PASSPHRASE;
  if (!passphrase) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  const expected = await sha256Hex(passphrase);
  if (cookie && cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and public static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg).*)"],
};
