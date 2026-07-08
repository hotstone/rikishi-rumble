# Rikishi Rumble — Refactor & Multi-Group Plan

Goal: clean up the single-group codebase, then open the app to self-service groups,
without a big-bang rewrite. The app stays deployable after every phase.

## Scheduling constraint

Changes that touch scoring, stables, or auth must not land during a live basho.

| Window | Dates (2026) | Safe work |
|---|---|---|
| Nagoya basho | Jul 12 – Jul 26 | Phase 0 only (tests, no src changes) |
| Gap | Jul 27 – Sep 12 | Phases 1–4 |
| Aki basho | Sep 13 – Sep 27 | Freeze; observe Phase 4 in production |
| Gap | Sep 28 – Nov 7 | Phases 5–6, invite first external group |

Deploys go via push to main (CI runs `fly deploy`). Never `fly deploy` locally.

---

## Phase 0 — Test safety net (safe during basho)

New dev deps: `vitest`. New script: `"test": "vitest run"`. Add a CI test step before deploy.

Tests to write, in order of value:

1. **`src/lib/sumo-api.ts` pure functions** — `parseRank`, `getRankTier`, `shortRank`,
   `isYokozuna`, `isMaegashira`. Cover: full-text ranks ("Yokozuna 1 East"), abbreviated
   fallback ("M3w"), Juryo → tier 0, M6/M7 and M12/M13 tier boundaries.
2. **`src/lib/basho.ts`** — `bashoLabel`, `currentBashoDay` (before start / day 1 / day 15 /
   after), `nextBashoStart` / `mostRecentBashoStart` across year boundary, `stableLockDate`.
3. **`src/lib/substitution.ts`** — window open/closed at 15:59, 16:00, 17:59, 18:00 JST;
   before first open; after final close. Inject a clock (see note below).
4. **Scoring + stable reconstruction against `:memory:` SQLite** — seed a fixture
   (2 users, 5-tier stables, bouts across 3 days, one substitution, one kimboshi, one fusen)
   and assert `calculateScores` output and per-day active stables. This pins current
   behaviour before Phase 1 moves the code.

Note: `substitution.ts` and `basho.ts` call `new Date()` internally. Minimal change allowed
in this phase: add an optional `now: Date = new Date()` parameter (already the pattern in
`nextBashoStart`). No other src changes.

**Done when:** `npm test` green in CI; scoring fixture matches production numbers for a
known basho day.

---

## Phase 1 — Extract the domain layer (gap after Nagoya)

Pure code movement + de-duplication. No behaviour change except one bug fix (1d below).

### 1a. `src/lib/time.ts` — single JST implementation
- `jstDateString(d)`, `jstHour(now?)`, `jstParts(now?)` built on `Intl.DateTimeFormat` parts.
- Delete the `new Date(x.toLocaleString("en-US", {timeZone}))` trick from
  `substitution.ts:1` and the locale-string parsing in `SubstitutionPanel.tsx:40-66`.
- `/api/basho` returns computed UTC timestamps: `subWindowOpensAt`, `subWindowClosesAt`,
  `firstSubOpenAt`, `finalSubCloseAt`, `stableLockAt`. Client countdowns become
  `target - Date.now()`; `useSubWindowCountdown` loses all timezone logic.

### 1b. `src/lib/users.ts`
- `userIdFromName(name)` — replaces the 5 copies of `name.toLowerCase().replace(/\s+/g, "-")`
  (db.ts:201, sync.ts:173, auth/route.ts:21,78, set-password/route.ts:28, admin/pin/route.ts:24).
- Move `syncUsersFromConfig` here from db.ts.

### 1c. `src/lib/stable.ts` — THE core extraction
```ts
// One implementation, replaces four:
stableForDay(db, bashoId, userId, day): Map<tier, rikishiId>   // subs with sub.day < day
currentStable(db, bashoId, userId): Map<tier, rikishiId>       // all subs applied
```
Both include the first-sub `old_rikishi` origin correction (removed again in Phase 2).
Replace call sites: `sync.ts:205` (`getActiveStableForDay`), `leaderboard/route.ts:81`,
`stable/route.ts:35`, `basho/bouts/route.ts:96`.

