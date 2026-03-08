import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getConfig, validatePin } from "@/lib/config";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getConfig().basho;

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const db = getDb();
  const stables = db
    .prepare(
      `SELECT s.tier, s.rikishi_id, r.name, r.rank
       FROM stables s
       LEFT JOIN rikishi_cache r ON r.id = s.rikishi_id AND r.basho_id = s.basho_id
       WHERE s.basho_id = ? AND s.user_id = ?
       ORDER BY s.tier`
    )
    .all(bashoId, userId);

  return NextResponse.json({ stable: stables, basho: bashoId });
}

export async function POST(request: NextRequest) {
  const { userName, pin, picks } = await request.json();

  if (!userName || !pin || !picks) {
    return NextResponse.json(
      { error: "userName, pin, and picks required" },
      { status: 400 }
    );
  }

  if (!validatePin(userName, pin)) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const config = getConfig();
  const bashoId = config.basho;
  const userId = userName.toLowerCase().replace(/\s+/g, "-");
  const db = getDb();

  // Validate picks: must have exactly 5 picks, one per tier
  if (!Array.isArray(picks) || picks.length !== 5) {
    return NextResponse.json(
      { error: "Must pick exactly 5 wrestlers (one per tier)" },
      { status: 400 }
    );
  }

  const tiers = new Set<number>();
  for (const pick of picks) {
    if (tiers.has(pick.tier)) {
      return NextResponse.json(
        { error: `Duplicate tier: ${pick.tier}` },
        { status: 400 }
      );
    }
    tiers.add(pick.tier);

    // Validate wrestler is in correct tier
    const wrestler = db
      .prepare(
        "SELECT rank, tier FROM rikishi_cache WHERE id = ? AND basho_id = ?"
      )
      .get(pick.rikishiId, bashoId) as
      | { rank: string; tier: number }
      | undefined;

    if (!wrestler) {
      return NextResponse.json(
        { error: `Wrestler ${pick.rikishiId} not found` },
        { status: 400 }
      );
    }

    if (wrestler.tier !== pick.tier) {
      return NextResponse.json(
        { error: `Wrestler is tier ${wrestler.tier}, not tier ${pick.tier}` },
        { status: 400 }
      );
    }
  }

  const upsert = db.prepare(
    `INSERT INTO stables (basho_id, user_id, tier, rikishi_id, selected_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(basho_id, user_id, tier)
     DO UPDATE SET rikishi_id = excluded.rikishi_id, selected_at = excluded.selected_at`
  );

  const transaction = db.transaction(() => {
    for (const pick of picks) {
      upsert.run(
        bashoId,
        userId,
        pick.tier,
        pick.rikishiId,
        new Date().toISOString()
      );
    }
  });

  transaction();

  return NextResponse.json({ success: true });
}
