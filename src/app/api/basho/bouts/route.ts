import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  const config = getConfig();
  const bashoId =
    request.nextUrl.searchParams.get("basho") || config.basho;

  const db = getDb();

  // Get all days with bout data
  const days = db
    .prepare(
      "SELECT DISTINCT day FROM bout_results WHERE basho_id = ? ORDER BY day"
    )
    .all(bashoId) as { day: number }[];

  const syncedDays = new Set(days.map((d) => d.day));

  // Get all bouts grouped by day
  const bouts = db
    .prepare(
      `SELECT br.day, br.winner_id, br.loser_id, br.kimarite, br.is_kimboshi,
              rw.name as winner_name, rw.rank as winner_rank,
              rl.name as loser_name, rl.rank as loser_rank
       FROM bout_results br
       LEFT JOIN rikishi_cache rw ON rw.id = br.winner_id AND rw.basho_id = br.basho_id
       LEFT JOIN rikishi_cache rl ON rl.id = br.loser_id AND rl.basho_id = br.basho_id
       WHERE br.basho_id = ?
       ORDER BY br.day, br.id`
    )
    .all(bashoId) as {
    day: number;
    winner_id: number;
    loser_id: number;
    kimarite: string;
    is_kimboshi: number;
    winner_name: string;
    winner_rank: string;
    loser_name: string;
    loser_rank: string;
  }[];

  // Build user stable mappings per day
  // Get all users
  const users = db
    .prepare("SELECT id, name FROM users")
    .all() as { id: string; name: string }[];

  // Get all stables
  const stables = db
    .prepare(
      "SELECT user_id, tier, rikishi_id FROM stables WHERE basho_id = ?"
    )
    .all(bashoId) as { user_id: string; tier: number; rikishi_id: number }[];

  // Get all substitutions
  const subs = db
    .prepare(
      "SELECT user_id, tier, new_rikishi, day FROM substitutions WHERE basho_id = ? ORDER BY created_at"
    )
    .all(bashoId) as {
    user_id: string;
    tier: number;
    new_rikishi: number;
    day: number;
  }[];

  // For each day, compute which rikishi each user had
  // rikishiOwners: { [day]: { [rikishiId]: ["M", "S", ...] } }
  const userInitials: Record<string, string> = {};
  for (const u of users) {
    userInitials[u.id] = u.name.charAt(0).toUpperCase();
  }

  const rikishiOwners: Record<number, Record<number, string[]>> = {};

  for (let day = 1; day <= 15; day++) {
    if (!syncedDays.has(day)) continue;

    const dayOwners: Record<number, string[]> = {};

    for (const user of users) {
      // Start with original stable
      const activeByTier = new Map<number, number>();
      for (const s of stables) {
        if (s.user_id === user.id) {
          activeByTier.set(s.tier, s.rikishi_id);
        }
      }

      // Apply substitutions before this day
      for (const sub of subs) {
        if (sub.user_id === user.id && sub.day < day) {
          activeByTier.set(sub.tier, sub.new_rikishi);
        }
      }

      for (const rikishiId of activeByTier.values()) {
        if (!dayOwners[rikishiId]) dayOwners[rikishiId] = [];
        dayOwners[rikishiId].push(userInitials[user.id]);
      }
    }

    rikishiOwners[day] = dayOwners;
  }

  // Group bouts by day
  const boutsByDay: Record<
    number,
    {
      winner_id: number;
      loser_id: number;
      winner_name: string;
      winner_rank: string;
      loser_name: string;
      loser_rank: string;
      kimarite: string;
      is_kimboshi: boolean;
      winner_owners: string[];
      loser_owners: string[];
    }[]
  > = {};

  for (const bout of bouts) {
    if (!boutsByDay[bout.day]) boutsByDay[bout.day] = [];
    const owners = rikishiOwners[bout.day] || {};
    boutsByDay[bout.day].push({
      winner_id: bout.winner_id,
      loser_id: bout.loser_id,
      winner_name: bout.winner_name,
      winner_rank: bout.winner_rank,
      loser_name: bout.loser_name,
      loser_rank: bout.loser_rank,
      kimarite: bout.kimarite,
      is_kimboshi: !!bout.is_kimboshi,
      winner_owners: owners[bout.winner_id] || [],
      loser_owners: owners[bout.loser_id] || [],
    });
  }

  const latestDay = db
    .prepare("SELECT MAX(day) as day FROM bout_results WHERE basho_id = ?")
    .get(bashoId) as { day: number | null };

  return NextResponse.json({
    basho: bashoId,
    currentDay: latestDay?.day || 0,
    syncedDays: Array.from(syncedDays),
    boutsByDay,
  });
}
