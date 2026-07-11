import type Database from "better-sqlite3";

type Db = Database.Database;

/** First window opens 18:00 JST on day 1 (= basho start + 9h, since startDate is 00:00 UTC = 09:00 JST). */
export function firstSubWindowOpen(bashoStartDate: Date): Date {
  return new Date(bashoStartDate.getTime() + 9 * 3600 * 1000);
}

/** Final window closes 16:00 JST on day 15 (= basho start + 14 days + 7h). */
export function finalSubWindowClose(bashoStartDate: Date): Date {
  return new Date(bashoStartDate.getTime() + (14 * 24 + 7) * 3600 * 1000);
}

export interface SubWindow {
  opensAt: Date;
  closesAt: Date;
}

/**
 * The 14 nightly substitution windows: each opens 18:00 JST and closes 16:00
 * JST the next day (blackout 16:00-18:00). JST has no DST, so fixed-offset
 * arithmetic is exact.
 */
export function subWindowIntervals(bashoStartDate: Date): SubWindow[] {
  const start = bashoStartDate.getTime();
  const windows: SubWindow[] = [];
  for (let d = 0; d < 14; d++) {
    windows.push({
      opensAt: new Date(start + (d * 24 + 9) * 3600 * 1000),
      closesAt: new Date(start + ((d + 1) * 24 + 7) * 3600 * 1000),
    });
  }
  return windows;
}

/**
 * The basho day the currently-open window belongs to (window N covers the
 * evening of day N through 16:00 JST on day N+1; a sub made in it takes
 * effect on day N+1). Null when no window is open.
 */
export function subWindowDay(bashoStartDate: Date | null, now: Date = new Date()): number | null {
  if (!bashoStartDate) return null;
  const idx = subWindowIntervals(bashoStartDate).findIndex(
    (w) => now >= w.opensAt && now < w.closesAt
  );
  return idx === -1 ? null : idx + 1;
}

export function isSubstitutionWindowOpen(
  bashoStartDate: Date | null,
  now: Date = new Date()
): boolean {
  return subWindowDay(bashoStartDate, now) !== null;
}

function bashoStartDate(db: Db, bashoId: string): Date | null {
  const row = db
    .prepare("SELECT start_date FROM basho WHERE id = ?")
    .get(bashoId) as { start_date: string | null } | undefined;
  return row?.start_date ? new Date(row.start_date) : null;
}

/** A user's substitution history plus window state, for the GET payload. */
export function getSubstitutions(db: Db, bashoId: string, userId: string) {
  const substitutions = db
    .prepare(
      `SELECT s.*, rc_old.name as old_name, rc_new.name as new_name
       FROM substitutions s
       LEFT JOIN rikishi_cache rc_old ON rc_old.id = s.old_rikishi AND rc_old.basho_id = s.basho_id
       LEFT JOIN rikishi_cache rc_new ON rc_new.id = s.new_rikishi AND rc_new.basho_id = s.basho_id
       WHERE s.basho_id = ? AND s.user_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(bashoId, userId);

  const start = bashoStartDate(db, bashoId);
  const windowDay = subWindowDay(start);

  return {
    substitutions,
    windowOpen: windowDay !== null,
    windowDay,
  };
}

/**
 * Validate and record a substitution. The effective day is derived from the
 * open window server-side — never from the client. Returns null on success.
 */
export function applySubstitution(
  db: Db,
  bashoId: string,
  userId: string,
  tier: number,
  newRikishiId: number
): { error: string; status: number } | null {
  const day = subWindowDay(bashoStartDate(db, bashoId));
  if (day === null) {
    return { error: "Substitution window is closed", status: 403 };
  }

  // Daily substitution limit (2 per day)
  const todaySubs = db
    .prepare(
      "SELECT COUNT(*) as count FROM substitutions WHERE basho_id = ? AND user_id = ? AND day = ?"
    )
    .get(bashoId, userId, day) as { count: number };

  if (todaySubs.count >= 2) {
    return { error: "Maximum 2 substitutions per day", status: 400 };
  }

  const newWrestler = db
    .prepare("SELECT id, tier FROM rikishi_cache WHERE id = ? AND basho_id = ?")
    .get(newRikishiId, bashoId) as { id: number; tier: number } | undefined;

  if (!newWrestler) {
    return { error: "Wrestler not found", status: 400 };
  }

  // The new wrestler must be scheduled to fight on the day the sub takes effect
  const nextDay = day + 1;
  const boutEntry = db
    .prepare(
      "SELECT 1 FROM bout_results WHERE basho_id = ? AND day = ? AND (east_id = ? OR west_id = ?)"
    )
    .get(bashoId, nextDay, newRikishiId, newRikishiId);

  if (!boutEntry) {
    return { error: "Wrestler is not scheduled to fight on day " + nextDay, status: 400 };
  }

  // Tier 0 = Juryo fill-in; treat as tier 5 for validation
  const effectiveTier = newWrestler.tier === 0 ? 5 : newWrestler.tier;

  if (effectiveTier !== tier) {
    return { error: "New wrestler must be from the same tier", status: 400 };
  }

  // Current wrestler in this tier (original pick, then latest sub if any)
  const currentStable = db
    .prepare(
      "SELECT rikishi_id FROM stables WHERE basho_id = ? AND user_id = ? AND tier = ?"
    )
    .get(bashoId, userId, tier) as { rikishi_id: number } | undefined;

  if (!currentStable) {
    return { error: "No wrestler in this tier to substitute", status: 400 };
  }

  const laterSub = db
    .prepare(
      "SELECT new_rikishi FROM substitutions WHERE basho_id = ? AND user_id = ? AND tier = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(bashoId, userId, tier) as { new_rikishi: number } | undefined;

  const oldRikishi = laterSub?.new_rikishi || currentStable.rikishi_id;

  // Record substitution (stables table is never mutated — subs are the source of truth)
  db.prepare(
    "INSERT INTO substitutions (basho_id, user_id, day, old_rikishi, new_rikishi, tier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(bashoId, userId, day, oldRikishi, newRikishiId, tier, new Date().toISOString());

  return null;
}
