import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authenticateAccount, accountToSession } from "@/lib/auth";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 }
    );
  }

  const account = authenticateAccount(getDb(), email, password);
  if (!account) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  const session = accountToSession(account);
  const response = NextResponse.json(session);
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(account.id),
    sessionCookieOptions
  );
  return response;
}
