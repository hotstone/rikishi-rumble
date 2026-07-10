import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db";
import { userIdFromName } from "@/lib/users";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session || !session.admin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  const { targetUser } = await request.json();

  if (!targetUser) {
    return NextResponse.json(
      { error: "targetUser required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const targetId = userIdFromName(targetUser);
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Clear password_hash so the user must re-authenticate with their PIN and set a new password
  db.prepare("UPDATE users SET password_hash = NULL WHERE id = ?").run(targetId);

  return NextResponse.json({
    success: true,
    message: `Password reset for ${targetUser}. They will need to set a new password on next login.`,
  });
}
