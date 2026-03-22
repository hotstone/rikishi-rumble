# SQLite Authentication System Design

**Date:** 2026-03-23
**Status:** Approved
**Related:** `CLAUDE.md`, `config.json` auth migration

---

## Overview

Replace JSON config-based 4-digit PIN authentication with SQLite-backed password authentication using bcrypt hashing and secure HTTP-only cookies.

---

## Architecture

### Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser    │───→ │  API Route   │───→ │  SQLite DB  │
│ (Login Form) │     │  /api/auth   │     │  users[]    │
└─────────────┘     └──────────────┘     └─────────────┘
          │                 │                     │
          │                 ▼                     │
          │          ┌──────────────┐             │
          └─────────→│  Set Cookie   │◄───────────┘
                     │ rikishi-session│            │
                     └──────────────┘             │
                            │                     │
                            ▼                     │
                     ┌──────────────┐             │
                     │ LocalStorage │◄────────────┘
                     │ (session obj)│             │
                     └──────────────┘
```

### Session Model

| Storage | Purpose |
|---------|---------|
| HttpOnly cookie `rikishi-session` | Server-verifiable session (userId, isAdmin) |
| localStorage `rikishi-session` | Client-side convenience (redundant, for UI state) |
| `users.last_login` | Track last login for audit/debugging |

---

## Files to Create/Modify

### New Files

1. **`src/lib/auth.ts`** - Authentication logic (bcrypt, validation)
2. **`src/app/api/auth/signup/route.ts`** - User registration endpoint
3. **`src/scripts/migrate-config-users.ts`** - One-time migration script
4. **`src/scripts/generate-user-passwords.ts`** - CLI to generate initial passwords

### Modified Files

1. **`src/lib/db.ts`** - Add `createUsersTable()` and `USERS_TABLE` constant
2. **`src/app/api/auth/route.ts`** - Rewrite with DB + cookie handling
3. **`src/components/UserAuth.tsx`** - Replace PIN with password input
4. **`src/components/AdminPanel.tsx`** - Add "Users" tab
5. **`src/types/index.ts`** - Update types
6. **`package.json`** - Add `bcrypt` dependency

---

## Database Schema

### users Table

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  admin INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login TEXT
)
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| username | TEXT | Lowercase, unique, no spaces/special chars |
| password_hash | TEXT | bcrypt hash (60+ chars) |
| admin | INTEGER | 0 or 1 |
| created_at | TEXT | ISO timestamp |
| last_login | TEXT | ISO timestamp, nullable |

---

## API Endpoints

### GET `/api/auth`

List registered users (passwords excluded).

**Request:** None
**Response:** 200 OK
```json
{
  "users": [
    { "username": "matt", "admin": true, "created_at": "2026-03-23T00:00:00Z" },
    { "username": "sarah", "admin": false, "created_at": "2026-03-23T00:00:00Z" }
  ]
}
```

---

### POST `/api/auth`

Login with username and password.

**Request:** 400/401/200
```json
{
  "username": "matt",
  "password": "MattStrong123!"
}
```

**Response 200:**
```json
{
  "userId": "matt",
  "username": "Matt",
  "admin": true,
  "message": "redirect to dashboard"
}
```

**Response 401:**
```json
{ "error": "Invalid password" }
```

**Response 400:**
```json
{ "error": "Username required" }
```

---

### POST `/api/auth/signup`

Create a new user account.

**Request:** 400/201
```json
{
  "username": "joe",
  "password": "JoePass123!"
}
```

**Response 201:**
```json
{
  "userId": "joe",
  "username": "Joe",
  "admin": false,
  "message": "redirect to dashboard"
}
```

---

### POST `/api/auth/logout`

Clear session (optional, can be no-op).

**Request:** None
**Response:** 204 No Content

---

## Authentication Logic

### Password Hashing

```typescript
// src/lib/auth.ts

import bcrypt from "bcrypt";

const SALT_ROUNDS = 12; // ~100ms per hash, 250,000,000,000,000x brute force

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

### Session Cookie

