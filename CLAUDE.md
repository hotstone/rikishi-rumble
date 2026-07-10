# Rikishi Rumble - Claude Instructions

## Dev server
```bash
npm run dev -- --port 3001
```
Port 3000 is occupied on this machine — always use 3001.

## Tech stack
- Next.js 16 + TypeScript + Tailwind CSS 4
- SQLite via better-sqlite3 (no ORM)
- node-cron for scheduled sync jobs
- Deployed via Fly.io (`fly deploy`)

## Project structure
- `config.json` — user definitions (name, PIN, admin flag), basho ID, timezone
- `src/lib/config.ts` — config loader, PIN validation
- `src/lib/db.ts` — SQLite connection, schema, migrations, user sync from config
- `src/lib/active-basho.ts` — active-basho detection (server-only, uses DB)
- `src/lib/basho.ts` — basho calendar math (pure, client-safe)
- `src/lib/time.ts` — JST date/hour helpers (the ONLY place timezone math lives)
- `src/lib/stable.ts` — stable reconstruction (`stableForDay`, `currentStable`) — the single source of truth for "whose stable was what on day N"
- `src/lib/users.ts` — `userIdFromName` slug (pure, client-safe)
- `src/lib/session.ts` — session cookie helpers (no bcrypt; safe for middleware)
- `src/lib/auth.ts` — bcrypt hash/verify only
- `src/lib/clash.ts` — stablemate clash detection (pure, client-safe)
- `src/lib/sumo-api.ts` — API client for sumo-api.com (banzuke, torikumi) + rank parsing
- `src/lib/sync.ts` — data sync and score calculation (scores recalculated fully on every sync)
- `src/lib/substitution.ts` — substitution window logic (18:00–16:00 JST nightly windows)
- `src/lib/cron.ts` — scheduled sync jobs (JST-timed)
- `src/lib/__tests__/` — vitest suite; `npm test` (CI runs it before deploy)
- `src/app/api/` — API routes: auth, wrestlers, stable, leaderboard, substitution, sync, basho
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
Users pick their name from a dropdown and enter a 4-digit PIN. No real auth — this is for a small trusted group. PINs stored plaintext in `config.json`.
