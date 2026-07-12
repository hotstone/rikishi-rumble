import type Database from "better-sqlite3";
import { getDb } from "./db";
import { getConfig } from "./config";
import { userIdFromName } from "./users";
import { loadAllStableStates, stableForDayFrom } from "./stable";

type Db = Database.Database;

/** Wins and kimboshi per (day, wrestler), one query for the whole basho. */
function loadWins(db: Db, bashoId: string): Map<string, { w: number; kb: number }> {
  const rows = db
    .prepare(
      `SELECT day, winner_id, COUNT(*) as w, COALESCE(SUM(is_kimboshi), 0) as kb
       FROM bout_results WHERE basho_id = ? AND winner_id IS NOT NULL
       GROUP BY day, winner_id`
    )
    .all(bashoId) as { day: number; winner_id: number; w: number; kb: number }[];

  const wins = new Map<string, { w: number; kb: number }>();
  for (const r of rows) wins.set(`${r.day}|${r.winner_id}`, { w: r.w, kb: r.kb });
  return wins;
}

/** Full from-scratch recalculation of daily_scores for a basho. */
export function calculateScores(bashoId: string): void {
  const db = getDb();
  const config = getConfig();

  const days = db
    .prepare("SELECT DISTINCT day FROM bout_results WHERE basho_id = ? ORDER BY day")
    .all(bashoId) as { day: number }[];

  const wins = loadWins(db, bashoId);
  const states = loadAllStableStates(db, bashoId);

  const deleteScores = db.prepare("DELETE FROM daily_scores WHERE basho_id = ?");
  const insertScore = db.prepare(
    "INSERT INTO daily_scores (basho_id, user_id, day, points, kimboshi) VALUES (?, ?, ?, ?, ?)"
  );

  const transaction = db.transaction(() => {
    deleteScores.run(bashoId);

    for (const user of config.users) {
      const userId = userIdFromName(user.name);
      const state = states.get(userId) ?? { byTier: new Map(), subs: [] };

      for (const { day } of days) {
        let points = 0;
        let kimboshi = 0;

        for (const wrestlerId of stableForDayFrom(state, day).values()) {
          const win = wins.get(`${day}|${wrestlerId}`);
          if (win) {
            points += win.w;
            kimboshi += win.kb;
          }
        }

        insertScore.run(bashoId, userId, day, points, kimboshi);
      }
    }
  });

  transaction();
}

/** The full leaderboard payload for a basho. */
export function getLeaderboard(bashoId: string) {
  const db = getDb();

  const latestBoutDay = db
    .prepare(
      "SELECT MAX(day) as day FROM bout_results WHERE basho_id = ? AND winner_id IS NOT NULL"
    )
    .get(bashoId) as { day: number | null };

  const currentDay = latestBoutDay?.day || 0;

  // activeDay: a day with partial results (in progress), fallback to currentDay
  const activeDayRow = db
    .prepare(
      `SELECT day FROM (
         SELECT day,
           SUM(CASE WHEN winner_id IS NOT NULL THEN 1 ELSE 0 END) as decided,
           COUNT(*) as total
         FROM bout_results WHERE basho_id = ?
         GROUP BY day
       ) WHERE decided > 0 AND decided < total
       ORDER BY day DESC LIMIT 1`
    )
    .get(bashoId) as { day: number } | undefined;

  const activeDay = activeDayRow?.day ?? currentDay;

  const daysWithResults = db
    .prepare(
      "SELECT DISTINCT day FROM bout_results WHERE basho_id = ? AND winner_id IS NOT NULL ORDER BY day"
    )
    .all(bashoId) as { day: number }[];

  const users = db.prepare("SELECT id, name FROM users").all() as { id: string; name: string }[];

  const wins = loadWins(db, bashoId);
  const states = loadAllStableStates(db, bashoId);

  const rikishi = new Map(
    (
      db
        .prepare("SELECT id, name, rank FROM rikishi_cache WHERE basho_id = ?")
        .all(bashoId) as { id: number; name: string; rank: string }[]
    ).map((r) => [r.id, r])
  );

  const allScores = db
    .prepare(
      "SELECT user_id, day, points, kimboshi FROM daily_scores WHERE basho_id = ? ORDER BY day"
    )
    .all(bashoId) as { user_id: string; day: number; points: number; kimboshi: number }[];

  const scoresByUser = new Map<string, { day: number; points: number; kimboshi: number }[]>();
  for (const s of allScores) {
    let list = scoresByUser.get(s.user_id);
    if (!list) {
      list = [];
      scoresByUser.set(s.user_id, list);
    }
    list.push(s);
  }

  const leaderboard = users.map((user) => {
    const userScores = scoresByUser.get(user.id) ?? [];
    const total = userScores.reduce((sum, s) => sum + s.points, 0);
    const kb = userScores.reduce((sum, s) => sum + s.kimboshi, 0);
    const todayRow = userScores.find((s) => s.day === currentDay);

    const state = states.get(user.id) ?? { byTier: new Map(), subs: [] };

    const dailyWrestlers: Record<
      number,
      { tier: number; rikishi_id: number; name: string; rank: string; points: number; kimboshi: number }[]
    > = {};

    for (const { day } of daysWithResults) {
      const tierMap = stableForDayFrom(state, day);
      dailyWrestlers[day] = [...tierMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([tier, rikishi_id]) => {
          const r = rikishi.get(rikishi_id);
          const win = wins.get(`${day}|${rikishi_id}`);
          return {
            tier,
            rikishi_id,
            name: r?.name ?? "",
            rank: r?.rank ?? "",
            points: win?.w ?? 0,
            kimboshi: win?.kb ?? 0,
          };
        });
    }

    const dailyPoints: Record<number, number> = {};
    const dailyKimboshi: Record<number, number> = {};
    for (const ds of userScores) {
      dailyPoints[ds.day] = ds.points;
      dailyKimboshi[ds.day] = ds.kimboshi;
    }

    return {
      user_id: user.id,
      user_name: user.name,
      total_points: total,
      today_points: todayRow?.points || 0,
      today_kimboshi: todayRow?.kimboshi || 0,
      kimboshi_total: kb,
      dailyWrestlers,
      dailyPoints,
      dailyKimboshi,
    };
  });

  leaderboard.sort(
    (a, b) => b.total_points - a.total_points || b.kimboshi_total - a.kimboshi_total
  );

  const pendingSync = db
    .prepare("SELECT COUNT(*) as count FROM sync_log WHERE basho_id = ? AND status = 'pending'")
    .get(bashoId) as { count: number };

  const undecided = db
    .prepare(
      "SELECT COUNT(*) as count FROM bout_results WHERE basho_id = ? AND winner_id IS NULL"
    )
    .get(bashoId) as { count: number };

  return {
    leaderboard,
    currentDay,
    activeDay,
    basho: bashoId,
    hasPendingResults: pendingSync.count > 0,
    hasUndecidedBouts: undecided.count > 0,
  };
}
