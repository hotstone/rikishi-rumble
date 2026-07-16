import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { loadRecords } from "@/lib/records";

const BASHO = "202601";
let db: Database.Database;

function bout(
  day: number,
  eastId: number,
  westId: number,
  winnerId: number | null,
  kimarite: string | null = "yorikiri",
  bashoId: string = BASHO
) {
  const loserId = winnerId === null ? null : winnerId === eastId ? westId : eastId;
  db.prepare(
    "INSERT INTO bout_results (basho_id, day, east_id, west_id, winner_id, loser_id, kimarite, is_kimboshi) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
  ).run(bashoId, day, eastId, westId, winnerId, loserId, kimarite);
}

beforeAll(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE bout_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      basho_id TEXT NOT NULL,
      day INTEGER NOT NULL,
      east_id INTEGER NOT NULL,
      west_id INTEGER NOT NULL,
      winner_id INTEGER,
      loser_id INTEGER,
      kimarite TEXT,
      is_kimboshi INTEGER DEFAULT 0
    );
  `);

  // rikishi 1 vs 2 across three days: 1 wins twice, loses once
  bout(1, 1, 2, 1);
  bout(2, 2, 1, 1);
  bout(3, 1, 2, 2);
  // day 4 undecided (in progress) — must not count for either
  bout(4, 1, 2, null, null);
  // rikishi 3 wins by fusen over 4 — counts normally
  bout(1, 3, 4, 3, "fusen");
  // a different basho — must not leak into 202601 records
  bout(1, 1, 2, 2, "yorikiri", "202603");
});

describe("loadRecords", () => {
  it("accumulates wins and losses across days", () => {
    const records = loadRecords(db, BASHO);
    expect(records.get(1)).toEqual({ wins: 2, losses: 1 });
    expect(records.get(2)).toEqual({ wins: 1, losses: 2 });
  });

  it("ignores undecided bouts", () => {
    const records = loadRecords(db, BASHO);
    // 4 bouts between 1 and 2 exist but only 3 are decided
    expect(records.get(1)!.wins + records.get(1)!.losses).toBe(3);
  });

  it("counts fusen results normally", () => {
    const records = loadRecords(db, BASHO);
    expect(records.get(3)).toEqual({ wins: 1, losses: 0 });
    expect(records.get(4)).toEqual({ wins: 0, losses: 1 });
  });

  it("keeps records isolated per basho", () => {
    expect(loadRecords(db, "202603").get(1)).toEqual({ wins: 0, losses: 1 });
    expect(loadRecords(db, "202605").size).toBe(0);
  });

  it("omits wrestlers with no decided bouts", () => {
    expect(loadRecords(db, BASHO).has(99)).toBe(false);
  });
});
