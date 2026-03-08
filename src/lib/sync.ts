import { getDb } from "./db";
import { getConfig } from "./config";
import {
  fetchBanzuke,
  fetchTorikumi,
  getRankTier,
  shortRank,
  isMaegashira,
  isYokozuna,
} from "./sumo-api";

export async function syncBanzuke(bashoId: string): Promise<{ count: number }> {
  const db = getDb();
  const entries = await fetchBanzuke(bashoId);

  const upsert = db.prepare(
    "INSERT INTO rikishi_cache (id, name, rank, basho_id, tier) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id, basho_id) DO UPDATE SET name = excluded.name, rank = excluded.rank, tier = excluded.tier"
  );

  const transaction = db.transaction(() => {
    for (const entry of entries) {
      const tier = getRankTier(entry.rank);
      const displayRank = shortRank(entry.rank);
      upsert.run(entry.rikishiID, entry.shikonaEn, displayRank, bashoId, tier);
    }
  });

  transaction();
  return { count: entries.length };
}

export async function syncDay(
  bashoId: string,
  day: number
): Promise<{ bouts: number; pending: boolean }> {
  const db = getDb();

  let matches: Awaited<ReturnType<typeof fetchTorikumi>>["matches"];
  try {
    const result = await fetchTorikumi(bashoId, day);
    matches = result.matches;

    // Store basho start date if available
    if (result.startDate) {
      db.prepare("UPDATE basho SET start_date = ? WHERE id = ? AND start_date IS NULL")
        .run(result.startDate, bashoId);
    }
  } catch {
    logSync(bashoId, day, "error", "Failed to fetch torikumi");
    return { bouts: 0, pending: true };
  }

  if (!Array.isArray(matches) || matches.length === 0) {
    logSync(bashoId, day, "pending", "No match data available");
    return { bouts: 0, pending: true };
  }

  if (matches.length < 10) {
    logSync(bashoId, day, "incomplete", `Only ${matches.length} bouts found`);
  }

  const getRikishi = db.prepare(
    "SELECT rank FROM rikishi_cache WHERE id = ? AND basho_id = ?"
  );
  const upsertRikishi = db.prepare(
    "INSERT INTO rikishi_cache (id, name, rank, basho_id, tier) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id, basho_id) DO NOTHING"
  );
  const deletePrevious = db.prepare(
    "DELETE FROM bout_results WHERE basho_id = ? AND day = ?"
  );
  const insertBout = db.prepare(
    "INSERT INTO bout_results (basho_id, day, east_id, west_id, winner_id, loser_id, kimarite, is_kimboshi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const transaction = db.transaction(() => {
    deletePrevious.run(bashoId, day);

    for (const match of matches) {
      // Ensure both wrestlers are in the cache (handles cross-division bouts)
      if (!getRikishi.get(match.eastId, bashoId)) {
        const rank = shortRank(match.eastRank);
        const tier = getRankTier(match.eastRank);
        upsertRikishi.run(match.eastId, match.eastShikona, rank, bashoId, tier);
      }
      if (!getRikishi.get(match.westId, bashoId)) {
        const rank = shortRank(match.westRank);
        const tier = getRankTier(match.westRank);
        upsertRikishi.run(match.westId, match.westShikona, rank, bashoId, tier);
      }
      let winnerId: number | null = null;
      let loserId: number | null = null;
      let isKimboshi = 0;

      if (match.winnerId) {
        winnerId = match.winnerId;
        loserId = match.winnerId === match.eastId ? match.westId : match.eastId;

        // Detect kimboshi
        const winnerRikishi = getRikishi.get(winnerId, bashoId) as
          | { rank: string }
          | undefined;
        const loserRikishi = getRikishi.get(loserId, bashoId) as
          | { rank: string }
          | undefined;

        if (winnerRikishi && loserRikishi) {
          if (
            isMaegashira(winnerRikishi.rank) &&
            isYokozuna(loserRikishi.rank)
          ) {
            isKimboshi = 1;
          }
        }
      }

      insertBout.run(
        bashoId,
        day,
        match.eastId,
        match.westId,
        winnerId,
        loserId,
        match.kimarite || null,
        isKimboshi
      );
    }
  });

  transaction();
  logSync(bashoId, day, "success", `${matches.length} bouts synced`);

  return { bouts: matches.length, pending: false };
}