**Bug fix:** the bouts route copy currently omits the origin correction, so owner initials
can disagree with the leaderboard. Unifying fixes it — verify with a fixture test.

### 1d. Small flattenings
- `cron.ts`: one `runFullSync(label)` shared by the 19:30 and 20:00 jobs.
- Move `getActiveBasho`/`getActiveBashoId` from `db.ts` to `basho.ts`; `db.ts` keeps only
  connection + schema + migrations.
- Single `UserSession` type: middleware and `UserAuth.tsx` import from `lib/auth.ts`
  (client-safe subset in `types/index.ts` if needed).
- Shared `detectClashes` used by both `page.tsx` and `SubstitutionPanel.tsx`.

**Done when:** tests green, `grep -rn "toLowerCase().replace"` and
`grep -rn "old_rikishi" src/app` return only the new modules.

---

## Phase 2 — Data repair, delete the corruption hack

The stables-mutation bug is fixed (`substitution/route.ts:154` comment); the correction
logic only compensates for frozen historical data.

1. One-off repair in `migrateSchema` (db.ts), guarded by a `schema_version` table:
   ```sql
   -- for each (basho_id, user_id, tier) that has substitutions:
   UPDATE stables SET rikishi_id = (first sub's old_rikishi by created_at)
   WHERE (basho_id, user_id, tier) IN (...);
   ```
2. Delete the origin-correction loops from `stable.ts` (both functions).
3. Verify: scoring fixture unchanged; production leaderboard totals unchanged after deploy
   (compare API output before/after).

---

## Phase 3 — Slim the routes

Routes become: parse input → session check → one lib call → JSON. Raw SQL moves to lib.

- `src/lib/scoring.ts`: `calculateScores` (from sync.ts) + `getLeaderboard(db, bashoId, userIds)`.
  Replace the leaderboard route's N+1 (~500 statements/request) with set-based queries:
  one `GROUP BY user_id, day` over `daily_scores`, one wins-per-(wrestler, day) query,
  joined in JS via the `stableForDay` maps.
- `src/lib/substitution.ts` gains `applySubstitution(db, {userId, bashoId, tier, newRikishiId})`
  containing all validation now inline in the route. **Server computes `day` via
  `currentBashoDay` — stop trusting the client's `day` field** (currently lets a client
  bypass the 2/day limit).
- `src/lib/stable.ts` gains `savePicks(db, {userId, bashoId, picks})` with the tier/lock validation.
- `basho/bouts/route.ts`: move owner computation to lib; delete the cross-basho fallback
  self-join (`rc2.basho_id != br.basho_id`, lines 35-41) after confirming `syncDay`'s
  cross-division upsert makes it dead; move hardcoded `INITIALS` map into `config.json`
  per-user (`"initials": "MH"`) — becomes a users-table column in Phase 4.

**Done when:** no `db.prepare` calls remain under `src/app/api/`; leaderboard response
byte-identical to before (snapshot test).

---

## Phase 4 — Replace the identity layer (must complete before Aki, Sep 13)

This layer is rewritten, not refactored. Deletes the PIN flow entirely.

### Schema (new migration)
```sql
CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,          -- nanoid
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  initials      TEXT NOT NULL,             -- 2 chars, for bout-page owner tags
  password_hash TEXT NOT NULL,
  is_site_admin INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL
);
```
Migration script maps the 3 existing slug userIds (`matt`, `marc`, `mac`) to new account
rows (emails collected out-of-band, placed in a one-off mapping file) and rewrites
`user_id` in `stables`, `substitutions`, `daily_scores`. History survives. `users` table
and config-user-sync are dropped.

### Sessions
- Signed, `httpOnly: true` cookie: JWT via `jose` (HS256, `SESSION_SECRET` env var on Fly),
  payload `{ sub: accountId, exp }` only — name/admin looked up server-side.
- `getSessionFromRequest` verifies signature; middleware uses it (delete the hand-rolled
  JSON parsing at middleware.ts:20-34).
- New `GET /api/auth/me` returns `{ userId, name, admin }`; `useAuth` calls it instead of
  parsing `document.cookie`. `POST /api/auth/logout` clears the cookie server-side.

