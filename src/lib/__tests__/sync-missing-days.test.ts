import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { SumoApiTorikumiMatch } from "@/types";

// Isolated data dir + config, set before db/config modules load.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rikishi-syncmissing-"));
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

vi.mock("@/lib/basho", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/basho")>();
  return { ...actual, currentBashoDay: vi.fn() };
});

const START_DATE = "2026-09-13T00:00:00.000Z";

function schedule(day: number, bashoId: string): SumoApiTorikumiMatch[] {
  // Two undecided bouts, as the API returns them before matches are fought
  return [1, 2].map((matchNo) => ({
    bashoId,
    division: "Makuuchi",
    day,
    matchNo,
    eastId: 200 + matchNo * 2,
    eastShikona: `East${matchNo}`,
    eastRank: "Maegashira 5 East",
    westId: 201 + matchNo * 2,
    westShikona: `West${matchNo}`,
    westRank: "Maegashira 6 West",
    kimarite: "",
    winnerId: 0,
    winnerEn: "",
    winnerJp: "",
  }));
}

async function setup(bashoId: string, day: number) {
  const { fetchTorikumi } = await import("@/lib/sumo-api");
  const { currentBashoDay } = await import("@/lib/basho");
  const { getDb } = await import("@/lib/db");

  vi.mocked(currentBashoDay).mockReturnValue(day);
  vi.mocked(fetchTorikumi).mockImplementation(async (id, d) => ({
    matches: schedule(d, id),
    startDate: START_DATE,
  }));

  return { db: getDb(), fetchTorikumi: vi.mocked(fetchTorikumi) };
}

function boutCount(db: import("better-sqlite3").Database, bashoId: string, day: number) {
  const row = db
    .prepare("SELECT COUNT(*) as c FROM bout_results WHERE basho_id = ? AND day = ?")
    .get(bashoId, day) as { c: number };
  return row.c;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncMissingDays", () => {
  it("fetches today and tomorrow when both are missing", async () => {
    const { db, fetchTorikumi } = await setup("202601", 3);
    const { syncMissingDays } = await import("@/lib/sync");

    const synced = await syncMissingDays("202601");

    expect(synced).toEqual([3, 4]);
    expect(fetchTorikumi).toHaveBeenCalledTimes(2);
    expect(boutCount(db, "202601", 3)).toBe(2);
    expect(boutCount(db, "202601", 4)).toBe(2);
  });

  it("no-ops without an API call once both days are present", async () => {
    const { fetchTorikumi } = await setup("202603", 5);
    const { syncMissingDays } = await import("@/lib/sync");

    await syncMissingDays("202603");
    fetchTorikumi.mockClear();

    const synced = await syncMissingDays("202603");

    expect(synced).toEqual([]);
    expect(fetchTorikumi).not.toHaveBeenCalled();
  });

  it("fetches only the missing day when today is already synced", async () => {
    const { fetchTorikumi } = await setup("202605", 7);
    const { syncMissingDays } = await import("@/lib/sync");

    await syncMissingDays("202605");
    // Advance to the evening scenario: day 8 becomes "tomorrow"
    const { currentBashoDay } = await import("@/lib/basho");
    vi.mocked(currentBashoDay).mockReturnValue(8);
    fetchTorikumi.mockClear();

    const synced = await syncMissingDays("202605");

    expect(synced).toEqual([9]);
    expect(fetchTorikumi).toHaveBeenCalledTimes(1);
    expect(fetchTorikumi).toHaveBeenCalledWith("202605", 9);
  });

  it("does not look past day 15", async () => {
    const { fetchTorikumi } = await setup("202607", 15);
    const { syncMissingDays } = await import("@/lib/sync");

    const synced = await syncMissingDays("202607");

    expect(synced).toEqual([15]);
    expect(fetchTorikumi).toHaveBeenCalledTimes(1);
    expect(fetchTorikumi).toHaveBeenCalledWith("202607", 15);
  });

  it("fetches day 1 on the eve of the basho (day 0)", async () => {
    const { fetchTorikumi } = await setup("202611", 0);
    const { syncMissingDays } = await import("@/lib/sync");

    const synced = await syncMissingDays("202611");

    expect(synced).toEqual([1]);
    expect(fetchTorikumi).toHaveBeenCalledTimes(1);
    expect(fetchTorikumi).toHaveBeenCalledWith("202611", 1);
  });

  it("returns empty and stays pending when the API has no schedule yet", async () => {
    const { db, fetchTorikumi } = await setup("202613", 2);
    const { syncMissingDays } = await import("@/lib/sync");
    fetchTorikumi.mockResolvedValue({ matches: [], startDate: undefined });

    const synced = await syncMissingDays("202613");

    expect(synced).toEqual([]);
    expect(boutCount(db, "202613", 2)).toBe(0);
    expect(boutCount(db, "202613", 3)).toBe(0);
  });
});
