import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { stableForDay, currentStable } from "@/lib/stable";

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
