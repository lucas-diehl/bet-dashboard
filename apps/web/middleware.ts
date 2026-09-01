import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SIM_COOKIE, verifySessionToken, verifySimToken } from "@/lib/auth";

// Public paths that never require a session.
const PUBLIC = ["/login", "/api/auth", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith("/api/auth"))) {
    return NextResponse.next();
  }
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Second gate: the served simulator (owner-only). The unlock page + its API are
  // reachable with just the site session; the HTML itself needs the sim cookie.
  if (pathname === "/simulator") {
    const sim = await verifySimToken(req.cookies.get(SIM_COOKIE)?.value);
    if (!sim) {
      const url = req.nextUrl.clone();
      url.pathname = "/simulator/unlock";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
