import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  findAccountByEmail,
  hashPassword,
  accountToSession,
  AccountRow,
} from "@/lib/auth";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";
import { userIdFromName } from "@/lib/users";

// Gated until Phase 5 delivers invite codes.
export async function POST(request: NextRequest) {
  if (process.env.SIGNUPS_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Signups are not open yet" },
      { status: 403 }
    );
  }

  const { email, displayName, initials, password } = await request.json();

  if (!email || !displayName || !password) {
    return NextResponse.json(
      { error: "Email, display name and password required" },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (initials && !/^[A-Za-z]{1,2}$/.test(initials)) {
    return NextResponse.json(
      { error: "Initials must be 1-2 letters" },
      { status: 400 }
    );
  }

  const db = getDb();
  if (findAccountByEmail(db, email)) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 }
    );
  }

  // Slug id from display name, de-duplicated with a numeric suffix.
  const base = userIdFromName(displayName);
  let id = base;
  for (let n = 2; db.prepare("SELECT 1 FROM accounts WHERE id = ?").get(id); n++) {
    id = `${base}-${n}`;
  }

  db.prepare(
    `INSERT INTO accounts (id, email, display_name, initials, password_hash, is_site_admin, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    email.trim(),
    displayName.trim(),
    initials ? initials.toUpperCase() : null,
    hashPassword(password),
    new Date().toISOString()
  );

  const account = { id, display_name: displayName.trim(), is_site_admin: 0 } as AccountRow;
  const session = accountToSession(account);
  const response = NextResponse.json(session, { status: 201 });
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(id),
    sessionCookieOptions
  );
  return response;
}
