/** First window opens 18:00 JST on day 1 (= basho start + 9h, since startDate is 00:00 UTC = 09:00 JST). */
export function firstSubWindowOpen(bashoStartDate: Date): Date {
  return new Date(bashoStartDate.getTime() + 9 * 3600 * 1000);
}

/** Final window closes 16:00 JST on day 15 (= basho start + 14 days + 7h). */
export function finalSubWindowClose(bashoStartDate: Date): Date {
  return new Date(bashoStartDate.getTime() + (14 * 24 + 7) * 3600 * 1000);
}

export interface SubWindow {
  opensAt: Date;
  closesAt: Date;
}

/**
 * The 14 nightly substitution windows: each opens 18:00 JST and closes 16:00
 * JST the next day (blackout 16:00-18:00). JST has no DST, so fixed-offset
 * arithmetic is exact.
 */
export function subWindowIntervals(bashoStartDate: Date): SubWindow[] {
  const start = bashoStartDate.getTime();
  const windows: SubWindow[] = [];
  for (let d = 0; d < 14; d++) {
    windows.push({
      opensAt: new Date(start + (d * 24 + 9) * 3600 * 1000),
      closesAt: new Date(start + ((d + 1) * 24 + 7) * 3600 * 1000),
    });
  }
  return windows;
}

export function isSubstitutionWindowOpen(
  bashoStartDate: Date | null,
  now: Date = new Date()
): boolean {
  if (!bashoStartDate) return false;
  return subWindowIntervals(bashoStartDate).some(
    (w) => now >= w.opensAt && now < w.closesAt
  );
}
