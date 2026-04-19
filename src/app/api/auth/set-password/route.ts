import { NextRequest, NextResponse } from "next/server";
import { validatePin } from "@/lib/config";
import { getDb } from "@/lib/db";
import {
  hashPassword,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  makeSessionCookieValue,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { name, pin, password } = await request.json();

  if (!name || !pin || !password) {
    return NextResponse.json(
      { error: "Name, PIN, and new password required" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
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

  // Only allow set-password if user hasn't set one yet
  if (user.password_hash) {
    return NextResponse.json(
      { error: "Password already set. Use login instead." },
      { status: 400 }
    );
  }

  // Validate PIN one final time
  if (!validatePin(name, pin)) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  // Hash and store the new password
  const hash = hashPassword(password);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);

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
