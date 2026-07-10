/** Canonical user ID derived from a display name ("Big Mac" -> "big-mac"). */
export function userIdFromName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}
