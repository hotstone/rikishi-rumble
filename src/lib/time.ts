const JST = "Asia/Tokyo";

/** YYYY-MM-DD for the instant `d` in JST ("en-CA" formats as YYYY-MM-DD). */
export function jstDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: JST }).format(d);
}

/** Hour of day (0-23) for the instant `now` in JST. */
export function jstHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: JST,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return parseInt(hour, 10);
}
