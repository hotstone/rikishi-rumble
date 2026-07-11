import { getDb } from "./db";
import { currentBashoDay } from "./basho";
import { calculateScores } from "./scoring";
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
  console.log(`[sync] Banzuke synced for ${bashoId}: ${entries.length} rikishi`);
  return { count: entries.length };
}

export async function syncDay(
  bashoId: string,
  day: number
): Promise<{ bouts: number; pending: boolean; inProgress: boolean }> {
  const db = getDb();

  let matches: Awaited<ReturnType<typeof fetchTorikumi>>["matches"];
  try {
    const result = await fetchTorikumi(bashoId, day);
    matches = result.matches;

    // Ensure basho row exists and capture start_date if newly known
    if (result.startDate) {
      db.prepare(
        `INSERT INTO basho (id, start_date, status) VALUES (?, ?, 'active')
         ON CONFLICT(id) DO UPDATE SET start_date = COALESCE(basho.start_date, excluded.start_date)`
      ).run(bashoId, result.startDate);
    } else {
      db.prepare("INSERT OR IGNORE INTO basho (id, status) VALUES (?, 'active')").run(bashoId);
    }
  } catch {
    logSync(bashoId, day, "error", "Failed to fetch torikumi");
    console.log(`[sync] Day ${day} (${bashoId}): fetch failed`);
    return { bouts: 0, pending: true, inProgress: false };
  }

  if (!Array.isArray(matches) || matches.length === 0) {
    logSync(bashoId, day, "pending", "No match data available");
    console.log(`[sync] Day ${day} (${bashoId}): no match data`);
    return { bouts: 0, pending: true, inProgress: false };
  }

  if (matches.length < 10) {
    logSync(bashoId, day, "incomplete", `Only ${matches.length} bouts found`);
  }

  const getRikishi = db.prepare(
    "SELECT rank FROM rikishi_cache WHERE id = ? AND basho_id = ?"
  );
  const upsertRikishi = db.prepare(
    "INSERT INTO rikishi_cache (id, name, rank, basho_id, tier) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id, basho_id) DO UPDATE SET name = excluded.name, rank = excluded.rank, tier = excluded.tier"
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
          const isFusen = match.kimarite?.toLowerCase() === "fusen";
          if (
            isMaegashira(winnerRikishi.rank) &&
            isYokozuna(loserRikishi.rank) &&
            !isFusen
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

  const decidedCount = matches.filter((m) => m.winnerId).length;
  const inProgress = decidedCount > 0 && decidedCount < matches.length;
  console.log(
    `[sync] Day ${day} (${bashoId}): ${matches.length} bouts, ${decidedCount} decided${inProgress ? " (in progress)" : ""}`
  );

  return { bouts: matches.length, pending: false, inProgress };
}

export async function syncCurrentDay(
  bashoId: string
): Promise<{ day: number; bouts: number; pending: boolean; inProgress: boolean } | null> {
  const db = getDb();
  const basho = db
    .prepare("SELECT start_date FROM basho WHERE id = ?")
    .get(bashoId) as { start_date: string | null } | undefined;

  const day = currentBashoDay(basho?.start_date || null);
  if (day < 1) return null;

  const result = await syncDay(bashoId, day);
  calculateScores(bashoId);
  return { day, ...result };
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
