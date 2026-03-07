import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getConfig } from "./config";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "rikishi-rumble.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initializeSchema(db);
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
      winner_id INTEGER NOT NULL,
      loser_id INTEGER NOT NULL,
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

function syncUsersFromConfig(db: Database.Database) {
  const config = getConfig();
  const upsert = db.prepare(
    "INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name"
  );
  const ensureBasho = db.prepare(
    "INSERT OR IGNORE INTO basho (id, status) VALUES (?, 'active')"
  );

  const transaction = db.transaction(() => {
    for (const user of config.users) {
      const id = user.name.toLowerCase().replace(/\s+/g, "-");
      upsert.run(id, user.name);
    }
    ensureBasho.run(config.basho);
  });

  transaction();
}
