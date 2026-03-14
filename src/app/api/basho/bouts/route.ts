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
      `SELECT br.day, br.east_id, br.west_id, br.winner_id, br.kimarite, br.is_kimboshi,
              COALESCE(re.name, re2.name) as east_name,
              COALESCE(re.rank, re2.rank) as east_rank,
              COALESCE(rw.name, rw2.name) as west_name,
              COALESCE(rw.rank, rw2.rank) as west_rank
       FROM bout_results br
       LEFT JOIN rikishi_cache re ON re.id = br.east_id AND re.basho_id = br.basho_id
       LEFT JOIN rikishi_cache re2 ON re2.id = br.east_id AND re2.basho_id != br.basho_id
       LEFT JOIN rikishi_cache rw ON rw.id = br.west_id AND rw.basho_id = br.basho_id
       LEFT JOIN rikishi_cache rw2 ON rw2.id = br.west_id AND rw2.basho_id != br.basho_id
       WHERE br.basho_id = ?
       GROUP BY br.id
       ORDER BY br.day, br.id`
    )
    .all(bashoId) as {
    day: number;
    east_id: number;
    west_id: number;
    winner_id: number | null;
    kimarite: string | null;
    is_kimboshi: number;
    east_name: string;
    east_rank: string;
    west_name: string;
    west_rank: string;
  }[];

  // Build user stable mappings per day
  const users = db
    .prepare("SELECT id, name FROM users")
    .all() as { id: string; name: string }[];

  const stables = db
    .prepare(
      "SELECT user_id, tier, rikishi_id FROM stables WHERE basho_id = ?"
    )
    .all(bashoId) as { user_id: string; tier: number; rikishi_id: number }[];

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

  const INITIALS: Record<string, string> = {
    Matt: "MH",
    Marc: "MC",
    Mac: "MR",
  };
  const userInitials: Record<string, string> = {};
  for (const u of users) {
    userInitials[u.id] = INITIALS[u.name] || u.name.charAt(0).toUpperCase();
  }

  const rikishiOwners: Record<number, Record<number, string[]>> = {};

  for (let day = 1; day <= 15; day++) {
    if (!syncedDays.has(day)) continue;

    const dayOwners: Record<number, string[]> = {};

    for (const user of users) {
      const activeByTier = new Map<number, number>();
      for (const s of stables) {
        if (s.user_id === user.id) {
          activeByTier.set(s.tier, s.rikishi_id);
        }
      }

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

  const basho = db
    .prepare("SELECT start_date FROM basho WHERE id = ?")
    .get(bashoId) as { start_date: string | null } | undefined;

  let currentDay = 0;
  if (basho?.start_date) {
    const start = new Date(basho.start_date);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    currentDay = Math.max(0, Math.min(diffDays, 15));
  }

  return NextResponse.json({
    basho: bashoId,
    currentDay,
    syncedDays: Array.from(syncedDays),
    boutsByDay,
  });
}
