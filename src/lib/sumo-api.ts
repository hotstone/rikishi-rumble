import { SumoApiBanzukeEntry, SumoApiTorikumiMatch } from "@/types";

const BASE_URL = "https://www.sumo-api.com/api";

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (response.status >= 500 && attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error("All retries failed");
}

export async function fetchBanzuke(
  bashoId: string
): Promise<SumoApiBanzukeEntry[]> {
  const url = `${BASE_URL}/basho/${bashoId}/banzuke/Makuuchi`;
  const response = await fetchWithRetry(url);
  const data = await response.json();

  const entries: SumoApiBanzukeEntry[] = [];
  if (data.east) entries.push(...data.east);
  if (data.west) entries.push(...data.west);

  return entries;
}

export async function fetchTorikumi(
  bashoId: string,
  day: number
): Promise<{ matches: SumoApiTorikumiMatch[]; startDate?: string }> {
  const url = `${BASE_URL}/basho/${bashoId}/torikumi/Makuuchi/${day}`;
  const response = await fetchWithRetry(url);
  const data = await response.json();

  return {
    matches: data.torikumi || [],
    startDate: data.startDate || undefined,
  };
}

// Parse rank strings like "Yokozuna 1 East", "Maegashira 12 West", "Ozeki 2 East"
// into a normalized short form and number
export function parseRank(rank: string): { base: string; number: number; short: string } {
  const rankMap: Record<string, string> = {
    yokozuna: "Y",
    ozeki: "O",
    sekiwake: "S",
    komusubi: "K",
    maegashira: "M",
  };

  const lower = rank.toLowerCase();

  for (const [full, short] of Object.entries(rankMap)) {
    if (lower.startsWith(full)) {
      const numMatch = rank.match(/(\d+)/);
      const num = numMatch ? parseInt(numMatch[1]) : 1;
      return { base: short, number: num, short: `${short}${num}` };
    }
  }

  // Fallback: try abbreviated format (Y1e, M3w, etc.)
  const abbrMatch = rank.match(/^([YOSKM])(\d+)?/);
  if (abbrMatch) {
    return {
      base: abbrMatch[1],
      number: parseInt(abbrMatch[2] || "1"),
      short: rank,
    };
  }

  return { base: rank, number: 0, short: rank };
}

export function getRankTier(rank: string): number {
  const { base, number } = parseRank(rank);
  if (base === "Y" || base === "O") return 1;
  if (base === "K" || base === "S") return 2;
  if (base === "M" && number >= 1 && number <= 6) return 3;
  if (base === "M" && number >= 7 && number <= 12) return 4;
  if (base === "M" && number >= 13) return 5;
  return 0;
}

export function shortRank(rank: string): string {
  const { short } = parseRank(rank);
  // Append side indicator
  const lower = rank.toLowerCase();
  if (lower.includes("east")) return `${short}e`;
  if (lower.includes("west")) return `${short}w`;
  return short;
}

export function isYokozuna(rank: string): boolean {
  return parseRank(rank).base === "Y";
}

export function isMaegashira(rank: string): boolean {
  return parseRank(rank).base === "M";
}
