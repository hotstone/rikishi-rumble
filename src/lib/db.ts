import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getConfig } from "./config";
import { userIdFromName } from "./users";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // In production (Fly.io), use /data volume; locally use ./data
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "rikishi-rumble.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initializeSchema(db);
  migrateSchema(db);
  syncUsersFromConfig(db);

  return db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS basho (
      id TEXT PRIMARY KEY,
      start_date TEXT,
      status TEXT DEFAULT 'upcoming'
    );

    CREATE TABLE IF NOT EXISTS stables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      basho_id TEXT REFERENCES basho(id),
      user_id TEXT REFERENCES users(id),
      tier INTEGER NOT NULL,
      rikishi_id INTEGER NOT NULL,
      selected_at TEXT NOT NULL,
      UNIQUE(basho_id, user_id, tier)
    );

    CREATE TABLE IF NOT EXISTS substitutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      basho_id TEXT,
      user_id TEXT,
      day INTEGER NOT NULL,
      old_rikishi INTEGER NOT NULL,
      new_rikishi INTEGER NOT NULL,
      tier INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rikishi_cache (
      id INTEGER NOT NULL,
      name TEXT NOT NULL,
      rank TEXT NOT NULL,
      basho_id TEXT NOT NULL,
      tier INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(id, basho_id)
    );

    CREATE TABLE IF NOT EXISTS bout_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      basho_id TEXT NOT NULL,
      day INTEGER NOT NULL,
      east_id INTEGER NOT NULL,
      west_id INTEGER NOT NULL,
      winner_id INTEGER,
      loser_id INTEGER,
      kimarite TEXT,
      is_kimboshi INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS daily_scores (
      basho_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      day INTEGER NOT NULL,
      points INTEGER DEFAULT 0,
      kimboshi INTEGER DEFAULT 0,
      PRIMARY KEY(basho_id, user_id, day)
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      initials TEXT,
      password_hash TEXT,
      is_site_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      basho_id TEXT NOT NULL,
      day INTEGER,
      status TEXT NOT NULL,
      message TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

function migrateSchema(db: Database.Database) {
  // Bout results migration: add east_id/west_id columns
  const boutCols = db.prepare("PRAGMA table_info(bout_results)").all() as { name: string; notnull: number }[];
  const boutColNames = new Set(boutCols.map((c) => c.name));

  const winnerCol = boutCols.find((c) => c.name === "winner_id");
  const needsRecreate = !boutColNames.has("east_id") || (winnerCol && winnerCol.notnull === 1);

  if (needsRecreate) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bout_results_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        basho_id TEXT NOT NULL,
        day INTEGER NOT NULL,
        east_id INTEGER NOT NULL,
        west_id INTEGER NOT NULL,
        winner_id INTEGER,
        loser_id INTEGER,
        kimarite TEXT,
        is_kimboshi INTEGER DEFAULT 0
      );
      INSERT INTO bout_results_new (id, basho_id, day, east_id, west_id, winner_id, loser_id, kimarite, is_kimboshi)
        SELECT id, basho_id, day,
          COALESCE(${boutColNames.has("east_id") ? "east_id" : "winner_id"}, winner_id),
          COALESCE(${boutColNames.has("west_id") ? "west_id" : "loser_id"}, loser_id),
          winner_id, loser_id, kimarite, is_kimboshi
        FROM bout_results;
      DROP TABLE bout_results;
      ALTER TABLE bout_results_new RENAME TO bout_results;
    `);
  }

  // Users migration: add password_hash and admin columns
  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const userColNames = new Set(userCols.map((c) => c.name));

  if (!userColNames.has("password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
  }
  if (!userColNames.has("admin")) {
    db.exec("ALTER TABLE users ADD COLUMN admin INTEGER DEFAULT 0");
  }

  // Versioned one-off migrations
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const versionRow = db.prepare("SELECT MAX(version) as v FROM schema_version").get() as {
    v: number | null;
  };
  const version = versionRow.v ?? 0;

  if (version < 1) {
    repairMutatedStables(db);
    db.prepare("INSERT INTO schema_version (version) VALUES (1)").run();
  }

  if (version < 2) {
    migrateUsersToAccounts(db);
    db.prepare("INSERT INTO schema_version (version) VALUES (2)").run();
  }
}

/** Domain for generated account emails. Real domain; no mailboxes exist yet. */
export const ACCOUNT_EMAIL_DOMAIN = "rikishi-rumble.com";

/**
 * Phase 4 identity migration: seed `accounts` from the legacy `users` table.
 *
 * Deviation from REFACTOR_PLAN: account ids REUSE the existing slug user ids
 * rather than being fresh nanoids. Every stables/substitutions/daily_scores row
 * is already keyed by that slug, so reusing it keeps history intact with zero
 * row rewrites and no window where a foreign key points at nothing.
 *
 * bcrypt hashes carry across untouched -- every production user has already
 * completed the PIN->password migration, so nobody is forced to reset.
 * Exported for tests.
 */
export function migrateUsersToAccounts(db: Database.Database) {
  const users = db
    .prepare("SELECT id, name, password_hash, admin FROM users")
    .all() as { id: string; name: string; password_hash: string | null; admin: number }[];

  if (users.length === 0) return;

  const initialsById = new Map<string, string | null>();
  for (const user of getConfig().users) {
    initialsById.set(userIdFromName(user.name), user.initials ?? null);
  }

  const insert = db.prepare(
    `INSERT INTO accounts
       (id, email, display_name, initials, password_hash, is_site_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`
  );

  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    for (const user of users) {
      insert.run(
        user.id,
        `${user.id}@${ACCOUNT_EMAIL_DOMAIN}`,
        user.name,
        initialsById.get(user.id) ?? null,
        user.password_hash,
        user.admin ? 1 : 0,
        now
      );
    }
  });

  transaction();
}

/**
 * One-off repair for the historical stables-mutation bug: substitutions used
 * to overwrite stables.rikishi_id, losing the original pick. The first sub's
 * old_rikishi per (basho, user, tier) is the true original — restore it.
 * Post-bug-fix rows already match their first sub's old_rikishi, so this is a
 * no-op for them. Exported for tests.
 */
export function repairMutatedStables(db: Database.Database) {
  const subs = db
    .prepare(
      "SELECT basho_id, user_id, tier, old_rikishi, created_at FROM substitutions ORDER BY created_at"
    )
    .all() as {
    basho_id: string;
    user_id: string;
    tier: number;
    old_rikishi: number;
    created_at: string;
  }[];

  const restore = db.prepare(
    `INSERT INTO stables (basho_id, user_id, tier, rikishi_id, selected_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(basho_id, user_id, tier) DO UPDATE SET rikishi_id = excluded.rikishi_id`
  );

  const transaction = db.transaction(() => {
    const seen = new Set<string>();
    for (const sub of subs) {
      const key = `${sub.basho_id}|${sub.user_id}|${sub.tier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      restore.run(sub.basho_id, sub.user_id, sub.tier, sub.old_rikishi, sub.created_at);
    }
  });

  transaction();
}

function syncUsersFromConfig(db: Database.Database) {
  const config = getConfig();
  const upsert = db.prepare(
    "INSERT INTO users (id, name, admin) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, admin = excluded.admin"
  );

  const transaction = db.transaction(() => {
    for (const user of config.users) {
      upsert.run(userIdFromName(user.name), user.name, user.admin ? 1 : 0);
    }
  });

  transaction();
}
