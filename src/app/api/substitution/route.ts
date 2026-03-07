import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getConfig, validatePin } from "@/lib/config";
import { isSubstitutionWindowOpen } from "@/lib/substitution";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getConfig().basho;

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const db = getDb();

  const subs = db
    .prepare(
      `SELECT s.*, rc_old.name as old_name, rc_new.name as new_name
       FROM substitutions s
       LEFT JOIN rikishi_cache rc_old ON rc_old.id = s.old_rikishi AND rc_old.basho_id = s.basho_id
       LEFT JOIN rikishi_cache rc_new ON rc_new.id = s.new_rikishi AND rc_new.basho_id = s.basho_id
       WHERE s.basho_id = ? AND s.user_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(bashoId, userId);

  const windowStatus = isSubstitutionWindowOpen();

  return NextResponse.json({
    substitutions: subs,
    windowOpen: windowStatus,
  });
}

export async function POST(request: NextRequest) {
  const { userName, pin, tier, newRikishiId, day } = await request.json();

  if (!userName || !pin || !tier || !newRikishiId || !day) {
    return NextResponse.json(
      { error: "userName, pin, tier, newRikishiId, and day required" },
      { status: 400 }
    );
  }

  if (!validatePin(userName, pin)) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  if (!isSubstitutionWindowOpen()) {
    return NextResponse.json(
      { error: "Substitution window is closed" },
      { status: 403 }
    );
  }

  const config = getConfig();
  const bashoId = config.basho;
  const userId = userName.toLowerCase().replace(/\s+/g, "-");
  const db = getDb();

  // Check daily substitution limit (2 per day)
  const todaySubs = db
    .prepare(
      "SELECT COUNT(*) as count FROM substitutions WHERE basho_id = ? AND user_id = ? AND day = ?"
    )
    .get(bashoId, userId, day) as { count: number };

  if (todaySubs.count >= 2) {
    return NextResponse.json(
      { error: "Maximum 2 substitutions per day" },
      { status: 400 }
    );
  }

  // Validate new wrestler is in the same tier
  const newWrestler = db
    .prepare(
      "SELECT id, tier FROM rikishi_cache WHERE id = ? AND basho_id = ?"
    )
    .get(newRikishiId, bashoId) as { id: number; tier: number } | undefined;

  if (!newWrestler || newWrestler.tier !== tier) {
    return NextResponse.json(
      { error: "New wrestler must be from the same tier" },
      { status: 400 }
    );
  }

  // Get current wrestler in this tier
  const currentStable = db
    .prepare(
      "SELECT rikishi_id FROM stables WHERE basho_id = ? AND user_id = ? AND tier = ?"
    )
    .get(bashoId, userId, tier) as { rikishi_id: number } | undefined;

  if (!currentStable) {
    return NextResponse.json(
      { error: "No wrestler in this tier to substitute" },
      { status: 400 }
    );
  }

  // Check for later substitutions in this tier
  const laterSub = db
    .prepare(
      "SELECT new_rikishi FROM substitutions WHERE basho_id = ? AND user_id = ? AND tier = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(bashoId, userId, tier) as { new_rikishi: number } | undefined;

  const oldRikishi = laterSub?.new_rikishi || currentStable.rikishi_id;

  // Record substitution
  db.prepare(
    "INSERT INTO substitutions (basho_id, user_id, day, old_rikishi, new_rikishi, tier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(bashoId, userId, day, oldRikishi, newRikishiId, tier, new Date().toISOString());

  // Update the stable
  db.prepare(
    "UPDATE stables SET rikishi_id = ?, selected_at = ? WHERE basho_id = ? AND user_id = ? AND tier = ?"
  ).run(newRikishiId, new Date().toISOString(), bashoId, userId, tier);

  return NextResponse.json({ success: true });
}
