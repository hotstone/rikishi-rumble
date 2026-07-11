import { getDb } from "./db";
import { currentBashoDay, mostRecentBashoStart, nextBashoStart } from "./basho";
import { jstDateString } from "./time";

export interface ActiveBasho {
  id: string;
  start_date: string | null;
  status: string;
}

/**
 * How long before a basho starts it becomes "active" for selection purposes
 * (banzuke sync, stable picks). Picks lock at 16:00 JST on day 1.
 */
const SELECTION_WINDOW_DAYS = 7;

export function getActiveBasho(now: Date = new Date()): ActiveBasho | null {
  return runningBasho(now) ?? upcomingBashoInSelectionWindow(now);
}

export function getActiveBashoId(now: Date = new Date()): string | null {
  return getActiveBasho(now)?.id || null;
}

/** The basho currently underway (day 1-15, and not fully decided on day 15). */
function runningBasho(now: Date): ActiveBasho | null {
  const candidate = mostRecentBashoStart(now);
  if (!candidate) return null;

  const database = getDb();
  const row = database
    .prepare("SELECT id, start_date, status FROM basho WHERE id = ?")
    .get(candidate.bashoId) as ActiveBasho | undefined;

  const startDate = row?.start_date || candidate.startDate.toISOString();
  const day = currentBashoDay(startDate, now);

  if (day < 1) return null;

  // currentBashoDay clamps to 15, so also bound by the calendar: one grace
  // day after day 15 (for a late final sync), then the basho is over even if
  // its day-15 results never arrived.
  const rawDay =
    Math.floor(
      (Date.parse(jstDateString(now)) - Date.parse(jstDateString(new Date(startDate)))) / 86400000
    ) + 1;
  if (rawDay > 16) return null;

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

/**
 * The next basho, once it is close enough to open for selection. Without this
 * there is no active basho before day 1, so the banzuke can't be synced and
 * stables can't be picked ahead of the day-1 lock.
 */
function upcomingBashoInSelectionWindow(now: Date): ActiveBasho | null {
  const next = nextBashoStart(now);
  const msUntilStart = next.startDate.getTime() - now.getTime();
  if (msUntilStart > SELECTION_WINDOW_DAYS * 86400000) return null;

  const database = getDb();
  const row = database
    .prepare("SELECT id, start_date, status FROM basho WHERE id = ?")
    .get(next.bashoId) as ActiveBasho | undefined;

  const startDate = row?.start_date || next.startDate.toISOString();

  database
    .prepare("INSERT OR IGNORE INTO basho (id, start_date, status) VALUES (?, ?, 'upcoming')")
    .run(next.bashoId, startDate);

  return row || { id: next.bashoId, start_date: startDate, status: "upcoming" };
}
