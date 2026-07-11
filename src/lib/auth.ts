import bcrypt from "bcryptjs";
import type Database from "better-sqlite3";

const SALT_ROUNDS = 10;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export interface UserRow {
  id: string;
  name: string;
  password_hash: string | null;
  admin: number;
}

export function findUser(db: Database.Database, userId: string): UserRow | undefined {
  return db
    .prepare("SELECT id, name, password_hash, admin FROM users WHERE id = ?")
    .get(userId) as UserRow | undefined;
}

export function setUserPassword(db: Database.Database, userId: string, password: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    hashPassword(password),
    userId
  );
}

export function clearUserPassword(db: Database.Database, userId: string): void {
  db.prepare("UPDATE users SET password_hash = NULL WHERE id = ?").run(userId);
}
