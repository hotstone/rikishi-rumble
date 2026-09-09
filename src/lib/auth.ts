import bcrypt from "bcryptjs";
import type Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { getDb } from "./db";
import { getSessionAccountId } from "./session";
import type { UserSession } from "@/types";

const SALT_ROUNDS = 10;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export interface AccountRow {
  id: string;
  email: string;
  display_name: string;
  initials: string | null;
  password_hash: string | null;
  is_site_admin: number;
}

const ACCOUNT_COLUMNS =
  "id, email, display_name, initials, password_hash, is_site_admin";

export function findAccountById(
  db: Database.Database,
  id: string
): AccountRow | undefined {
  return db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`)
    .get(id) as AccountRow | undefined;
}

export function findAccountByEmail(
  db: Database.Database,
  email: string
): AccountRow | undefined {
  return db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE email = ?`)
    .get(email.trim()) as AccountRow | undefined;
}

/** Email + password → account, or null. Constant-shaped on both failure paths. */
export function authenticateAccount(
  db: Database.Database,
  email: string,
  password: string
): AccountRow | null {
  const account = findAccountByEmail(db, email);
  if (!account?.password_hash) return null;
  if (!verifyPassword(password, account.password_hash)) return null;
  return account;
}

export function setAccountPassword(
  db: Database.Database,
  accountId: string,
  password: string
): void {
  db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(
    hashPassword(password),
    accountId
  );
}

export function accountToSession(account: AccountRow): UserSession {
  return {
    userId: account.id,
    name: account.display_name,
    admin: !!account.is_site_admin,
  };
}

/**
 * Full session identity for API routes: verifies the JWT cookie, then loads
 * the account server-side. Name/admin are never trusted from the client.
 * Node runtime only (hits the DB) — middleware uses getSessionAccountId.
 */
export async function getSessionUser(
  request: NextRequest
): Promise<UserSession | null> {
  const accountId = await getSessionAccountId(request);
  if (!accountId) return null;
  const account = findAccountById(getDb(), accountId);
  return account ? accountToSession(account) : null;
}
