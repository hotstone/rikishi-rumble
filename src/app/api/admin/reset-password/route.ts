import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser, findAccountById, setAccountPassword } from "@/lib/auth";

/**
 * Site-admin sets a temporary password on an account. Interim reset flow
 * until Phase 6 adds email-based reset (generated emails can't receive mail).
 */
export async function POST(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session?.admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { accountId, tempPassword } = await request.json();

  if (!accountId || !tempPassword) {
    return NextResponse.json(
      { error: "accountId and tempPassword required" },
      { status: 400 }
    );
  }
  if (tempPassword.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const db = getDb();
  const account = findAccountById(db, accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  setAccountPassword(db, accountId, tempPassword);

  return NextResponse.json({
    success: true,
    message: `Temporary password set for ${account.display_name}.`,
  });
}