### Endpoints & UI
- `POST /api/auth/signup` (email, display name, initials, password ≥ 8) — gated by invite
  code from Phase 5; until then a `SIGNUPS_ENABLED=false` env flag.
- `POST /api/auth/login` (email + password, bcrypt — already a dep).
- Delete: PIN validation (`config.ts` validatePin/updateUserPin), `set-password` route,
  `admin/pin` route (replaced by email-based reset in Phase 6, or admin sets temp password),
  `migrationState` UI in `UserAuth.tsx`. Login form: name dropdown → email field.
- Spoofable inputs closed: routes take identity from the session, never from
  `?userId=` (stable GET, substitution GET, bouts `requestingUserId`).

### Config
`config.json` shrinks to app settings only (timezone, basho overrides). Update SPEC.md.

**Done when:** all three users logged in with email/password in production before Sep 13;
`config.json` contains no users; forged-cookie test (hand-crafted admin JSON) rejected.

---

## Phase 5 — Groups (after Aki, from Sep 28)

Groups are **leagues, not tenants**: a user has one stable per basho globally; a group is
a membership set that scores get ranked within. Scoring, sync, stables logic: unchanged.

### Schema
```sql
CREATE TABLE groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  invite_code   TEXT NOT NULL UNIQUE,      -- short, regenerable
  owner_id      TEXT NOT NULL REFERENCES accounts(id),
  created_at    TEXT NOT NULL
);
CREATE TABLE group_members (
  group_id  TEXT NOT NULL REFERENCES groups(id),
  user_id   TEXT NOT NULL REFERENCES accounts(id),
  role      TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
  joined_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
```
Seed migration: create group "Rikishi Rumble OG" containing the three existing accounts.

### API changes
- `GET /api/leaderboard?group=<id>` — same query, membership-filtered
  (`user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)`). Ditto
  `champions` and bout-page owner tags. 403 unless requester is a member.
- New routes: `POST /api/groups` (create, becomes owner), `POST /api/groups/join`
  (invite code), `GET /api/groups/mine`, `DELETE /api/groups/:id/members/:userId`
  (owner only), `POST /api/groups/:id/regenerate-code`.
- Signup accepts an invite code (deep link `/join/<code>`) and enables `SIGNUPS_ENABLED`.

### UI
- Group switcher in the header (persist last-selected in localStorage); leaderboard,
  champions, and bout owner-tags become group-scoped. Stable/subs pages unchanged
  (per-user, group-independent).
- New pages: create group, join via code, group settings (owner).
- `calculateScores`: iterate `SELECT DISTINCT user_id FROM stables WHERE basho_id = ?`
  instead of config users (small change, do it here).

**Done when:** two groups in production with disjoint leaderboards over shared bout data;
a brand-new account can sign up via invite link, pick a stable, and appear on day 1.

---

## Phase 6 — Operational hardening (before opening signups wide)

- **Backups:** Litestream sidecar in the Docker image replicating
  `/data/rikishi-rumble.db` to Tigris/S3. Test a restore. (Non-negotiable before strangers'
  data.)
- **Rate limiting** on `/api/auth/*` (in-memory bucket is fine, single node).
- **Password reset**: email-based via Resend, or interim owner-resets flow.
- **Error visibility**: Sentry (or Fly log alerts) on API 500s and cron failures.
- Remove `sync_log` unbounded growth: prune rows older than 2 bashos in the cron job.

---

## Explicitly out of scope
- ORM / Postgres migration — better-sqlite3 handles this scale; revisit only if multi-node.
- Multiple stables per user per basho (per-group stables) — rejected: multiplies core
  logic complexity for worse UX.
- Lower divisions, seasonal scoring — unchanged non-goals from SPEC.md.

## Rough size
| Phase | Est. diff | Risk |
|---|---|---|
| 0 tests | +600 test lines | none |
| 1 extract | ~400 moved, -150 net src | low (pinned by tests) |
| 2 repair | +40, -60 | medium (data migration — test on a copy of prod DB first) |
| 3 routes | ~500 moved | low |
| 4 identity | +500, -400 | high (auth cutover — do right after Nagoya-gap starts... i.e. early in gap, weeks of soak before Aki) |
| 5 groups | +700 | medium |
| 6 ops | +150 | low |
