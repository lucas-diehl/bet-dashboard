import { SignJWT, jwtVerify } from "jose";

// Single-user password gate. Login verifies SITE_PASSWORD and issues a signed
// (HS256) session cookie; middleware verifies it on every request. Edge-safe (jose).
export const SESSION_COOKIE = "bh_session";

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "insecure-dev-secret-change-me");
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

// Second, stricter gate for /simulator — owner-only (SIMULATOR_PASSWORD), layered on
// top of the shared site login so friends with the site password still can't see it.
// Session-scoped (see the login route) so it re-prompts each browser session. The
// "2" suffix retires any older 30-day "bh_sim" cookies, forcing a fresh unlock.
export const SIM_COOKIE = "bh_sim2";

export async function createSimToken(): Promise<string> {
  return new SignJWT({ sub: "sim" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
}

export async function verifySimToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub === "sim";
  } catch {
    return false;
  }
}
