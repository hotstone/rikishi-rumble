// Config types
export interface UserConfig {
  name: string;
  pin: string;
  admin: boolean;
}

export interface AppConfig {
  timezone: string;
  basho: string;
  stableLockDate?: string;
  users: UserConfig[];
}

// Database types
export interface Stable {
  id: number;
  basho_id: string;
  user_id: string;
  tier: number;
  rikishi_id: number;
  selected_at: string;
}

export interface Substitution {
  id: number;
  basho_id: string;
  user_id: string;
  day: number;
  old_rikishi: number;
  new_rikishi: number;
  tier: number;
  created_at: string;
}

export interface RikishiCache {
  id: number;
  name: string;
  rank: string;
  basho_id: string;
  tier: number;
}

export interface BoutResult {
  id: number;
  basho_id: string;
  day: number;
  winner_id: number;
  loser_id: number;
  kimarite: string;
  is_kimboshi: boolean;
}

export interface DailyScore {
  basho_id: string;
  user_id: string;
  day: number;
  points: number;
  kimboshi: number;
}

// API response types from sumo-api.com
export interface SumoApiRikishi {
  id: number;
  sumoDbId: number;
  nskId: number;
  shikonaEn: string;
  shikonaJp: string;
  currentRank: string;
  hepiburn: string;
  updatedAt: string;
}

export interface SumoApiBanzukeEntry {
  rikishiID: number;
  shikonaEn: string;
  rank: string;
  wins: number;
  losses: number;
  absences: number;
  side: string;
  rankValue: number;
}

export interface SumoApiBanzuke {
  bashoId: string;
  division: string;
  east: SumoApiBanzukeEntry[];
  west: SumoApiBanzukeEntry[];
}

export interface SumoApiTorikumiMatch {
  bashoId: string;
  division: string;
  day: number;
  matchNo: number;
  eastId: number;
  eastShikona: string;
  eastRank: string;
  westId: number;
  westShikona: string;
  westRank: string;
  kimarite: string;
  winnerId: number;
  winnerEn: string;
  winnerJp: string;
}

// Leaderboard types
export interface LeaderboardEntry {
  user_id: string;
  user_name: string;
  total_points: number;
  today_points: number;
  kimboshi_total: number;
  wrestlers: {
    tier: number;
    rikishi_id: number;
    name: string;
    rank: string;
    points: number;
  }[];
}

// Tier definitions
export const TIERS: Record<number, { label: string; ranks: string[] }> = {
  1: { label: "Yokozuna + Ozeki", ranks: ["Y", "O"] },
  2: { label: "Komusubi + Sekiwake", ranks: ["K", "S"] },
  3: { label: "Maegashira 1-6", ranks: ["M1", "M2", "M3", "M4", "M5", "M6"] },
  4: { label: "Maegashira 7-12", ranks: ["M7", "M8", "M9", "M10", "M11", "M12"] },
  5: { label: "Maegashira 13-17+", ranks: ["M13", "M14", "M15", "M16", "M17", "M18", "M19", "M20"] },
};
