import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Isolated data dir + config, set before db/config modules load.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rikishi-activebasho-"));
process.env.DATA_DIR = dataDir;
fs.writeFileSync(
  path.join(dataDir, "config.json"),
  JSON.stringify({
    timezone: "Australia/Sydney",
    users: [{ name: "Alice", admin: true }],
  })
);

// Nagoya 2026 starts Sunday 2026-07-12; Aki starts 2026-09-13.

let getActiveBasho: typeof import("@/lib/active-basho").getActiveBasho;
let getDisplayBasho: typeof import("@/lib/active-basho").getDisplayBasho;
let db: import("better-sqlite3").Database;

beforeAll(async () => {
  const activeBasho = await import("@/lib/active-basho");
  getActiveBasho = activeBasho.getActiveBasho;
  getDisplayBasho = activeBasho.getDisplayBasho;
  db = (await import("@/lib/db")).getDb();
});

describe("getActiveBasho", () => {
  it("is null well before the next basho", () => {
    expect(getActiveBasho(new Date("2026-07-01T00:00:00Z"))).toBe(null);
  });

  it("opens the next basho for selection 7 days before it starts", () => {
    // 4 days out
    const basho = getActiveBasho(new Date("2026-07-08T00:00:00Z"));
    expect(basho?.id).toBe("202607");
    expect(basho?.status).toBe("upcoming");
    // exactly 7 days out
    expect(getActiveBasho(new Date("2026-07-05T00:00:00Z"))?.id).toBe("202607");
    // 7 days + 1 minute out
    expect(getActiveBasho(new Date("2026-07-04T23:59:00Z"))).toBe(null);
  });

  it("returns the running basho mid-tournament", () => {
    expect(getActiveBasho(new Date("2026-07-15T00:00:00Z"))?.id).toBe("202607");
  });

  it("stays on the running basho on day 15 until all bouts are decided", () => {
    const day15 = new Date("2026-07-26T02:00:00Z");
    // Two bouts on day 15, one undecided -> still active
    db.prepare(
      "INSERT INTO bout_results (basho_id, day, east_id, west_id, winner_id, loser_id) VALUES ('202607', 15, 1, 2, 1, 2), ('202607', 15, 3, 4, NULL, NULL)"
    ).run();
    expect(getActiveBasho(day15)?.id).toBe("202607");

    // All decided -> basho over, next basho (Aki, 49 days out) not yet selectable
    db.prepare(
      "UPDATE bout_results SET winner_id = 3, loser_id = 4 WHERE winner_id IS NULL"
    ).run();
    expect(getActiveBasho(day15)).toBe(null);
  });

  it("ends a basho one grace day after day 15 even if results never arrived", () => {
    // 202607 day-15 rows are now all decided (previous test), but pretend the
    // final sync had failed: the calendar bound still ends it.
    db.prepare("DELETE FROM bout_results WHERE basho_id = '202607' AND day = 15").run();
    // Day 16 JST (grace day): still active so a late sync can backfill
    expect(getActiveBasho(new Date("2026-07-27T02:00:00Z"))?.id).toBe("202607");
    // Day 17 JST: over regardless of data
    expect(getActiveBasho(new Date("2026-07-28T02:00:00Z"))).toBe(null);
  });

  it("opens Aki for selection in the week before Sep 13", () => {
    expect(getActiveBasho(new Date("2026-09-08T00:00:00Z"))?.id).toBe("202609");
  });
});

// Runs after the getActiveBasho suite, which has left basho rows for 202607
// (started 2026-07-12) and 202609 (starts 2026-09-13) in the test DB.
describe("getDisplayBasho", () => {
  it("returns the active basho while one is running", () => {
    const basho = getDisplayBasho(new Date("2026-07-15T00:00:00Z"));
    expect(basho?.id).toBe("202607");
    // The row keeps whatever status it was created with ('upcoming' here);
    // only the between-basho fallback reports "completed".
    expect(basho?.status).not.toBe("completed");
  });

  it("falls back to the last completed basho between tournaments", () => {
    // Mid-August: Nagoya is over, Aki is 4 weeks out.
    expect(getActiveBasho(new Date("2026-08-15T00:00:00Z"))).toBe(null);
    const basho = getDisplayBasho(new Date("2026-08-15T00:00:00Z"));
    expect(basho?.id).toBe("202607");
    expect(basho?.status).toBe("completed");
  });

  it("ignores basho rows that have not started yet", () => {
    // The 202609 row exists (created by the selection-window test) but its
    // start date is in the future, so it is not "last completed".
    expect(getDisplayBasho(new Date("2026-08-15T00:00:00Z"))?.id).toBe("202607");
  });

  it("switches to the upcoming basho once its selection window opens", () => {
    const basho = getDisplayBasho(new Date("2026-09-08T00:00:00Z"));
    expect(basho?.id).toBe("202609");
    expect(basho?.status).toBe("upcoming");
  });
});
