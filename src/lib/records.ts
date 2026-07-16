import type Database from "better-sqlite3";

type Db = Database.Database;

export interface RikishiRecord {
  wins: number;
  losses: number;
}

/**
 * Cumulative win/loss record per rikishi for a basho, from decided bouts
 * only. Fusen results are ordinary bout rows and count normally.
 */
export function loadRecords(db: Db, bashoId: string): Map<number, RikishiRecord> {
  const rows = db
    .prepare(
      `SELECT rikishi_id, SUM(win) AS wins, SUM(loss) AS losses FROM (
         SELECT winner_id AS rikishi_id, 1 AS win, 0 AS loss
           FROM bout_results WHERE basho_id = ? AND winner_id IS NOT NULL
         UNION ALL
         SELECT loser_id, 0, 1
           FROM bout_results WHERE basho_id = ? AND loser_id IS NOT NULL
       ) GROUP BY rikishi_id`
    )
    .all(bashoId, bashoId) as { rikishi_id: number; wins: number; losses: number }[];

  const records = new Map<number, RikishiRecord>();
  for (const row of rows) {
    records.set(row.rikishi_id, { wins: row.wins, losses: row.losses });
  }
  return records;
}
