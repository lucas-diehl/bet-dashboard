import { NextResponse } from "next/server";
import { SIM_COOKIE, createSimToken } from "@/lib/auth";

export const runtime = "nodejs";

// Owner-only unlock for /simulator. Requires the site session already (middleware),
// then the simulator password (SIMULATOR_PASSWORD). Sets a 30-day bh_sim cookie.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as { password?: string });
  const expected = process.env.SIMULATOR_PASSWORD;
  // Trim both sides — the env var can carry a stray trailing newline (e.g. set via
  // a shell pipe), which would otherwise never match the typed password.
  if (!expected || (body?.password ?? "").trim() !== expected.trim()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const res = NextResponse.json({ ok: true });
  // No maxAge → a SESSION cookie: the browser drops it when fully closed, so the
  // simulator re-prompts for the password each browser session (owner-only page).
  res.cookies.set(SIM_COOKIE, await createSimToken(), {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax",
    path: "/",
  });
  return res;
}
