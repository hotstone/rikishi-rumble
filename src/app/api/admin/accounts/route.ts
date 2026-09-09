import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session?.admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const accounts = getDb()
    .prepare("SELECT id, display_name, email, is_site_admin FROM accounts ORDER BY display_name")
    .all();

  return NextResponse.json({ accounts });
}
