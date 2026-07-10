import { getDb } from "./db";
import { currentBashoDay, mostRecentBashoStart } from "./basho";

export interface ActiveBasho {
  id: string;
  start_date: string | null;
  status: string;
}

export function getActiveBasho(): ActiveBasho | null {
  const now = new Date();
  const candidate = mostRecentBashoStart(now);
  if (!candidate) return null;

  const database = getDb();
  const row = database
    .prepare("SELECT id, start_date, status FROM basho WHERE id = ?")
    .get(candidate.bashoId) as ActiveBasho | undefined;

  const startDate = row?.start_date || candidate.startDate.toISOString();
  const day = currentBashoDay(startDate);

  if (day < 1) return null;

  if (day === 15) {
    const counts = database
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN winner_id IS NOT NULL THEN 1 ELSE 0 END) as decided
         FROM bout_results WHERE basho_id = ? AND day = 15`
      )
      .get(candidate.bashoId) as { total: number; decided: number | null };
    const allDecided = counts.total > 0 && (counts.decided ?? 0) >= counts.total;
    if (allDecided) return null;
  }

  database
    .prepare("INSERT OR IGNORE INTO basho (id, start_date, status) VALUES (?, ?, 'active')")
    .run(candidate.bashoId, startDate);

  return row || { id: candidate.bashoId, start_date: startDate, status: "active" };
}

export function getActiveBashoId(): string | null {
  return getActiveBasho()?.id || null;
}
