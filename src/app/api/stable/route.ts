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

  // Get original stable selections
  const stables = db
    .prepare(
      "SELECT tier, rikishi_id FROM stables WHERE basho_id = ? AND user_id = ? ORDER BY tier"
    )
    .all(bashoId, userId) as { tier: number; rikishi_id: number }[];

  // Apply all substitutions to get the current effective stable
  const allSubs = db
    .prepare(
      "SELECT tier, old_rikishi, new_rikishi FROM substitutions WHERE basho_id = ? AND user_id = ? ORDER BY created_at"
    )
    .all(bashoId, userId) as { tier: number; old_rikishi: number; new_rikishi: number }[];

  const activeByTier = new Map<number, number>();
  for (const s of stables) {
    activeByTier.set(s.tier, s.rikishi_id);
  }
  // Use first sub's old_rikishi as true origin (corrects stables mutation bug)
  const seenTiers = new Set<number>();
  for (const sub of allSubs) {
    if (!seenTiers.has(sub.tier)) {
      activeByTier.set(sub.tier, sub.old_rikishi);
      seenTiers.add(sub.tier);
    }
  }
  // Apply all subs to get current state
  for (const sub of allSubs) {
    activeByTier.set(sub.tier, sub.new_rikishi);
  }

  // Fetch names/ranks for the effective wrestlers
  const result = [];
  for (const [tier, rikishiId] of [...activeByTier.entries()].sort(([a], [b]) => a - b)) {
    const wrestler = db
      .prepare("SELECT name, rank FROM rikishi_cache WHERE id = ? AND basho_id = ?")
      .get(rikishiId, bashoId) as { name: string; rank: string } | undefined;
    result.push({ tier, rikishi_id: rikishiId, name: wrestler?.name ?? "", rank: wrestler?.rank ?? "" });
  }

  return NextResponse.json({ stable: result, basho: bashoId });
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
