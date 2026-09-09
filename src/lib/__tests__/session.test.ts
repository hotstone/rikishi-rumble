import { describe, it, expect, beforeAll } from "vitest";

process.env.SESSION_SECRET = "test-secret-for-session-tests";

let createSessionToken: typeof import("@/lib/session").createSessionToken;
let verifySessionToken: typeof import("@/lib/session").verifySessionToken;

beforeAll(async () => {
  const mod = await import("@/lib/session");
  createSessionToken = mod.createSessionToken;
  verifySessionToken = mod.verifySessionToken;
});

describe("session tokens", () => {
  it("round-trips an account id", async () => {
    const token = await createSessionToken("matt");
    expect(await verifySessionToken(token)).toBe("matt");
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken("matt");
    // Flip a character in the signature segment
    const parts = token.split(".");
    parts[2] =
      parts[2][0] === "A" ? "B" + parts[2].slice(1) : "A" + parts[2].slice(1);
    expect(await verifySessionToken(parts.join("."))).toBeNull();
  });

  it("rejects a hand-crafted unsigned payload (the old cookie format)", async () => {
    const forged = JSON.stringify({ userId: "matt", name: "Matt", admin: true });
    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("rejects an alg=none token", async () => {
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const forged = `${b64({ alg: "none" })}.${b64({ sub: "matt" })}.`;
    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });
});
