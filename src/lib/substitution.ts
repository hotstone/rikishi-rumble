import { getConfig } from "./config";

export function getEffectiveAestHour(): number {
  const config = getConfig();
  const now = new Date();
  const aestTime = new Date(
    now.toLocaleString("en-US", { timeZone: config.timezone })
  );
  return aestTime.getHours();
}

export function isSubstitutionWindowOpen(): boolean {
  const hour = getEffectiveAestHour();
  // Window: 8:00 PM (20:00) to 6:00 PM (18:00) next day
  return hour >= 20 || hour < 18;
}
