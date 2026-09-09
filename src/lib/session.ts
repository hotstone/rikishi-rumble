import { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rikishi-session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// This module runs in the edge middleware — keep it free of Node-only
// imports (better-sqlite3, bcryptjs, fs). Account lookups live in auth.ts.

let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.SESSION_SECRET;
  if (secret) {
    cachedSecret = new TextEncoder().encode(secret);
    return cachedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }

  // Dev fallback: ephemeral per-process secret. Sessions reset on restart.
  console.warn("SESSION_SECRET not set — using an ephemeral dev secret");
  cachedSecret = crypto.getRandomValues(new Uint8Array(32));
  return cachedSecret;
}

/** Signed session token: HS256 JWT, payload {sub: accountId} only. */
export async function createSessionToken(accountId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(accountId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE)
    .sign(getSecret());
}

/** Returns the accountId if the token is valid and unexpired, else null. */
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** Account id from the request's session cookie, or null. Edge-safe. */
export async function getSessionAccountId(
  request: NextRequest
): Promise<string | null> {
  const cookie = request.cookies.get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  return verifySessionToken(cookie.value);
}

export const sessionCookieOptions = {
  path: "/",
  sameSite: "lax",
  maxAge: SESSION_MAX_AGE,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
} as const;
