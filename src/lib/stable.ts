import type Database from "better-sqlite3";
import { stableLockDate } from "./basho";
import { loadRecords } from "./records";

type Db = Database.Database;

interface SubRow {
  tier: number;
  new_rikishi: number;
  day: number;
}

export interface StableState {
  byTier: Map<number, number>;
  subs: SubRow[];
}

export function loadStableState(db: Db, bashoId: string, userId: string): StableState {
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

/** All users' stable states for a basho in two queries (for leaderboard/bouts). */
export function loadAllStableStates(db: Db, bashoId: string): Map<string, StableState> {
  const stables = db
    .prepare("SELECT user_id, tier, rikishi_id FROM stables WHERE basho_id = ?")
    .all(bashoId) as { user_id: string; tier: number; rikishi_id: number }[];

  const subs = db
    .prepare(
      "SELECT user_id, tier, new_rikishi, day FROM substitutions WHERE basho_id = ? ORDER BY created_at"
    )
    .all(bashoId) as (SubRow & { user_id: string })[];

  const states = new Map<string, StableState>();
  const stateFor = (userId: string): StableState => {
    let state = states.get(userId);
    if (!state) {
      state = { byTier: new Map(), subs: [] };
      states.set(userId, state);
    }
    return state;
  };

  for (const s of stables) stateFor(s.user_id).byTier.set(s.tier, s.rikishi_id);
  for (const sub of subs) {
    stateFor(sub.user_id).subs.push({ tier: sub.tier, new_rikishi: sub.new_rikishi, day: sub.day });
  }

  return states;
}

/**
 * A user's active stable (tier -> rikishi) on a given day. A substitution made
 * on day N takes effect from day N+1, so only subs with day < `day` apply.
 */
export function stableForDayFrom(state: StableState, day: number): Map<number, number> {
  const byTier = new Map(state.byTier);
  for (const sub of state.subs) {
    if (sub.day < day) byTier.set(sub.tier, sub.new_rikishi);
  }
  return byTier;
}

/** A user's current effective stable with all substitutions applied. */
export function currentStableFrom(state: StableState): Map<number, number> {
  const byTier = new Map(state.byTier);
  for (const sub of state.subs) byTier.set(sub.tier, sub.new_rikishi);
  return byTier;
}

export function stableForDay(
  db: Db,
  bashoId: string,
  userId: string,
  day: number
): Map<number, number> {
  return stableForDayFrom(loadStableState(db, bashoId, userId), day);
}

export function currentStable(db: Db, bashoId: string, userId: string): Map<number, number> {
  return currentStableFrom(loadStableState(db, bashoId, userId));
}

/** The current effective stable with names/ranks, for the stable GET payload. */
export function stableWithDetails(
  db: Db,
  bashoId: string,
  userId: string
): { tier: number; rikishi_id: number; name: string; rank: string; wins: number; losses: number }[] {
  const activeByTier = currentStable(db, bashoId, userId);
  const records = loadRecords(db, bashoId);
  const lookup = db.prepare(
    "SELECT name, rank FROM rikishi_cache WHERE id = ? AND basho_id = ?"
  );

  const result = [];
  for (const [tier, rikishiId] of [...activeByTier.entries()].sort(([a], [b]) => a - b)) {
    const wrestler = lookup.get(rikishiId, bashoId) as { name: string; rank: string } | undefined;
    const record = records.get(rikishiId);
    result.push({
      tier,
      rikishi_id: rikishiId,
      name: wrestler?.name ?? "",
      rank: wrestler?.rank ?? "",
      wins: record?.wins ?? 0,
      losses: record?.losses ?? 0,
    });
  }
  return result;
}

export interface Pick {
  tier: number;
  rikishiId: number;
}

/** Validate and save a full 5-tier stable. Returns null on success. */
export function savePicks(
  db: Db,
  bashoId: string,
  userId: string,
  picks: Pick[]
): { error: string; status: number } | null {
  const bashoRow = db
    .prepare("SELECT start_date FROM basho WHERE id = ?")
    .get(bashoId) as { start_date: string | null } | undefined;

  if (new Date() >= stableLockDate(bashoId, bashoRow?.start_date || null)) {
    return {
      error: "Selections are locked — use substitutions to change your stable",
      status: 403,
    };
  }

  if (!Array.isArray(picks) || picks.length !== 5) {
    return { error: "Must pick exactly 5 wrestlers (one per tier)", status: 400 };
  }

  const tiers = new Set<number>();
  for (const pick of picks) {
    if (tiers.has(pick.tier)) {
      return { error: `Duplicate tier: ${pick.tier}`, status: 400 };
    }
    tiers.add(pick.tier);

    const wrestler = db
      .prepare("SELECT rank, tier FROM rikishi_cache WHERE id = ? AND basho_id = ?")
      .get(pick.rikishiId, bashoId) as { rank: string; tier: number } | undefined;

    if (!wrestler) {
      return { error: `Wrestler ${pick.rikishiId} not found`, status: 400 };
    }

    if (wrestler.tier !== pick.tier) {
      return {
        error: `Wrestler is tier ${wrestler.tier}, not tier ${pick.tier}`,
        status: 400,
      };
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
      upsert.run(bashoId, userId, pick.tier, pick.rikishiId, new Date().toISOString());
    }
  });

  transaction();
  return null;
}
