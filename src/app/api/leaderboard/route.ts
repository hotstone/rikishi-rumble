import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  const config = getConfig();
  const bashoId =
    request.nextUrl.searchParams.get("basho") || config.basho;

  const db = getDb();

  const latestDay = db
    .prepare(
      "SELECT MAX(day) as day FROM bout_results WHERE basho_id = ? AND winner_id IS NOT NULL"
    )
    .get(bashoId) as { day: number | null };

  const currentDay = latestDay?.day || 0;

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

  // Days that have at least one decided bout
  const daysWithResults = db
    .prepare(
      "SELECT DISTINCT day FROM bout_results WHERE basho_id = ? AND winner_id IS NOT NULL ORDER BY day"
    )
    .all(bashoId) as { day: number }[];

  // Get all users with their total scores
  const users = db
    .prepare("SELECT id, name FROM users")
    .all() as { id: string; name: string }[];

  const leaderboard = users.map((user) => {
    // Total points
    const totalRow = db
      .prepare(
        "SELECT COALESCE(SUM(points), 0) as total, COALESCE(SUM(kimboshi), 0) as kb FROM daily_scores WHERE basho_id = ? AND user_id = ?"
      )
      .get(bashoId, user.id) as { total: number; kb: number };

    // Today's points
    const todayRow = db
      .prepare(
        "SELECT COALESCE(points, 0) as points FROM daily_scores WHERE basho_id = ? AND user_id = ? AND day = ?"
      )
      .get(bashoId, user.id, currentDay) as { points: number } | undefined;

    // Get original stable + all subs (shared for both dailyWrestlers and current stable)
    const stableRows = db
      .prepare("SELECT tier, rikishi_id FROM stables WHERE basho_id = ? AND user_id = ? ORDER BY tier")
      .all(bashoId, user.id) as { tier: number; rikishi_id: number }[];

    const allSubs = db
      .prepare("SELECT tier, old_rikishi, new_rikishi, day FROM substitutions WHERE basho_id = ? AND user_id = ? ORDER BY created_at")
      .all(bashoId, user.id) as { tier: number; old_rikishi: number; new_rikishi: number; day: number }[];

    // Helper: reconstruct active stable (tier -> rikishi_id) for a given day
    function stableForDay(day: number): Map<number, number> {
      const tierMap = new Map<number, number>();
      for (const s of stableRows) tierMap.set(s.tier, s.rikishi_id);
      // Correct for stables mutation bug: use first sub's old_rikishi as true origin
      const seenTiers = new Set<number>();
      for (const sub of allSubs) {
        if (!seenTiers.has(sub.tier)) {
          tierMap.set(sub.tier, sub.old_rikishi);
          seenTiers.add(sub.tier);
        }
      }
      // Apply subs effective before this day
      for (const sub of allSubs) {
        if (sub.day < day) tierMap.set(sub.tier, sub.new_rikishi);
      }
      return tierMap;
    }

    // Build dailyWrestlers: for each day with results, the active stable + wins that day
    const dailyWrestlers: Record<number, { tier: number; rikishi_id: number; name: string; rank: string; points: number }[]> = {};

    for (const { day } of daysWithResults) {
      const tierMap = stableForDay(day);
      dailyWrestlers[day] = [...tierMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([tier, rikishi_id]) => {
          const r = db
            .prepare("SELECT name, rank FROM rikishi_cache WHERE id = ? AND basho_id = ?")
            .get(rikishi_id, bashoId) as { name: string; rank: string } | undefined;
          const wins = (db
            .prepare("SELECT COUNT(*) as w FROM bout_results WHERE basho_id = ? AND winner_id = ? AND day = ?")
            .get(bashoId, rikishi_id, day) as { w: number }).w;
          return { tier, rikishi_id, name: r?.name ?? "", rank: r?.rank ?? "", points: wins };
        });
    }

    // Daily scores for power-up bar
    const dailyScores = db
      .prepare(
        "SELECT day, points FROM daily_scores WHERE basho_id = ? AND user_id = ? ORDER BY day"
      )
      .all(bashoId, user.id) as { day: number; points: number }[];

    const dailyPoints: Record<number, number> = {};
    for (const ds of dailyScores) {
      dailyPoints[ds.day] = ds.points;
    }

    return {
      user_id: user.id,
      user_name: user.name,
      total_points: totalRow.total,
      today_points: todayRow?.points || 0,
      kimboshi_total: totalRow.kb,
      dailyWrestlers,
      dailyPoints,
    };
  });

  // Sort by total points descending
  leaderboard.sort((a, b) => b.total_points - a.total_points);

  // Check for pending sync
  const pendingSync = db
    .prepare(
      "SELECT COUNT(*) as count FROM sync_log WHERE basho_id = ? AND status = 'pending'"
    )
    .get(bashoId) as { count: number };

  return NextResponse.json({
    leaderboard,
    currentDay,
    activeDay,
    basho: bashoId,
    hasPendingResults: pendingSync.count > 0,
  });
}
