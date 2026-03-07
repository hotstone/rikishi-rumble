import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  const bashoId =
    request.nextUrl.searchParams.get("basho") || getConfig().basho;

  const db = getDb();

  // Get the latest day with results
  const latestDay = db
    .prepare(
      "SELECT MAX(day) as day FROM bout_results WHERE basho_id = ?"
    )
    .get(bashoId) as { day: number | null };

  const currentDay = latestDay?.day || 0;

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
        "SELECT COALESCE(points, 0) as points, COALESCE(kimboshi, 0) as kb FROM daily_scores WHERE basho_id = ? AND user_id = ? AND day = ?"
      )
      .get(bashoId, user.id, currentDay) as
      | { points: number; kb: number }
      | undefined;

    // Get stable wrestlers with individual points
    const wrestlers = db
      .prepare(
        `SELECT s.tier, s.rikishi_id, r.name, r.rank,
                COALESCE((SELECT SUM(CASE WHEN br.winner_id = s.rikishi_id THEN 1 ELSE 0 END)
                          FROM bout_results br
                          WHERE br.basho_id = ? AND br.winner_id = s.rikishi_id), 0) as points
         FROM stables s
         LEFT JOIN rikishi_cache r ON r.id = s.rikishi_id AND r.basho_id = s.basho_id
         WHERE s.basho_id = ? AND s.user_id = ?
         ORDER BY s.tier`
      )
      .all(bashoId, bashoId, user.id) as {
      tier: number;
      rikishi_id: number;
      name: string;
      rank: string;
      points: number;
    }[];

    return {
      user_id: user.id,
      user_name: user.name,
      total_points: totalRow.total,
      today_points: todayRow?.points || 0,
      kimboshi_total: totalRow.kb,
      wrestlers,
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
    basho: bashoId,
    hasPendingResults: pendingSync.count > 0,
  });
}
