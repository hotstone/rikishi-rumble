import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  const tier = request.nextUrl.searchParams.get("tier");
  const dayParam = request.nextUrl.searchParams.get("day");
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getConfig().basho;

  const db = getDb();

  // When a day is requested, filter to only wrestlers appearing in that day's bouts
  if (dayParam) {
    const day = parseInt(dayParam);
    const bouts = db
      .prepare(
        "SELECT east_id, west_id FROM bout_results WHERE basho_id = ? AND day = ?"
      )
      .all(bashoId, day) as { east_id: number; west_id: number }[];

    if (bouts.length > 0) {
      const fighterIds = new Set<number>();
      for (const b of bouts) {
        fighterIds.add(b.east_id);
        fighterIds.add(b.west_id);
      }

      const placeholders = Array.from(fighterIds).map(() => "?").join(", ");
      const rows = db
        .prepare(
          `SELECT id, name, rank, tier FROM rikishi_cache WHERE basho_id = ? AND id IN (${placeholders})`
        )
        .all(bashoId, ...Array.from(fighterIds)) as { id: number; name: string; rank: string; tier: number }[];

      // Juryo fill-ins have tier 0 — treat them as tier 5
      const wrestlers = rows.map((w) => ({
        ...w,
        tier: w.tier === 0 ? 5 : w.tier,
      }));

      const filtered = tier
        ? wrestlers.filter((w) => w.tier === parseInt(tier))
        : wrestlers;

      filtered.sort((a, b) => a.tier - b.tier || a.rank.localeCompare(b.rank));

      return NextResponse.json({ wrestlers: filtered, basho: bashoId });
    }
  }

  // Fallback: return all rikishi_cache entries
  let query = "SELECT id, name, rank, tier FROM rikishi_cache WHERE basho_id = ?";
  const params: (string | number)[] = [bashoId];

  if (tier) {
    query += " AND tier = ?";
    params.push(parseInt(tier));
  }

  query += " ORDER BY tier, rank";

  const wrestlers = db.prepare(query).all(...params);

  return NextResponse.json({ wrestlers, basho: bashoId });
}
