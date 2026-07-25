// Minimal signed session cookie. This app is single-user and runs locally,
// so the cookie carries no data beyond "the owner completed Google OAuth" -
// it is never used to store tokens or any sensitive content. The actual
// Gmail OAuth tokens live encrypted in the OAuthToken table, server-side
// only.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "bet_session";
const COOKIE_NAME = SESSION_COOKIE_NAME;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: MAX_AGE_SECONDS,
  path: "/",
};

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. See .env.example.");
  }
  return new TextEncoder().encode(secret);
}

// Returns the signed session token. Prefer this + setting the cookie
// directly on the NextResponse you return (see the OAuth callback route) -
// that is more reliable than the ambient cookies() jar when the handler
// redirects, since some runtimes don't reliably merge the two.
export async function createSessionToken(): Promise<string> {
  return new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function createSession(): Promise<void> {
  const token = await createSessionToken();
  cookies().set(COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecretKey());
    return true;
  } catch {
    return false;
  }
}

export function clearSession(): void {
  cookies().delete(COOKIE_NAME);
}
