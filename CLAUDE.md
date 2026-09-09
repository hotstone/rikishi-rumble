# Rikishi Rumble - Claude Instructions

## Dev server
```bash
nvm use 20   # REQUIRED: better-sqlite3 won't compile on Node 26 (V8 API removed)
npm run dev -- --port 3001
```
Port 3000 is occupied on this machine — always use 3001.

## Tech stack
- Next.js 16 + TypeScript + Tailwind CSS 4
- SQLite via better-sqlite3 (no ORM)
- node-cron for scheduled sync jobs
- Deployed via Fly.io (`fly deploy`)

## Project structure
- `config.json` — legacy user list (seeds `accounts` until Phase 4 cutover completes), timezone
- `src/lib/config.ts` — config loader
- `src/lib/db.ts` — SQLite connection, schema, migrations, user sync from config
- `src/lib/active-basho.ts` — active-basho detection (server-only, uses DB)
- `src/lib/basho.ts` — basho calendar math (pure, client-safe)
- `src/lib/time.ts` — JST date/hour helpers (the ONLY place timezone math lives)
- `src/lib/stable.ts` — stable reconstruction (`stableForDay`, `currentStable`) — the single source of truth for "whose stable was what on day N" — plus `savePicks` validation
- `src/lib/scoring.ts` — `calculateScores` + `getLeaderboard` (set-based, no N+1)
- `src/lib/bouts.ts` — bouts-by-day payload, owner initials (config `initials` field, first-letter fallback)
- `src/lib/wrestlers.ts`, `src/lib/champions.ts` — remaining read models
- `src/lib/records.ts` — cumulative per-rikishi win/loss records (`loadRecords`)
- `src/lib/users.ts` — `userIdFromName` slug (pure, client-safe)
- `src/lib/session.ts` — signed JWT session tokens via jose (edge-safe; SESSION_SECRET env)
- `src/lib/auth.ts` — bcrypt hash/verify, accounts-table helpers, getSessionUser
- `src/lib/clash.ts` — stablemate clash detection (pure, client-safe)
- `src/lib/sumo-api.ts` — API client for sumo-api.com (banzuke, torikumi) + rank parsing
- `src/lib/sync.ts` — data ingest from sumo-api (scores recalculated fully after every sync)
- `src/lib/substitution.ts` — window logic + substitution validation (`subWindowDay` derives the day server-side)
- `src/lib/cron.ts` — scheduled sync jobs (JST-timed)
- `src/lib/__tests__/` — vitest suite; `npm test` (CI runs it before deploy)
- `src/app/api/` — API routes: thin handlers only (parse → session check → one lib call → JSON); no SQL in routes
- `src/components/` — UserAuth, Leaderboard, StableSelector, SubstitutionPanel, AdminPanel, BashoPage

## Refactor plan
`docs/REFACTOR_PLAN.md` tracks the staged refactor + multi-group plan. Check the current phase before structural changes. No scoring/stables/auth changes during a live basho.

## Key rules & conventions
- **Rank format:** sumo-api.com returns full text ("Yokozuna 1 East"); we store short format ("Y1e") via `shortRank()`
- **Tiers:** 5 tiers — Y+O (1), K+S (2), M1-6 (3), M7-12 (4), M13+ (5)
- **Kimboshi:** awarded when Maegashira beats Yokozuna; not worth points, used as tiebreaker
- **Substitutions:** 2/day max, same tier only, window 6PM–4PM JST
- **Scoring:** recalculated from scratch on every sync — no incremental updates
- **Torikumi response:** wraps matches in `data.torikumi` array

## Visual theme
Retro 8-bit, inspired by Kunio-kun / Nekketsu series. Press Start 2P font. Tailwind classes use `retro-` prefix (e.g. `retro-panel`, `retro-btn`, `text-retro-yellow`, `text-retro-cyan`, `text-retro-red`, `text-retro-green`).

## Spec
Always update `SPEC.md` when making changes to rules, features, or architecture.

## Auth model
Email + password login (`<slug>@rikishi-rumble.com`) against the `accounts` table; bcrypt hashes, signed HS256 JWT session in an httpOnly cookie (`SESSION_SECRET` on Fly — app refuses to boot in prod without it). Signups gated behind `SIGNUPS_ENABLED` until Phase 5 invite codes. Deployed 2026-09-09. Legacy `users` table + config user list survive until the post-Aki cleanup commit.
