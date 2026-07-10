import { NextRequest } from "next/server";
import type { UserSession } from "@/types";

export type { UserSession };

export const SESSION_COOKIE = "rikishi-session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export function getSessionFromRequest(request: NextRequest): UserSession | null {
  const cookie = request.cookies.get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  try {
    const parsed = JSON.parse(cookie.value);
    if (parsed.userId && parsed.name && typeof parsed.admin === "boolean") {
      return parsed as UserSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function makeSessionCookieValue(session: UserSession): string {
  return JSON.stringify(session);
}
