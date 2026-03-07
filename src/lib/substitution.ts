import { getConfig } from "./config";

export function isSubstitutionWindowOpen(): boolean {
  const config = getConfig();
  const now = new Date();

  // Convert to AEST
  const aestTime = new Date(
    now.toLocaleString("en-US", { timeZone: config.timezone })
  );

  const hour = aestTime.getHours();

  // Window: 8:00 PM (20:00) to 2:00 PM (14:00) next day
  // Open: hour >= 20 OR hour < 14
  return hour >= 20 || hour < 14;
}

export function getCurrentTournamentDay(bashoStartDate?: string): number {
  if (!bashoStartDate) return 1;

  const start = new Date(bashoStartDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(1, Math.min(15, diffDays + 1));
}

export function getSubstitutionWindowStatus(): {
  open: boolean;
  message: string;
} {
  const open = isSubstitutionWindowOpen();
  if (open) {
    return { open, message: "Substitution window is open" };
  }
  return {
    open,
    message: "Substitution window is closed (opens at 8:00 PM AEST)",
  };
}
