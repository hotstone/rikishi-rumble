import { getDb } from "./db";
import { getConfig } from "./config";
import { userIdFromName } from "./users";
import { currentBashoDay } from "./basho";
import { isSubstitutionWindowOpen } from "./substitution";
import { loadAllStableStates, stableForDayFrom } from "./stable";

/** Display initials per user ID, from config with first-letter fallback. */
export function getUserInitialsMap(): Record<string, string> {
  const initials: Record<string, string> = {};
  for (const user of getConfig().users) {
    initials[userIdFromName(user.name)] = user.initials || user.name.charAt(0).toUpperCase();
  }
  return initials;
}

/** The full bouts-by-day payload for the Basho page. */
export function getBoutsPayload(bashoId: string, requestingUserId: string | null) {
  const db = getDb();

  const days = db
    .prepare("SELECT DISTINCT day FROM bout_results WHERE basho_id = ? ORDER BY day")
    .all(bashoId) as { day: number }[];

  const syncedDays = new Set(days.map((d) => d.day));

  const bouts = db
    .prepare(
      `SELECT br.day, br.east_id, br.west_id, br.winner_id, br.kimarite, br.is_kimboshi,
              re.name as east_name, re.rank as east_rank,
              rw.name as west_name, rw.rank as west_rank
       FROM bout_results br
       LEFT JOIN rikishi_cache re ON re.id = br.east_id AND re.basho_id = br.basho_id
       LEFT JOIN rikishi_cache rw ON rw.id = br.west_id AND rw.basho_id = br.basho_id
       WHERE br.basho_id = ?
       ORDER BY br.day, br.id`
    )
    .all(bashoId) as {
    day: number;
    east_id: number;
    west_id: number;
    winner_id: number | null;
    kimarite: string | null;
    is_kimboshi: number;
    east_name: string | null;
    east_rank: string | null;
    west_name: string | null;
    west_rank: string | null;
  }[];

  const users = db.prepare("SELECT id, name FROM users").all() as { id: string; name: string }[];
  const userInitials = getUserInitialsMap();
  for (const u of users) {
    userInitials[u.id] = userInitials[u.id] || u.name.charAt(0).toUpperCase();
  }

  const states = loadAllStableStates(db, bashoId);
  const rikishiOwners: Record<number, Record<number, string[]>> = {};

  for (let day = 1; day <= 15; day++) {
    if (!syncedDays.has(day)) continue;

    const dayOwners: Record<number, string[]> = {};

    for (const user of users) {
      const state = states.get(user.id);
      if (!state) continue;
      for (const rikishiId of stableForDayFrom(state, day).values()) {
        if (!dayOwners[rikishiId]) dayOwners[rikishiId] = [];
        dayOwners[rikishiId].push(userInitials[user.id]);
      }
    }

    rikishiOwners[day] = dayOwners;
  }

  // During substitution window, hide other users' owners for days that haven't
  // started yet (no bouts decided). Once any bout on a day has resolved, picks
  // become visible to everyone.
  const bashoRow = db
    .prepare("SELECT start_date FROM basho WHERE id = ?")
    .get(bashoId) as { start_date: string | null } | undefined;
  const windowOpen = isSubstitutionWindowOpen(
    bashoRow?.start_date ? new Date(bashoRow.start_date) : null
  );
  if (windowOpen) {
    const anyDecidedByDay = new Map<number, boolean>();
    for (const bout of bouts) {
      if (bout.winner_id) anyDecidedByDay.set(bout.day, true);
    }
    for (const day of Object.keys(rikishiOwners).map(Number)) {
      if (!anyDecidedByDay.get(day)) {
        for (const rikishiId of Object.keys(rikishiOwners[day]).map(Number)) {
          rikishiOwners[day][rikishiId] = rikishiOwners[day][rikishiId].filter((initials) => {
            if (!requestingUserId) return false;
            return initials === userInitials[requestingUserId];
          });
        }
      }
    }
  }

  const boutsByDay: Record<
    number,
    {
      east_id: number;
      east_name: string;
      east_rank: string;
      west_id: number;
      west_name: string;
      west_rank: string;
      winner_id: number | null;
      kimarite: string | null;
      is_kimboshi: boolean;
      east_owners: string[];
      west_owners: string[];
    }[]
  > = {};

  for (const bout of bouts) {
    if (!boutsByDay[bout.day]) boutsByDay[bout.day] = [];
    const owners = rikishiOwners[bout.day] || {};
    boutsByDay[bout.day].push({
      east_id: bout.east_id,
      east_name: bout.east_name || `#${bout.east_id}`,
      east_rank: bout.east_rank || "?",
      west_id: bout.west_id,
      west_name: bout.west_name || `#${bout.west_id}`,
      west_rank: bout.west_rank || "?",
      winner_id: bout.winner_id,
      kimarite: bout.kimarite,
      is_kimboshi: !!bout.is_kimboshi,
      east_owners: owners[bout.east_id] || [],
      west_owners: owners[bout.west_id] || [],
    });
  }

  const currentDay = currentBashoDay(bashoRow?.start_date || null);

  return {
    basho: bashoId,
    currentDay,
    syncedDays: Array.from(syncedDays),
    boutsByDay,
    myInitials: requestingUserId ? userInitials[requestingUserId] ?? null : null,
  };
}
