import { describe, it, expect } from "vitest";
import { jstDateString, jstHour } from "@/lib/time";

describe("jstDateString", () => {
  it("formats an instant as its JST calendar date", () => {
    expect(jstDateString(new Date("2026-07-12T00:00:00Z"))).toBe("2026-07-12");
  });

  it("rolls to the next day at 15:00 UTC (JST midnight)", () => {
    expect(jstDateString(new Date("2026-07-11T14:59:59Z"))).toBe("2026-07-11");
    expect(jstDateString(new Date("2026-07-11T15:00:00Z"))).toBe("2026-07-12");
  });
});

describe("jstHour", () => {
  it("returns the JST hour (UTC+9)", () => {
    expect(jstHour(new Date("2026-07-12T09:00:00Z"))).toBe(18);
    expect(jstHour(new Date("2026-07-12T07:00:00Z"))).toBe(16);
  });

  it("handles midnight as 0, not 24", () => {
    expect(jstHour(new Date("2026-07-11T15:00:00Z"))).toBe(0);
  });
});
