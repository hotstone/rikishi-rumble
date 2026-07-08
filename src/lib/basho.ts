const BASHO_NAMES: Record<string, string> = {
  "01": "HATSU BASHO",
  "03": "HARU BASHO",
  "05": "NATSU BASHO",
  "07": "NAGOYA BASHO",
  "09": "AKI BASHO",
  "11": "KYUSHU BASHO",
};

const BASHO_MONTHS = [1, 3, 5, 7, 9, 11];

/** Converts a basho ID like "202603" to "HARU BASHO 2026". */
export function bashoLabel(id: string): string {
  const year = id.slice(0, 4);
  const month = id.slice(4, 6);
  const name = BASHO_NAMES[month];
  return name ? `${name} ${year}` : id;
}

function secondSunday(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstSunday = (7 - first.getUTCDay()) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + firstSunday + 7));
}

function bashoIdToStart(bashoId: string): Date {
  const year = parseInt(bashoId.slice(0, 4));
  const month = parseInt(bashoId.slice(4, 6));
  return secondSunday(year, month);
}

function jstDateString(d: Date): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(d);
}

/** Current basho day (1-15) in JST. Returns 0 before start; clamps to 15 after the basho. */
export function currentBashoDay(dbStartDate: string | null, now: Date = new Date()): number {
  if (!dbStartDate) return 0;
  const startMs = Date.parse(jstDateString(new Date(dbStartDate)));
  const nowMs = Date.parse(jstDateString(now));
  const diff = Math.floor((nowMs - startMs) / 86400000) + 1;
  return Math.max(0, Math.min(diff, 15));
}

/** Stable selections lock at 4pm Tokyo time (07:00 UTC) on day 1 of the basho. */
export function stableLockDate(bashoId: string, dbStartDate: string | null): Date {
  const start = dbStartDate ? new Date(dbStartDate) : bashoIdToStart(bashoId);
  return new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    7, 0, 0, 0
  ));
}

export function bashoIdFromDate(year: number, month: number): string {
  return `${year}${String(month).padStart(2, "0")}`;
}

export function nextBashoStart(now: Date = new Date()): { bashoId: string; startDate: Date } {
  const year = now.getUTCFullYear();
  for (let i = 0; i < BASHO_MONTHS.length * 2; i++) {
    const idx = i % BASHO_MONTHS.length;
    const y = year + Math.floor(i / BASHO_MONTHS.length);
    const month = BASHO_MONTHS[idx];
    const start = secondSunday(y, month);
    if (start > now) {
      return { bashoId: bashoIdFromDate(y, month), startDate: start };
    }
  }
  return { bashoId: bashoIdFromDate(year + 1, 1), startDate: secondSunday(year + 1, 1) };
}

export function mostRecentBashoStart(now: Date = new Date()): { bashoId: string; startDate: Date } | null {
  const year = now.getUTCFullYear();
  for (let i = 0; i < BASHO_MONTHS.length * 2; i++) {
    const idx = (BASHO_MONTHS.length - 1) - (i % BASHO_MONTHS.length);
    const y = year - Math.floor(i / BASHO_MONTHS.length);
    const month = BASHO_MONTHS[idx];
    const start = secondSunday(y, month);
    if (start <= now) {
      return { bashoId: bashoIdFromDate(y, month), startDate: start };
    }
  }
  return null;
}

export function currentOrNextBashoInfo(
  activeBashoId: string | null,
  dbStartDate: string | null
): { active: boolean; countdownTarget: Date | null; nextBashoId: string; nextBashoLabel: string } {
  const now = new Date();

  if (activeBashoId) {
    const lockDate = stableLockDate(activeBashoId, dbStartDate);
    if (now < lockDate) {
      return {
        active: false,
        countdownTarget: lockDate,
        nextBashoId: activeBashoId,
        nextBashoLabel: bashoLabel(activeBashoId),
      };
    }
    return { active: true, countdownTarget: null, nextBashoId: activeBashoId, nextBashoLabel: bashoLabel(activeBashoId) };
  }

  const next = nextBashoStart(now);
  return {
    active: false,
    countdownTarget: stableLockDate(next.bashoId, null),
    nextBashoId: next.bashoId,
    nextBashoLabel: bashoLabel(next.bashoId),
  };
}
