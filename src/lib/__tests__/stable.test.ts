import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { stableForDay, currentStable, stableWithDetails } from "@/lib/stable";

const BASHO = "202601";
let db: Database.Database;

beforeAll(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE stables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      basho_id TEXT, user_id TEXT, tier INTEGER NOT NULL,
      rikishi_id INTEGER NOT NULL, selected_at TEXT NOT NULL,
      UNIQUE(basho_id, user_id, tier)
    );
    CREATE TABLE substitutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      basho_id TEXT, user_id TEXT, day INTEGER NOT NULL,
      old_rikishi INTEGER NOT NULL, new_rikishi INTEGER NOT NULL,
      tier INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE rikishi_cache (
      id INTEGER NOT NULL, name TEXT NOT NULL, rank TEXT NOT NULL,
      basho_id TEXT NOT NULL, tier INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(id, basho_id)
    );
    CREATE TABLE bout_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      basho_id TEXT NOT NULL, day INTEGER NOT NULL,
      east_id INTEGER NOT NULL, west_id INTEGER NOT NULL,
      winner_id INTEGER, loser_id INTEGER,
      kimarite TEXT, is_kimboshi INTEGER DEFAULT 0
    );
  `);

  const stable = db.prepare(
    "INSERT INTO stables (basho_id, user_id, tier, rikishi_id, selected_at) VALUES (?, ?, ?, ?, ?)"
  );
  // alice: clean rows, one substitution chain in tier 3 (5 -> 11 on day 3, 11 -> 12 on day 7)
  for (const [tier, rikishi] of [[1, 1], [2, 3], [3, 5], [4, 7], [5, 9]]) {
    stable.run(BASHO, "alice", tier, rikishi, "t0");
  }
  // bob: one substitution in tier 2 (4 -> 40 on day 5)
  for (const [tier, rikishi] of [[1, 2], [2, 4], [3, 6], [4, 8], [5, 10]]) {
    stable.run(BASHO, "bob", tier, rikishi, "t0");
  }

  const sub = db.prepare(
    "INSERT INTO substitutions (basho_id, user_id, day, old_rikishi, new_rikishi, tier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  sub.run(BASHO, "alice", 3, 5, 11, 3, "2026-01-13T10:00:00Z");
  sub.run(BASHO, "alice", 7, 11, 12, 3, "2026-01-17T10:00:00Z");
  sub.run(BASHO, "bob", 5, 4, 40, 2, "2026-01-15T10:00:00Z");

  const cache = db.prepare(
    "INSERT INTO rikishi_cache (id, name, rank, basho_id, tier) VALUES (?, ?, ?, ?, ?)"
  );
  for (const [id, name, rank, tier] of [
    [1, "Yoko", "Y1e", 1],
    [3, "Seki", "S1e", 2],
    [12, "MaeThree", "M3e", 3],
    [7, "MaeEight", "M8e", 4],
    [9, "MaeFourteen", "M14e", 5],
  ] as [number, string, string, number][]) {
    cache.run(id, name, rank, BASHO, tier);
  }

  // Yoko (1) goes 2-1; MaeThree (12, alice's final tier-3 sub) goes 1-0;
  // alice's other wrestlers have no decided bouts.
  const bout = db.prepare(
    "INSERT INTO bout_results (basho_id, day, east_id, west_id, winner_id, loser_id, kimarite, is_kimboshi) VALUES (?, ?, ?, ?, ?, ?, 'yorikiri', 0)"
  );
  bout.run(BASHO, 1, 1, 50, 1, 50);
  bout.run(BASHO, 2, 50, 1, 1, 50);
  bout.run(BASHO, 3, 1, 50, 50, 1);
  bout.run(BASHO, 8, 12, 51, 12, 51);
});

describe("stableForDay", () => {
  it("returns the original stable before any substitution takes effect", () => {
    expect(stableForDay(db, BASHO, "alice", 1)).toEqual(
      new Map([[1, 1], [2, 3], [3, 5], [4, 7], [5, 9]])
    );
  });

  it("applies a day-N substitution from day N+1, not day N", () => {
    expect(stableForDay(db, BASHO, "alice", 3).get(3)).toBe(5);
    expect(stableForDay(db, BASHO, "alice", 4).get(3)).toBe(11);
  });

  it("chains multiple substitutions in the same tier", () => {
    expect(stableForDay(db, BASHO, "alice", 7).get(3)).toBe(11);
    expect(stableForDay(db, BASHO, "alice", 8).get(3)).toBe(12);
    expect(stableForDay(db, BASHO, "alice", 15).get(3)).toBe(12);
  });

  it("keeps the original pick through the sub's own day, swapped from the next", () => {
    expect(stableForDay(db, BASHO, "bob", 1).get(2)).toBe(4);
    expect(stableForDay(db, BASHO, "bob", 5).get(2)).toBe(4);
    expect(stableForDay(db, BASHO, "bob", 6).get(2)).toBe(40);
  });

  it("returns an empty map for a user with no stable", () => {
    expect(stableForDay(db, BASHO, "carol", 1).size).toBe(0);
  });
});

describe("currentStable", () => {
  it("applies all substitutions regardless of day", () => {
    expect(currentStable(db, BASHO, "alice")).toEqual(
      new Map([[1, 1], [2, 3], [3, 12], [4, 7], [5, 9]])
    );
    expect(currentStable(db, BASHO, "bob").get(2)).toBe(40);
  });
});

describe("stableWithDetails", () => {
  it("includes each wrestler's cumulative win/loss record", () => {
    const stable = stableWithDetails(db, BASHO, "alice");
    const tier1 = stable.find((e) => e.tier === 1)!;
    expect(tier1).toMatchObject({ rikishi_id: 1, name: "Yoko", rank: "Y1e", wins: 2, losses: 1 });
  });

  it("defaults to 0-0 for wrestlers with no decided bouts", () => {
    const stable = stableWithDetails(db, BASHO, "alice");
    const tier2 = stable.find((e) => e.tier === 2)!;
    expect(tier2).toMatchObject({ rikishi_id: 3, wins: 0, losses: 0 });
  });

  it("shows the substituted-in wrestler's record, not the original pick's", () => {
    const stable = stableWithDetails(db, BASHO, "alice");
    const tier3 = stable.find((e) => e.tier === 3)!;
    expect(tier3).toMatchObject({ rikishi_id: 12, name: "MaeThree", wins: 1, losses: 0 });
  });
});
