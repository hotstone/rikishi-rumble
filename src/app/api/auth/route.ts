import { NextRequest, NextResponse } from "next/server";
import { validatePin, getConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import {
  verifyPassword,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  makeSessionCookieValue,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { name, password } = await request.json();

  if (!name || !password) {
    return NextResponse.json(
      { error: "Name and password required" },
      { status: 400 }
    );
  }

  const userId = name.toLowerCase().replace(/\s+/g, "-");
  const db = getDb();
  const user = db
    .prepare("SELECT id, name, password_hash, admin FROM users WHERE id = ?")
    .get(userId) as
    | { id: string; name: string; password_hash: string | null; admin: number }
    | undefined;

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // User has a password set — verify with bcrypt
  if (user.password_hash) {
    if (!verifyPassword(password, user.password_hash)) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    const session = { userId: user.id, name: user.name, admin: !!user.admin };
    const response = NextResponse.json({
      userId: session.userId,
      name: session.name,
      admin: session.admin,
    });
    response.cookies.set(SESSION_COOKIE, makeSessionCookieValue(session), {
      path: "/",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      httpOnly: false,
    });
    return response;
  }

  // No password yet — validate old PIN for migration
  if (!validatePin(name, password)) {
    return NextResponse.json(
      { error: "Invalid PIN" },
      { status: 401 }
    );
  }

  // PIN valid but no password set — prompt to set one
  return NextResponse.json({
    userId: user.id,
    name: user.name,
    admin: !!user.admin,
    needsPassword: true,
  });
}

export async function GET() {
  const config = getConfig();
  const users = config.users.map((u) => ({
    name: u.name,
    id: u.name.toLowerCase().replace(/\s+/g, "-"),
  }));
  return NextResponse.json({ users });
}
