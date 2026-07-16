import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Point the app at an isolated data dir with a fixture config BEFORE any
// db/config module is loaded (both cache singletons on first use).
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rikishi-wrestlers-"));
process.env.DATA_DIR = dataDir;
fs.writeFileSync(
  path.join(dataDir, "config.json"),
  JSON.stringify({
    timezone: "Australia/Sydney",
    users: [{ name: "Alice", pin: "1111", admin: true }],
  })
);

const BASHO = "202601";

type GetWrestlers = typeof import("@/lib/wrestlers").getWrestlers;
let getWrestlers: GetWrestlers;

beforeAll(async () => {
  const { getDb } = await import("@/lib/db");
  ({ getWrestlers } = await import("@/lib/wrestlers"));

  const db = getDb();
  const cache = db.prepare(
    "INSERT INTO rikishi_cache (id, name, rank, basho_id, tier) VALUES (?, ?, ?, ?, ?)"
  );
  cache.run(1, "Yoko", "Y1e", BASHO, 1);
  cache.run(2, "Ozzy", "O1e", BASHO, 1);
  cache.run(3, "JuryoGuy", "J1e", BASHO, 0); // Juryo fill-in, surfaces as tier 5

  const bout = db.prepare(
    "INSERT INTO bout_results (basho_id, day, east_id, west_id, winner_id, loser_id, kimarite, is_kimboshi) VALUES (?, ?, ?, ?, ?, ?, 'yorikiri', 0)"
  );
  bout.run(BASHO, 1, 1, 2, 1, 2);
  bout.run(BASHO, 2, 2, 1, 1, 2);
  bout.run(BASHO, 3, 1, 3, 3, 1);
  bout.run(BASHO, 4, 1, 2, null, null); // undecided
});

describe("getWrestlers records", () => {
  it("attaches whole-basho cumulative records in the fallback path", () => {
    const all = getWrestlers(BASHO, null, null);
    expect(all.find((w) => w.id === 1)).toMatchObject({ wins: 2, losses: 1 });
    expect(all.find((w) => w.id === 2)).toMatchObject({ wins: 0, losses: 2 });
  });

  it("keeps records whole-basho even when filtering wrestlers by day", () => {
    const day1 = getWrestlers(BASHO, null, 1);
    // day filter narrows who appears, not the record window
    expect(day1.find((w) => w.id === 1)).toMatchObject({ wins: 2, losses: 1 });
  });

  it("keeps a tier-0 Juryo fill-in's record through the tier-5 remap", () => {
    const day3 = getWrestlers(BASHO, null, 3);
    expect(day3.find((w) => w.id === 3)).toMatchObject({ tier: 5, wins: 1, losses: 0 });
  });
});
