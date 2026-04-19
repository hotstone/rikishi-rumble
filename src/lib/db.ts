import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getConfig } from "./config";

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
}

function syncUsersFromConfig(db: Database.Database) {
  const config = getConfig();
  const upsert = db.prepare(
    "INSERT INTO users (id, name, admin) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, admin = excluded.admin"
  );
  const ensureBasho = db.prepare(
    "INSERT OR IGNORE INTO basho (id, status) VALUES (?, 'active')"
  );

  const transaction = db.transaction(() => {
    for (const user of config.users) {
      const id = user.name.toLowerCase().replace(/\s+/g, "-");
      upsert.run(id, user.name, user.admin ? 1 : 0);
    }
    ensureBasho.run(config.basho);
  });

  transaction();
}
