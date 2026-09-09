import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  hashPassword,
  authenticateAccount,
  findAccountByEmail,
  setAccountPassword,
  accountToSession,
  findAccountById,
} from "@/lib/auth";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      initials TEXT,
      password_hash TEXT,
      is_site_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  db.prepare(
    `INSERT INTO accounts (id, email, display_name, initials, password_hash, is_site_admin, created_at)
     VALUES ('matt', 'matt@rikishi-rumble.com', 'Matt', 'MH', ?, 1, 't0')`
  ).run(hashPassword("hunter2boogaloo"));
});

describe("authenticateAccount", () => {
  it("authenticates with correct email and password", () => {
    const account = authenticateAccount(db, "matt@rikishi-rumble.com", "hunter2boogaloo");
    expect(account?.id).toBe("matt");
  });

  it("is case-insensitive on email", () => {
    const account = authenticateAccount(db, "MATT@Rikishi-Rumble.com", "hunter2boogaloo");
    expect(account?.id).toBe("matt");
  });

  it("trims surrounding whitespace on email", () => {
    const account = authenticateAccount(db, "  matt@rikishi-rumble.com ", "hunter2boogaloo");
    expect(account?.id).toBe("matt");
  });

  it("rejects a wrong password", () => {
    expect(authenticateAccount(db, "matt@rikishi-rumble.com", "wrong")).toBeNull();
  });

  it("rejects an unknown email", () => {
    expect(authenticateAccount(db, "nobody@rikishi-rumble.com", "hunter2boogaloo")).toBeNull();
  });

  it("rejects an account with no password set", () => {
    db.prepare(
      `INSERT INTO accounts (id, email, display_name, password_hash, is_site_admin, created_at)
       VALUES ('new', 'new@rikishi-rumble.com', 'New', NULL, 0, 't0')`
    ).run();
    expect(authenticateAccount(db, "new@rikishi-rumble.com", "")).toBeNull();
    expect(authenticateAccount(db, "new@rikishi-rumble.com", "anything")).toBeNull();
  });
});

describe("account helpers", () => {
  it("setAccountPassword replaces the hash", () => {
    setAccountPassword(db, "matt", "a-new-password");
    expect(authenticateAccount(db, "matt@rikishi-rumble.com", "hunter2boogaloo")).toBeNull();
    expect(authenticateAccount(db, "matt@rikishi-rumble.com", "a-new-password")?.id).toBe("matt");
  });

  it("accountToSession maps fields and coerces admin to boolean", () => {
    const account = findAccountById(db, "matt")!;
    expect(accountToSession(account)).toEqual({ userId: "matt", name: "Matt", admin: true });
  });

  it("findAccountByEmail returns undefined for a missing account", () => {
    expect(findAccountByEmail(db, "ghost@rikishi-rumble.com")).toBeUndefined();
  });
});
