import { getDb } from "./db";
import { loadRecords, type RikishiRecord } from "./records";

export interface WrestlerRow {
  id: number;
  name: string;
  rank: string;
  tier: number;
  wins: number;
  losses: number;
}

type CacheRow = Omit<WrestlerRow, "wins" | "losses">;

function withRecord(w: CacheRow, records: Map<number, RikishiRecord>): WrestlerRow {
  const record = records.get(w.id);
  return { ...w, wins: record?.wins ?? 0, losses: record?.losses ?? 0 };
}

/**
 * Wrestlers for a basho, optionally filtered to a tier and/or to those
 * appearing in a given day's bouts. Juryo fill-ins (tier 0) surface as tier 5.
 */
export function getWrestlers(
  bashoId: string,
  tier: number | null,
  day: number | null
): WrestlerRow[] {
  const db = getDb();
  const records = loadRecords(db, bashoId);

  if (day !== null) {
    const bouts = db
      .prepare("SELECT east_id, west_id FROM bout_results WHERE basho_id = ? AND day = ?")
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
        .all(bashoId, ...Array.from(fighterIds)) as CacheRow[];

      const wrestlers = rows.map((w) =>
        withRecord({ ...w, tier: w.tier === 0 ? 5 : w.tier }, records)
      );

      const filtered = tier !== null ? wrestlers.filter((w) => w.tier === tier) : wrestlers;

      filtered.sort((a, b) => a.tier - b.tier || a.rank.localeCompare(b.rank));

      return filtered;
    }
  }

  // Fallback: all rikishi_cache entries
  let query = "SELECT id, name, rank, tier FROM rikishi_cache WHERE basho_id = ?";
  const params: (string | number)[] = [bashoId];

  if (tier !== null) {
    query += " AND tier = ?";
    params.push(tier);
  }

  query += " ORDER BY tier, rank";

  const rows = db.prepare(query).all(...params) as CacheRow[];
  return rows.map((w) => withRecord(w, records));
}