```typescript
// Set on successful login
res.cookie("rikishi-session",
  JSON.stringify({ userId, isAdmin }),
  {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 86400 * 1000, // 24 hours, non-refreshing
    path: "/"
  }
);
```

---

## Admin Panel - Users Tab

Add to `src/components/AdminPanel.tsx`:

```tsx
<TabList defaultValue="overview" aria-label="Admin Panel">
  <Tab value="overview">Overview</Tab>
  <Tab value="substitutions">Substitutions</Tab>
  <Tab value="users">Users</Tab>  {/* New */}
</TabList>
```

**Users Tab Content:**
- List all users with username, admin flag, created date
- "Create New User" button → opens modal/form
- Delete button per user (with confirmation modal)
- Toggle admin flag switch

---

## UserAuth Component Changes

### Current (PIN-based)

```tsx
<select>
  <option value="">PLAYER</option>
  {users.map((u) => <option value={u.name}>{u.name}</option>)}
</select>
<input type="password" maxLength={4} placeholder="PIN" />
```

### New (Password-based)

```tsx
<input
  type="text"
  placeholder="Username"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
/>
<input
  type="password"
  placeholder="Password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
/>
<select>
  <option value="">REGISTER</option>
  {/* OR */}
  <option value="LOGIN">LOGIN</option>
</select>
```

**Behavior:**
- LOGIN mode: username/password pair authenticates against DB
- REGISTER mode: creates new user with generated password (admin=false)
- Display generated password in tooltip (user can copy it)

---

## Migration Script

### `src/scripts/migrate-config-users.ts`

One-time migration to populate `users` table from `config.json`.

**Logic:**
1. Read existing config.json users
2. Generate random password per user using `generatePassword()`
3. Hash each password
4. Insert into SQLite `users` table
5. Print generated passwords to console

**Example output:**
```
=== User Migration ===

Username: matt    Password: MattStrong123!
Username: sarah   Password: SarahPass456@
Username: marc    Password: MarcSecure789#
Username: chai    Password: ChaiWonton123!
Username: alys    Password: AlyssaBean456@
Username: mac     Password: MacDaddy789#

Migration complete. 6 users imported.
```

**Run:**
```bash
npm run migrate-users
```

---

## Security Considerations

1. **Password Hashing**
   - bcrypt with 12 rounds
   - Never store plaintext passwords

2. **Session Cookies**
   - HttpOnly (XSS protection)
   - SameSite=Strict (CSRF protection)
   - Non-refreshing (24h expiry)

3. **Rate Limiting**
   - Consider adding to `route.ts` (5 attempts per 15min IP)

4. **SQL Injection**
   - Use `database.prepare()` for all queries
   - No string interpolation

5. **XSS**
   - Sanitize user input on admin panel
   - Use `dangerouslySetInnerHTML` only after escaping

---

## Dependencies

```json
{
  "dependencies": {
    "bcrypt": "^5.1.1"
  }
}
```

---

## Testing

**Manual test cases:**
1. Login with correct credentials → redirect + cookie set
2. Login with wrong password → 401 error
3. Create new user → appears in user list
4. Delete user → logout, error on login
5. Session expiry → must re-login after 24h

**Run:**
```bash
npm test  # Add auth test suite
```

---

## Rollout

### Phase 1: Dev (Current Session)
- Deploy to Fly.io dev environment
- Run migration script
- Test all auth flows

### Phase 2: Switch Over
- Point live domain to new deploy
- Clear existing localStorage sessions (or leave working)
- Update users with new passwords

### Phase 3: Deprecate (Future)
- Remove PIN validation
- Delete config.json (keep for settings only)

---

## Appendix

### Password Generation

```typescript
function generatePassword(length: number = 12): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*()-_=+";
  const all = upper + lower + digits + special;

  let password = "";
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += special[Math.floor(Math.random() * special.length)];

  for (let i = 4; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle characters
  return password.split("").sort(() => Math.random() - 0.5).join("");
}
```

---

**Approved by user:** 2026-03-23
