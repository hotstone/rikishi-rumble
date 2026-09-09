import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

// Point config at an isolated dir BEFORE importing db (config caches on first use).
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rikishi-accounts-"));
process.env.DATA_DIR = dataDir;
fs.writeFileSync(
  path.join(dataDir, "config.json"),
  JSON.stringify({
    timezone: "Australia/Sydney",
    users: [
      { name: "Matt", pin: "1111", admin: true, initials: "MH" },
      { name: "Sarah", pin: "2222", admin: false, initials: "SP" },
      { name: "No Initials", pin: "3333", admin: false },
    ],
  })
);

let migrateUsersToAccounts: typeof import("@/lib/db").migrateUsersToAccounts;
let ACCOUNT_EMAIL_DOMAIN: string;
let db: Database.Database;

beforeAll(async () => {
  const mod = await import("@/lib/db");
  migrateUsersToAccounts = mod.migrateUsersToAccounts;
  ACCOUNT_EMAIL_DOMAIN = mod.ACCOUNT_EMAIL_DOMAIN;
});

function seedUser(id: string, name: string, hash: string | null, admin: number) {
  db.prepare("INSERT INTO users (id, name, password_hash, admin) VALUES (?, ?, ?, ?)").run(
    id,
    name,
    hash,
    admin
  );
}

function accounts() {
  return db.prepare("SELECT * FROM accounts ORDER BY id").all() as {
    id: string;
    email: string;
    display_name: string;
    initials: string | null;
    password_hash: string | null;
    is_site_admin: number;
    created_at: string;
  }[];
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      password_hash TEXT,
      admin INTEGER DEFAULT 0
    );
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
});

describe("migrateUsersToAccounts", () => {
  it("creates one account per user, keyed by the existing slug id", () => {
    seedUser("matt", "Matt", "$2a$10$hash-matt", 1);
    seedUser("sarah", "Sarah", "$2a$10$hash-sarah", 0);

    migrateUsersToAccounts(db);

    expect(accounts().map((a) => a.id)).toEqual(["matt", "sarah"]);
  });

  it("derives the email from the slug id", () => {
    seedUser("matt", "Matt", "$2a$10$hash-matt", 1);

    migrateUsersToAccounts(db);

    expect(accounts()[0].email).toBe(`matt@${ACCOUNT_EMAIL_DOMAIN}`);
  });

  it("carries the bcrypt hash across untouched so nobody must reset", () => {
    seedUser("matt", "Matt", "$2a$10$hash-matt", 1);

    migrateUsersToAccounts(db);

    expect(accounts()[0].password_hash).toBe("$2a$10$hash-matt");
  });

  it("preserves the admin flag as is_site_admin", () => {
    seedUser("matt", "Matt", null, 1);
    seedUser("sarah", "Sarah", null, 0);

    migrateUsersToAccounts(db);

    const byId = Object.fromEntries(accounts().map((a) => [a.id, a.is_site_admin]));
    expect(byId).toEqual({ matt: 1, sarah: 0 });
  });

  it("takes initials from config, and leaves them null when absent", () => {
    seedUser("matt", "Matt", null, 1);
    seedUser("no-initials", "No Initials", null, 0);

    migrateUsersToAccounts(db);

    const byId = Object.fromEntries(accounts().map((a) => [a.id, a.initials]));
    expect(byId).toEqual({ matt: "MH", "no-initials": null });
  });

  it("is idempotent - a second run changes nothing", () => {
    seedUser("matt", "Matt", "$2a$10$hash-matt", 1);

    migrateUsersToAccounts(db);
    const first = accounts();
    migrateUsersToAccounts(db);

    expect(accounts()).toEqual(first);
  });

  it("does not clobber an account that already exists", () => {
    seedUser("matt", "Matt", "$2a$10$new-hash", 1);
    db.prepare(
      `INSERT INTO accounts (id, email, display_name, initials, password_hash, is_site_admin, created_at)
       VALUES ('matt', 'real@example.com', 'Matt', 'MH', '$2a$10$existing', 1, 't0')`
    ).run();

    migrateUsersToAccounts(db);

    expect(accounts()[0].email).toBe("real@example.com");
    expect(accounts()[0].password_hash).toBe("$2a$10$existing");
  });

  it("rejects a duplicate email via the unique index", () => {
    seedUser("matt", "Matt", null, 1);
    migrateUsersToAccounts(db);

    expect(() =>
      db
        .prepare(
          `INSERT INTO accounts (id, email, display_name, password_hash, is_site_admin, created_at)
           VALUES ('other', 'MATT@rikishi-rumble.com', 'Other', null, 0, 't0')`
        )
        .run()
    ).toThrow(/UNIQUE/i);
  });

  it("does nothing when there are no users", () => {
    migrateUsersToAccounts(db);
    expect(accounts()).toEqual([]);
  });
});
