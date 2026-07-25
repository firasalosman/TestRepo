// Minimal signed session cookie. This app is single-user and runs locally,
// so the cookie carries no data beyond "the owner completed Google OAuth" -
// it is never used to store tokens or any sensitive content. The actual
// Gmail OAuth tokens live encrypted in the OAuthToken table, server-side
// only.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "bet_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. See .env.example.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(): Promise<void> {
  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
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
