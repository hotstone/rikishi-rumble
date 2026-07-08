import { describe, it, expect } from "vitest";
import {
  bashoLabel,
  currentBashoDay,
  nextBashoStart,
  mostRecentBashoStart,
  stableLockDate,
} from "@/lib/basho";

// Known fixture: Nagoya 2026 starts Sunday 2026-07-12 (second Sunday of July).

describe("bashoLabel", () => {
  it("maps basho IDs to names", () => {
    expect(bashoLabel("202601")).toBe("HATSU BASHO 2026");
    expect(bashoLabel("202607")).toBe("NAGOYA BASHO 2026");
    expect(bashoLabel("202511")).toBe("KYUSHU BASHO 2025");
  });

  it("falls back to the raw ID for unknown months", () => {
    expect(bashoLabel("202613")).toBe("202613");
  });
});

describe("nextBashoStart", () => {
  it("finds the upcoming basho in the same month", () => {
    const { bashoId, startDate } = nextBashoStart(new Date("2026-07-08T00:00:00Z"));
    expect(bashoId).toBe("202607");
    expect(startDate.toISOString()).toBe("2026-07-12T00:00:00.000Z");
  });

  it("skips to the next basho once the start date has passed", () => {
    const { bashoId, startDate } = nextBashoStart(new Date("2026-07-12T12:00:00Z"));
    expect(bashoId).toBe("202609");
    expect(startDate.toISOString()).toBe("2026-09-13T00:00:00.000Z");
  });

  it("crosses the year boundary", () => {
    const { bashoId, startDate } = nextBashoStart(new Date("2025-12-01T00:00:00Z"));
    expect(bashoId).toBe("202601");
    expect(startDate.toISOString()).toBe("2026-01-11T00:00:00.000Z");
  });
});

describe("mostRecentBashoStart", () => {
  it("finds the current basho mid-tournament", () => {
    const result = mostRecentBashoStart(new Date("2026-07-15T00:00:00Z"));
    expect(result?.bashoId).toBe("202607");
    expect(result?.startDate.toISOString()).toBe("2026-07-12T00:00:00.000Z");
  });

  it("crosses the year boundary backwards", () => {
    const result = mostRecentBashoStart(new Date("2026-01-05T00:00:00Z"));
    expect(result?.bashoId).toBe("202511");
    expect(result?.startDate.toISOString()).toBe("2025-11-09T00:00:00.000Z");
  });
});

describe("currentBashoDay", () => {
  const start = "2026-07-12T00:00:00.000Z"; // 09:00 JST on day 1

  it("returns 0 without a start date", () => {
    expect(currentBashoDay(null, new Date("2026-07-15T00:00:00Z"))).toBe(0);
  });

  it("returns 0 before the basho starts", () => {
    expect(currentBashoDay(start, new Date("2026-07-11T00:00:00Z"))).toBe(0);
  });

  it("rolls over to day 1 at JST midnight, not UTC midnight", () => {
    // 2026-07-11 15:00 UTC is already 2026-07-12 00:00 JST
    expect(currentBashoDay(start, new Date("2026-07-11T15:00:00Z"))).toBe(1);
  });

  it("computes mid-basho days", () => {
    expect(currentBashoDay(start, new Date("2026-07-12T00:00:00Z"))).toBe(1);
    expect(currentBashoDay(start, new Date("2026-07-19T00:00:00Z"))).toBe(8);
    expect(currentBashoDay(start, new Date("2026-07-26T00:00:00Z"))).toBe(15);
  });

  it("clamps to 15 after the basho ends", () => {
    // Pinning current behaviour: callers rely on getActiveBasho's day-15
    // completion check to detect the end, not on this returning 0.
    expect(currentBashoDay(start, new Date("2026-08-05T00:00:00Z"))).toBe(15);
  });
});

describe("stableLockDate", () => {
  it("locks at 16:00 JST (07:00 UTC) on day 1, derived from the basho ID", () => {
    expect(stableLockDate("202607", null).toISOString()).toBe("2026-07-12T07:00:00.000Z");
  });

  it("prefers the DB start date when available", () => {
    expect(stableLockDate("202607", "2026-07-12T00:00:00.000Z").toISOString()).toBe(
      "2026-07-12T07:00:00.000Z"
    );
  });
});
