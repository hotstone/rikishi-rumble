import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

const SALT_ROUNDS = 10;

export interface UserSession {
  userId: string;
  name: string;
  admin: boolean;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export const SESSION_COOKIE = "rikishi-session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export function getSessionFromRequest(request: NextRequest): UserSession | null {
  const cookie = request.cookies.get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(cookie.value));
    if (parsed.userId && parsed.name && typeof parsed.admin === "boolean") {
      return parsed as UserSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function makeSessionCookieValue(session: UserSession): string {
  return encodeURIComponent(JSON.stringify(session));
}
