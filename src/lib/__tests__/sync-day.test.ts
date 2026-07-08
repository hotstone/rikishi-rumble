import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { SumoApiTorikumiMatch } from "@/types";

// Isolated data dir + config, set before db/config modules load.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rikishi-syncday-"));
process.env.DATA_DIR = dataDir;
fs.writeFileSync(
  path.join(dataDir, "config.json"),
  JSON.stringify({
    timezone: "Australia/Sydney",
    users: [{ name: "Alice", pin: "1111", admin: true }],
  })
);

vi.mock("@/lib/sumo-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sumo-api")>();
  return { ...actual, fetchTorikumi: vi.fn() };
});

const BASHO = "202609";
const START_DATE = "2026-09-13T00:00:00.000Z";

function match(
  overrides: Partial<SumoApiTorikumiMatch> & {
    eastId: number;
    eastShikona: string;
    eastRank: string;
    westId: number;
    westShikona: string;
    westRank: string;
    winnerId: number;
  }
): SumoApiTorikumiMatch {
  return {
    bashoId: BASHO,
    division: "Makuuchi",
    day: 1,
    matchNo: 1,
    kimarite: "yorikiri",
    winnerEn: "",
    winnerJp: "",
    ...overrides,
  };
}

const DAY1: SumoApiTorikumiMatch[] = [
  // Maegashira beats Yokozuna by a real kimarite -> kimboshi
  match({
    eastId: 101, eastShikona: "Marty", eastRank: "Maegashira 5 East",
    westId: 102, westShikona: "Yokoichi", westRank: "Yokozuna 1 East",
    winnerId: 101,
  }),
  // Maegashira beats Yokozuna by forfeit -> NO kimboshi
  match({
    eastId: 103, eastShikona: "Mick", eastRank: "Maegashira 10 West",
    westId: 104, westShikona: "Yokoni", westRank: "Yokozuna 2 East",
    winnerId: 103, kimarite: "fusen",
  }),
  // Yokozuna beats Maegashira -> no kimboshi
  match({
    eastId: 105, eastShikona: "Mo", eastRank: "Maegashira 1 East",
    westId: 102, westShikona: "Yokoichi", westRank: "Yokozuna 1 East",
    winnerId: 102,
  }),
  // Maegashira beats Ozeki -> no kimboshi (Yokozuna only)
  match({
    eastId: 106, eastShikona: "Mel", eastRank: "Maegashira 3 East",
    westId: 107, westShikona: "Oz", westRank: "Ozeki 1 East",
    winnerId: 106, kimarite: "oshidashi",
  }),
  // Undecided bout (API sends winnerId 0 before the match)
  match({
    eastId: 108, eastShikona: "Max", eastRank: "Maegashira 7 East",
    westId: 109, westShikona: "Sek", westRank: "Sekiwake 1 East",
    winnerId: 0, kimarite: "",
  }),
];

let db: import("better-sqlite3").Database;
let result: { bouts: number; pending: boolean; inProgress: boolean };

beforeAll(async () => {
  const { fetchTorikumi } = await import("@/lib/sumo-api");
  vi.mocked(fetchTorikumi).mockResolvedValue({ matches: DAY1, startDate: START_DATE });

  const { getDb } = await import("@/lib/db");
  const { syncDay } = await import("@/lib/sync");
  db = getDb();
  result = await syncDay(BASHO, 1);
});

describe("syncDay", () => {
  it("stores all bouts and reports in-progress when some are undecided", () => {
    expect(result).toEqual({ bouts: 5, pending: false, inProgress: true });
    const count = db
      .prepare("SELECT COUNT(*) as c FROM bout_results WHERE basho_id = ? AND day = 1")
      .get(BASHO) as { c: number };
    expect(count.c).toBe(5);
  });

  it("captures the basho start date from the API", () => {
    const row = db.prepare("SELECT start_date FROM basho WHERE id = ?").get(BASHO) as {
      start_date: string;
    };
    expect(row.start_date).toBe(START_DATE);
  });

  it("upserts unseen wrestlers into the cache with short ranks and tiers", () => {
    const row = db
      .prepare("SELECT name, rank, tier FROM rikishi_cache WHERE id = 101 AND basho_id = ?")
      .get(BASHO) as { name: string; rank: string; tier: number };
    expect(row).toEqual({ name: "Marty", rank: "M5e", tier: 3 });
  });

  it("awards kimboshi when a Maegashira beats a Yokozuna", () => {
    const bout = db
      .prepare("SELECT is_kimboshi FROM bout_results WHERE basho_id = ? AND winner_id = 101")
      .get(BASHO) as { is_kimboshi: number };
    expect(bout.is_kimboshi).toBe(1);
  });

  it("does NOT award kimboshi for a fusen (forfeit) win over a Yokozuna", () => {
    const bout = db
      .prepare("SELECT is_kimboshi FROM bout_results WHERE basho_id = ? AND winner_id = 103")
      .get(BASHO) as { is_kimboshi: number };
    expect(bout.is_kimboshi).toBe(0);
  });

  it("does NOT award kimboshi when the Yokozuna wins, or against an Ozeki", () => {
    const yokoWin = db
      .prepare("SELECT is_kimboshi FROM bout_results WHERE basho_id = ? AND winner_id = 102")
      .get(BASHO) as { is_kimboshi: number };
    const ozekiLoss = db
      .prepare("SELECT is_kimboshi FROM bout_results WHERE basho_id = ? AND winner_id = 106")
      .get(BASHO) as { is_kimboshi: number };
    expect(yokoWin.is_kimboshi).toBe(0);
    expect(ozekiLoss.is_kimboshi).toBe(0);
  });

  it("stores undecided bouts with a null winner and derives the loser for decided ones", () => {
    const undecided = db
      .prepare(
        "SELECT winner_id, loser_id FROM bout_results WHERE basho_id = ? AND east_id = 108"
      )
      .get(BASHO) as { winner_id: number | null; loser_id: number | null };
    expect(undecided).toEqual({ winner_id: null, loser_id: null });

    const decided = db
      .prepare("SELECT loser_id FROM bout_results WHERE basho_id = ? AND winner_id = 101")
      .get(BASHO) as { loser_id: number };
    expect(decided.loser_id).toBe(102);
  });

  it("replaces a day's bouts on re-sync instead of duplicating them", async () => {
    const { syncDay } = await import("@/lib/sync");
    await syncDay(BASHO, 1);
    const count = db
      .prepare("SELECT COUNT(*) as c FROM bout_results WHERE basho_id = ? AND day = 1")
      .get(BASHO) as { c: number };
    expect(count.c).toBe(5);
  });

  it("reports pending when the API has no match data yet", async () => {
    const { fetchTorikumi } = await import("@/lib/sumo-api");
    const { syncDay } = await import("@/lib/sync");
    vi.mocked(fetchTorikumi).mockResolvedValueOnce({ matches: [], startDate: undefined });
    const res = await syncDay(BASHO, 9);
    expect(res).toEqual({ bouts: 0, pending: true, inProgress: false });
    const log = db
      .prepare(
        "SELECT status FROM sync_log WHERE basho_id = ? AND day = 9 ORDER BY id DESC LIMIT 1"
      )
      .get(BASHO) as { status: string };
    expect(log.status).toBe("pending");
  });
});
