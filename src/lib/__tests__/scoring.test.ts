import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Point the app at an isolated data dir with a fixture config BEFORE any
// db/config module is loaded (both cache singletons on first use).
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rikishi-scoring-"));
process.env.DATA_DIR = dataDir;
fs.writeFileSync(
  path.join(dataDir, "config.json"),
  JSON.stringify({
    timezone: "Australia/Sydney",
    users: [
      { name: "Alice", pin: "1111", admin: true },
      { name: "Bob", pin: "2222", admin: false },
    ],
  })
);

const BASHO = "202601";

type Db = import("better-sqlite3").Database;

function seedWrestlers(db: Db) {
  const insert = db.prepare(
    "INSERT INTO rikishi_cache (id, name, rank, basho_id, tier) VALUES (?, ?, ?, ?, ?)"
  );
  const wrestlers: [number, string, string, number][] = [
    [1, "Yoko", "Y1e", 1],
    [2, "Ozzy", "O1e", 1],
    [3, "Seki", "S1e", 2],
    [4, "Komu", "K1e", 2],
    [5, "MaeOne", "M1e", 3],
    [6, "MaeTwo", "M2e", 3],
    [11, "MaeThree", "M3e", 3],
    [7, "MaeEight", "M8e", 4],
    [8, "MaeNine", "M9e", 4],
    [9, "MaeFourteen", "M14e", 5],
    [10, "MaeFifteen", "M15e", 5],
  ];
  for (const [id, name, rank, tier] of wrestlers) {
    insert.run(id, name, rank, BASHO, tier);
  }
}

function seedStables(db: Db) {
  const insert = db.prepare(
    "INSERT INTO stables (basho_id, user_id, tier, rikishi_id, selected_at) VALUES (?, ?, ?, ?, ?)"
  );
  const rows: [string, number, number][] = [
    ["alice", 1, 1],
    ["alice", 2, 3],
    ["alice", 3, 5],
    ["alice", 4, 7],
    ["alice", 5, 9],
    ["bob", 1, 2],
    ["bob", 2, 4],
    ["bob", 3, 6],
    ["bob", 4, 8],
    ["bob", 5, 10],
  ];
  for (const [user, tier, rikishi] of rows) {
    insert.run(BASHO, user, tier, rikishi, "2026-01-10T00:00:00.000Z");
  }

  // Alice swapped MaeOne (5) -> MaeThree (11) on day 1, effective from day 2.
  db.prepare(
    "INSERT INTO substitutions (basho_id, user_id, day, old_rikishi, new_rikishi, tier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(BASHO, "alice", 1, 5, 11, 3, "2026-01-11T10:00:00.000Z");
}

function seedBouts(db: Db) {
  const insert = db.prepare(
    "INSERT INTO bout_results (basho_id, day, east_id, west_id, winner_id, loser_id, kimarite, is_kimboshi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  // day, east, west, winner, loser, kimarite, kimboshi
  const bouts: [number, number, number, number, number, string, number][] = [
    // Day 1 — Alice's active tier 3 is wrestler 5 (pre-substitution)
    [1, 5, 1, 5, 1, "yorikiri", 1], // Maegashira beats Yokozuna: kimboshi for Alice
    [1, 3, 4, 4, 3, "oshidashi", 0],
    [1, 7, 8, 8, 7, "yorikiri", 0],
    [1, 9, 10, 9, 10, "hatakikomi", 0],
    [1, 2, 6, 2, 6, "yorikiri", 0],
    // Day 2 — Alice's substitution is now in effect (11 replaces 5)
    [2, 11, 6, 11, 6, "yorikiri", 0],
    [2, 1, 2, 1, 2, "yorikiri", 0],
    [2, 3, 4, 3, 4, "tsukiotoshi", 0],
    [2, 7, 8, 7, 8, "yorikiri", 0],
    [2, 10, 9, 10, 9, "yorikiri", 0],
  ];
  for (const [day, east, west, winner, loser, kimarite, kb] of bouts) {
    insert.run(BASHO, day, east, west, winner, loser, kimarite, kb);
  }
}

let scores: Record<string, Record<number, { points: number; kimboshi: number }>>;

beforeAll(async () => {
  const { getDb } = await import("@/lib/db");
  const { calculateScores } = await import("@/lib/scoring");

  const db = getDb();
  db.prepare("INSERT INTO basho (id, start_date, status) VALUES (?, ?, 'active')").run(
    BASHO,
    "2026-01-11T00:00:00.000Z"
  );
  seedWrestlers(db);
  seedStables(db);
  seedBouts(db);

  calculateScores(BASHO);

  const rows = db
    .prepare("SELECT user_id, day, points, kimboshi FROM daily_scores WHERE basho_id = ?")
    .all(BASHO) as { user_id: string; day: number; points: number; kimboshi: number }[];

  scores = {};
  for (const row of rows) {
    scores[row.user_id] ??= {};
    scores[row.user_id][row.day] = { points: row.points, kimboshi: row.kimboshi };
  }
});

describe("calculateScores", () => {
  it("scores day 1 using the pre-substitution stable", () => {
    // Alice's active day-1 stable is {1, 3, 5, 7, 9}; winners: 5 and 9.
    expect(scores.alice[1]).toEqual({ points: 2, kimboshi: 1 });
  });

  it("scores day 1 for a user with no substitutions", () => {
    // Bob's stable {2, 4, 6, 8, 10}; winners: 4, 8, 2.
    expect(scores.bob[1]).toEqual({ points: 3, kimboshi: 0 });
  });

  it("applies a day-N substitution from day N+1 onward", () => {
    // Alice's active day-2 stable is {1, 3, 11, 7, 9}; winners: 11, 1, 3, 7.
    expect(scores.alice[2]).toEqual({ points: 4, kimboshi: 0 });
    // Bob day 2: only 10 wins.
    expect(scores.bob[2]).toEqual({ points: 1, kimboshi: 0 });
  });

  it("attributes kimboshi only via bout flags, as a separate tally from points", () => {
    const aliceTotalKb = scores.alice[1].kimboshi + scores.alice[2].kimboshi;
    const aliceTotalPts = scores.alice[1].points + scores.alice[2].points;
    expect(aliceTotalKb).toBe(1);
    expect(aliceTotalPts).toBe(6); // kimboshi does not add points
  });

  it("is a full recalculation: re-running produces identical rows, no duplicates", async () => {
    const { getDb } = await import("@/lib/db");
    const { calculateScores } = await import("@/lib/scoring");
    calculateScores(BASHO);
    const count = getDb()
      .prepare("SELECT COUNT(*) as c FROM daily_scores WHERE basho_id = ?")
      .get(BASHO) as { c: number };
    // 2 users x 2 days with bouts
    expect(count.c).toBe(4);
  });
});
