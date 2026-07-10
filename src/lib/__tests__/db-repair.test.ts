import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { repairMutatedStables } from "@/lib/db";

const BASHO = "202603";
let db: Database.Database;

function stableRow(userId: string, tier: number) {
  return db
    .prepare("SELECT rikishi_id FROM stables WHERE basho_id = ? AND user_id = ? AND tier = ?")
    .get(BASHO, userId, tier) as { rikishi_id: number } | undefined;
}

beforeEach(() => {
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
});

function seedStable(userId: string, tier: number, rikishiId: number) {
  db.prepare(
    "INSERT INTO stables (basho_id, user_id, tier, rikishi_id, selected_at) VALUES (?, ?, ?, ?, 't0')"
  ).run(BASHO, userId, tier, rikishiId);
}

function seedSub(userId: string, tier: number, day: number, oldR: number, newR: number, at: string) {
  db.prepare(
    "INSERT INTO substitutions (basho_id, user_id, day, old_rikishi, new_rikishi, tier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(BASHO, userId, day, oldR, newR, tier, at);
}

describe("repairMutatedStables", () => {
  it("restores a mutated row to the first sub's old_rikishi", () => {
    seedStable("alice", 3, 11); // corrupted: holds the post-sub wrestler
    seedSub("alice", 3, 4, 5, 11, "2026-03-12T10:00:00Z");

    repairMutatedStables(db);
    expect(stableRow("alice", 3)?.rikishi_id).toBe(5);
  });

  it("uses the FIRST sub in a chain, not a later one", () => {
    seedStable("alice", 3, 12); // corrupted twice: 5 -> 11 -> 12
    seedSub("alice", 3, 4, 5, 11, "2026-03-12T10:00:00Z");
    seedSub("alice", 3, 8, 11, 12, "2026-03-16T10:00:00Z");

    repairMutatedStables(db);
    expect(stableRow("alice", 3)?.rikishi_id).toBe(5);
  });

  it("is a no-op for post-bug-fix rows that already hold the original", () => {
    seedStable("bob", 2, 4); // clean: sub was recorded without mutating stables
    seedSub("bob", 2, 5, 4, 40, "2026-03-14T10:00:00Z");

    repairMutatedStables(db);
    expect(stableRow("bob", 2)?.rikishi_id).toBe(4);
  });

  it("leaves tiers and users without substitutions untouched", () => {
    seedStable("alice", 1, 1);
    seedStable("carol", 3, 6);
    seedSub("alice", 3, 4, 5, 11, "2026-03-12T10:00:00Z");

    repairMutatedStables(db);
    expect(stableRow("alice", 1)?.rikishi_id).toBe(1);
    expect(stableRow("carol", 3)?.rikishi_id).toBe(6);
  });

  it("recreates a missing stables row from the sub record", () => {
    seedSub("alice", 3, 4, 5, 11, "2026-03-12T10:00:00Z");

    repairMutatedStables(db);
    expect(stableRow("alice", 3)?.rikishi_id).toBe(5);
  });

  it("is idempotent", () => {
    seedStable("alice", 3, 11);
    seedSub("alice", 3, 4, 5, 11, "2026-03-12T10:00:00Z");

    repairMutatedStables(db);
    repairMutatedStables(db);
    expect(stableRow("alice", 3)?.rikishi_id).toBe(5);
    const count = db.prepare("SELECT COUNT(*) as c FROM stables").get() as { c: number };
    expect(count.c).toBe(1);
  });
});