export function calculateScores(bashoId: string): void {
  const db = getDb();
  const config = getConfig();

  const deleteScores = db.prepare(
    "DELETE FROM daily_scores WHERE basho_id = ?"
  );
  const insertScore = db.prepare(
    "INSERT INTO daily_scores (basho_id, user_id, day, points, kimboshi) VALUES (?, ?, ?, ?, ?)"
  );

  // Get all days that have bouts
  const days = db
    .prepare(
      "SELECT DISTINCT day FROM bout_results WHERE basho_id = ? ORDER BY day"
    )
    .all(bashoId) as { day: number }[];

  const transaction = db.transaction(() => {
    deleteScores.run(bashoId);

    for (const user of config.users) {
      const userId = user.name.toLowerCase().replace(/\s+/g, "-");

      for (const { day } of days) {
        // Get user's active stable for this day (accounting for substitutions)
        const activeWrestlers = getActiveStableForDay(db, bashoId, userId, day);

        let points = 0;
        let kimboshi = 0;

        for (const wrestlerId of activeWrestlers) {
          // Count wins
          const wins = db
            .prepare(
              "SELECT COUNT(*) as count, SUM(is_kimboshi) as kb FROM bout_results WHERE basho_id = ? AND day = ? AND winner_id = ?"
            )
            .get(bashoId, day, wrestlerId) as {
            count: number;
            kb: number | null;
          };

          points += wins.count;
          kimboshi += wins.kb || 0;
        }

        // Kimboshi adds 1 extra point per occurrence
        points += kimboshi;

        insertScore.run(bashoId, userId, day, points, kimboshi);
      }
    }
  });

  transaction();
}

function getActiveStableForDay(
  db: ReturnType<typeof getDb>,
  bashoId: string,
  userId: string,
  day: number
): number[] {
  // Start with the original stable
  const stables = db
    .prepare(
      "SELECT tier, rikishi_id FROM stables WHERE basho_id = ? AND user_id = ?"
    )
    .all(bashoId, userId) as { tier: number; rikishi_id: number }[];

  const activeByTier = new Map<number, number>();
  for (const s of stables) {
    activeByTier.set(s.tier, s.rikishi_id);
  }

  // Apply substitutions up to (but not including) this day
  // Substitutions made on day X take effect from day X+1
  // But substitutions made in the evening of day X (after results) apply from day X+1
  const subs = db
    .prepare(
      "SELECT tier, new_rikishi, day as sub_day FROM substitutions WHERE basho_id = ? AND user_id = ? AND day < ? ORDER BY created_at"
    )
    .all(bashoId, userId, day) as {
    tier: number;
    new_rikishi: number;
    sub_day: number;
  }[];

  for (const sub of subs) {
    activeByTier.set(sub.tier, sub.new_rikishi);
  }

  return Array.from(activeByTier.values());
}

export async function syncAllDays(
  bashoId: string
): Promise<{ synced: number; pending: number }> {
  let synced = 0;
  let pending = 0;

  for (let day = 1; day <= 15; day++) {
    const result = await syncDay(bashoId, day);
    if (result.bouts > 0) synced++;
    if (result.pending) pending++;
  }

  calculateScores(bashoId);
  return { synced, pending };
}

function logSync(
  bashoId: string,
  day: number | null,
  status: string,
  message: string
) {
  const db = getDb();
  db.prepare(
    "INSERT INTO sync_log (basho_id, day, status, message, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(bashoId, day, status, message, new Date().toISOString());
}
