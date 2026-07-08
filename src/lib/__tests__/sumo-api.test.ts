import { describe, it, expect } from "vitest";
import {
  parseRank,
  getRankTier,
  shortRank,
  isYokozuna,
  isMaegashira,
} from "@/lib/sumo-api";

describe("parseRank", () => {
  it("parses full-text ranks", () => {
    expect(parseRank("Yokozuna 1 East")).toEqual({ base: "Y", number: 1, short: "Y1" });
    expect(parseRank("Ozeki 2 West")).toEqual({ base: "O", number: 2, short: "O2" });
    expect(parseRank("Sekiwake 1 East")).toEqual({ base: "S", number: 1, short: "S1" });
    expect(parseRank("Komusubi 2 West")).toEqual({ base: "K", number: 2, short: "K2" });
    expect(parseRank("Maegashira 12 West")).toEqual({ base: "M", number: 12, short: "M12" });
    expect(parseRank("Juryo 14 East")).toEqual({ base: "J", number: 14, short: "J14" });
  });

  it("defaults to number 1 when the rank has no number", () => {
    expect(parseRank("Yokozuna East")).toEqual({ base: "Y", number: 1, short: "Y1" });
  });

  it("falls back to abbreviated format", () => {
    expect(parseRank("M3w")).toEqual({ base: "M", number: 3, short: "M3w" });
    expect(parseRank("Y1e")).toEqual({ base: "Y", number: 1, short: "Y1e" });
  });

  it("passes through unknown ranks", () => {
    expect(parseRank("Banzuke-gai")).toEqual({ base: "Banzuke-gai", number: 0, short: "Banzuke-gai" });
  });
});

describe("getRankTier", () => {
  it("puts Yokozuna and Ozeki in tier 1", () => {
    expect(getRankTier("Yokozuna 1 East")).toBe(1);
    expect(getRankTier("Ozeki 1 West")).toBe(1);
  });

  it("puts Sekiwake and Komusubi in tier 2", () => {
    expect(getRankTier("Sekiwake 1 East")).toBe(2);
    expect(getRankTier("Komusubi 2 West")).toBe(2);
  });

  it("splits Maegashira at the 6/7 and 12/13 boundaries", () => {
    expect(getRankTier("Maegashira 1 East")).toBe(3);
    expect(getRankTier("Maegashira 6 West")).toBe(3);
    expect(getRankTier("Maegashira 7 East")).toBe(4);
    expect(getRankTier("Maegashira 12 West")).toBe(4);
    expect(getRankTier("Maegashira 13 East")).toBe(5);
    expect(getRankTier("Maegashira 17 West")).toBe(5);
  });

  it("puts Juryo (and unknowns) in tier 0", () => {
    expect(getRankTier("Juryo 1 East")).toBe(0);
    expect(getRankTier("Banzuke-gai")).toBe(0);
  });

  it("works on stored short ranks via the abbreviated fallback", () => {
    expect(getRankTier("M8e")).toBe(4);
    expect(getRankTier("Y1w")).toBe(1);
  });
});

describe("shortRank", () => {
  it("appends the side indicator", () => {
    expect(shortRank("Yokozuna 1 East")).toBe("Y1e");
    expect(shortRank("Maegashira 12 West")).toBe("M12w");
    expect(shortRank("Juryo 14 West")).toBe("J14w");
  });

  it("omits the side when none is present", () => {
    expect(shortRank("Yokozuna 1")).toBe("Y1");
  });

  it("leaves already-short ranks unchanged", () => {
    expect(shortRank("M3w")).toBe("M3w");
  });
});

describe("isYokozuna / isMaegashira", () => {
  it("matches both full-text and short ranks", () => {
    expect(isYokozuna("Yokozuna 1 East")).toBe(true);
    expect(isYokozuna("Y1e")).toBe(true);
    expect(isYokozuna("Ozeki 1 East")).toBe(false);
    expect(isMaegashira("Maegashira 5 West")).toBe(true);
    expect(isMaegashira("M5w")).toBe(true);
    expect(isMaegashira("Komusubi 1 East")).toBe(false);
  });
});
