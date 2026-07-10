import type Database from "better-sqlite3";

type Db = Database.Database;

interface SubRow {
  tier: number;
  new_rikishi: number;
  day: number;
}

function loadStableState(
  db: Db,
  bashoId: string,
  userId: string
): { byTier: Map<number, number>; subs: SubRow[] } {
  const stables = db
    .prepare(
      "SELECT tier, rikishi_id FROM stables WHERE basho_id = ? AND user_id = ?"
    )
    .all(bashoId, userId) as { tier: number; rikishi_id: number }[];

  const subs = db
    .prepare(
      "SELECT tier, new_rikishi, day FROM substitutions WHERE basho_id = ? AND user_id = ? ORDER BY created_at"
    )
    .all(bashoId, userId) as SubRow[];

  const byTier = new Map<number, number>();
  for (const s of stables) byTier.set(s.tier, s.rikishi_id);

  return { byTier, subs };
}

/**
 * A user's active stable (tier -> rikishi) on a given day. A substitution made
 * on day N takes effect from day N+1, so only subs with day < `day` apply.
 */
export function stableForDay(
  db: Db,
  bashoId: string,
  userId: string,
  day: number
): Map<number, number> {
  const { byTier, subs } = loadStableState(db, bashoId, userId);
  for (const sub of subs) {
    if (sub.day < day) byTier.set(sub.tier, sub.new_rikishi);
  }
  return byTier;
}

/** A user's current effective stable with all substitutions applied. */
export function currentStable(
  db: Db,
  bashoId: string,
  userId: string
): Map<number, number> {
  const { byTier, subs } = loadStableState(db, bashoId, userId);
  for (const sub of subs) byTier.set(sub.tier, sub.new_rikishi);
  return byTier;
}
