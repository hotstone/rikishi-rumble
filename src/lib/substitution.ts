function getJstHour(): number {
  const now = new Date();
  const jstTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
  return jstTime.getHours();
}

/** First window opens 18:00 JST on day 1 (= basho start + 9h, since startDate is 00:00 UTC = 09:00 JST). */
export function firstSubWindowOpen(bashoStartDate: Date): Date {
  return new Date(bashoStartDate.getTime() + 9 * 3600 * 1000);
}

/** Final window closes 16:00 JST on day 15 (= basho start + 14 days + 7h). */
export function finalSubWindowClose(bashoStartDate: Date): Date {
  return new Date(bashoStartDate.getTime() + (14 * 24 + 7) * 3600 * 1000);
}

export function isSubstitutionWindowOpen(bashoStartDate: Date | null): boolean {
  if (!bashoStartDate) return false;
  const now = new Date();
  if (now < firstSubWindowOpen(bashoStartDate)) return false;
  if (now >= finalSubWindowClose(bashoStartDate)) return false;
  const hour = getJstHour();
  // Daily window: 18:00 JST → 16:00 JST next day, blackout 16:00–18:00 JST
  return hour >= 18 || hour < 16;
}
