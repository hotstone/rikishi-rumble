import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Isolated data dir + config, set before db/config modules load.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rikishi-bouts-"));
process.env.DATA_DIR = dataDir;
fs.writeFileSync(
  path.join(dataDir, "config.json"),
  JSON.stringify({
    timezone: "Australia/Sydney",
    users: [
      { name: "Alice", admin: true },
      { name: "Bob", admin: false },
    ],
  })
);

const BASHO = "202601";

type Payload = ReturnType<typeof import("@/lib/bouts").getBoutsPayload>;
let getBoutsPayload: typeof import("@/lib/bouts").getBoutsPayload;

beforeAll(async () => {
  const { getDb } = await import("@/lib/db");
  getBoutsPayload = (await import("@/lib/bouts")).getBoutsPayload;

  const db = getDb();
  db.prepare("INSERT INTO basho (id, start_date, status) VALUES (?, ?, 'active')").run(
    BASHO,
    "2026-01-11T00:00:00.000Z"
  );

  const wrestler = db.prepare(
    "INSERT INTO rikishi_cache (id, name, rank, basho_id, tier) VALUES (?, ?, ?, ?, ?)"
  );
  wrestler.run(1, "Yoko", "Y1e", BASHO, 1);
  wrestler.run(2, "Ozzy", "O1e", BASHO, 1);
  wrestler.run(3, "Seki", "S1e", BASHO, 2);
  wrestler.run(4, "Komu", "K1e", BASHO, 2);

  const stable = db.prepare(
    "INSERT INTO stables (basho_id, user_id, tier, rikishi_id, selected_at) VALUES (?, ?, ?, ?, 't0')"
  );
  stable.run(BASHO, "alice", 1, 1);
  stable.run(BASHO, "alice", 2, 3);
  stable.run(BASHO, "bob", 1, 2);
  stable.run(BASHO, "bob", 2, 4);

  const bout = db.prepare(
    "INSERT INTO bout_results (basho_id, day, east_id, west_id, winner_id, loser_id) VALUES (?, ?, ?, ?, ?, ?)"
  );
  // Day 1: decided
  bout.run(BASHO, 1, 1, 2, 1, 2);
  // Day 2: scheduled, no results yet
  bout.run(BASHO, 2, 3, 4, null, null);
});

function dayBouts(payload: Payload, day: number) {
  return payload.boutsByDay[day];
}

describe("getBoutsPayload pick visibility", () => {
  it("shows all owners for a day once any bout has resolved", () => {
    const payload = getBoutsPayload(BASHO, "alice");
    const [bout] = dayBouts(payload, 1);
    expect(bout.east_owners).toEqual(["A"]);
    expect(bout.west_owners).toEqual(["B"]);
  });

  it("hides other users' picks for days with no decided bouts", () => {
    const payload = getBoutsPayload(BASHO, "alice");
    const [bout] = dayBouts(payload, 2);
    expect(bout.east_owners).toEqual(["A"]); // Alice's own pick stays visible
    expect(bout.west_owners).toEqual([]); // Bob's pick hidden from Alice
  });

  it("hides all picks on undecided days from anonymous requests", () => {
    const payload = getBoutsPayload(BASHO, null);
    const [bout] = dayBouts(payload, 2);
    expect(bout.east_owners).toEqual([]);
    expect(bout.west_owners).toEqual([]);
    expect(payload.myInitials).toBe(null);
  });

  it("returns the requesting user's initials", () => {
    expect(getBoutsPayload(BASHO, "alice").myInitials).toBe("A");
  });
});
