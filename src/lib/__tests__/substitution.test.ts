import { describe, it, expect } from "vitest";
import {
  firstSubWindowOpen,
  finalSubWindowClose,
  isSubstitutionWindowOpen,
  subWindowIntervals,
  subWindowDay,
} from "@/lib/substitution";

// Nagoya 2026: starts 2026-07-12T00:00:00Z (09:00 JST on day 1).
const start = new Date("2026-07-12T00:00:00.000Z");

describe("window boundaries", () => {
  it("first window opens 18:00 JST on day 1", () => {
    expect(firstSubWindowOpen(start).toISOString()).toBe("2026-07-12T09:00:00.000Z");
  });

  it("final window closes 16:00 JST on day 15", () => {
    expect(finalSubWindowClose(start).toISOString()).toBe("2026-07-26T07:00:00.000Z");
  });
});

describe("subWindowIntervals", () => {
  it("produces 14 nightly windows spanning first open to final close", () => {
    const windows = subWindowIntervals(start);
    expect(windows).toHaveLength(14);
    expect(windows[0].opensAt).toEqual(firstSubWindowOpen(start));
    expect(windows[13].closesAt).toEqual(finalSubWindowClose(start));
  });

  it("each window opens 18:00 JST and closes 16:00 JST the next day", () => {
    const windows = subWindowIntervals(start);
    expect(windows[1].opensAt.toISOString()).toBe("2026-07-13T09:00:00.000Z");
    expect(windows[1].closesAt.toISOString()).toBe("2026-07-14T07:00:00.000Z");
  });

  it("leaves a 2-hour blackout between consecutive windows", () => {
    const windows = subWindowIntervals(start);
    for (let i = 1; i < windows.length; i++) {
      const gap = windows[i].opensAt.getTime() - windows[i - 1].closesAt.getTime();
      expect(gap).toBe(2 * 3600 * 1000);
    }
  });
});

describe("subWindowDay", () => {
  it("is null with no start date or outside any window", () => {
    expect(subWindowDay(null, new Date("2026-07-13T10:00:00Z"))).toBe(null);
    expect(subWindowDay(start, new Date("2026-07-12T08:59:00Z"))).toBe(null); // before first open
    expect(subWindowDay(start, new Date("2026-07-13T07:30:00Z"))).toBe(null); // blackout
    expect(subWindowDay(start, new Date("2026-07-26T07:00:00Z"))).toBe(null); // after final close
  });

  it("maps the evening window to the day whose results just finished", () => {
    // 18:05 JST on day 1
    expect(subWindowDay(start, new Date("2026-07-12T09:05:00Z"))).toBe(1);
    // 18:05 JST on day 3
    expect(subWindowDay(start, new Date("2026-07-14T09:05:00Z"))).toBe(3);
  });

  it("keeps the same sub day overnight past JST midnight", () => {
    // 02:00 JST on calendar day 2 is still day 1's window
    expect(subWindowDay(start, new Date("2026-07-12T17:00:00Z"))).toBe(1);
    // 15:59 JST on day 2, moments before the blackout — still day 1's window
    expect(subWindowDay(start, new Date("2026-07-13T06:59:00Z"))).toBe(1);
  });

  it("last window is day 14 (subs effective day 15)", () => {
    expect(subWindowDay(start, new Date("2026-07-26T06:59:00Z"))).toBe(14);
  });
});

describe("isSubstitutionWindowOpen", () => {
  it("is closed without a start date", () => {
    expect(isSubstitutionWindowOpen(null, new Date("2026-07-13T10:00:00Z"))).toBe(false);
  });

  it("is closed before the first window opens", () => {
    expect(isSubstitutionWindowOpen(start, new Date("2026-07-12T08:59:59Z"))).toBe(false);
  });

  it("opens at exactly 18:00 JST on day 1", () => {
    expect(isSubstitutionWindowOpen(start, new Date("2026-07-12T09:00:00Z"))).toBe(true);
  });

  it("stays open overnight until 16:00 JST", () => {
    // 06:59 UTC = 15:59 JST
    expect(isSubstitutionWindowOpen(start, new Date("2026-07-13T06:59:00Z"))).toBe(true);
  });

  it("is closed during the 16:00-18:00 JST blackout", () => {
    expect(isSubstitutionWindowOpen(start, new Date("2026-07-13T07:00:00Z"))).toBe(false); // 16:00 JST
    expect(isSubstitutionWindowOpen(start, new Date("2026-07-13T08:59:00Z"))).toBe(false); // 17:59 JST
  });

  it("reopens at 18:00 JST", () => {
    expect(isSubstitutionWindowOpen(start, new Date("2026-07-13T09:00:00Z"))).toBe(true);
  });

  it("is open right up to the final close on day 15", () => {
    expect(isSubstitutionWindowOpen(start, new Date("2026-07-26T06:59:59Z"))).toBe(true);
  });

  it("closes for good at 16:00 JST on day 15", () => {
    expect(isSubstitutionWindowOpen(start, new Date("2026-07-26T07:00:00Z"))).toBe(false);
    expect(isSubstitutionWindowOpen(start, new Date("2026-07-27T10:00:00Z"))).toBe(false);
  });
});
