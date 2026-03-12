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
- `src/lib/db.ts` — SQLite init, schema, user sync from config
- `src/lib/sumo-api.ts` — API client for sumo-api.com (banzuke, torikumi)
- `src/lib/sync.ts` — data sync and score calculation (scores recalculated fully on every sync)
- `src/lib/substitution.ts` — substitution window logic (8PM–2PM AEST)
- `src/lib/cron.ts` — scheduled sync at 7:30PM + 8:00PM AEST
- `src/app/api/` — API routes: auth, wrestlers, stable, leaderboard, substitution, sync, basho
- `src/components/` — UserAuth, Leaderboard, StableSelector, SubstitutionPanel, AdminPanel, BashoPage

## Key rules & conventions
- **Rank format:** sumo-api.com returns full text ("Yokozuna 1 East"); we store short format ("Y1e") via `shortRank()`
- **Tiers:** 5 tiers — Y+O (1), K+S (2), M1-6 (3), M7-12 (4), M13+ (5)
- **Kimboshi:** +1 bonus when Maegashira beats Yokozuna (2 points total for that bout)
- **Substitutions:** 2/day max, same tier only, window 8PM–2PM AEST
- **Scoring:** recalculated from scratch on every sync — no incremental updates
- **Torikumi response:** wraps matches in `data.torikumi` array

## Visual theme
Retro 8-bit, inspired by Kunio-kun / Nekketsu series. Press Start 2P font. Tailwind classes use `retro-` prefix (e.g. `retro-panel`, `retro-btn`, `text-retro-yellow`, `text-retro-cyan`, `text-retro-red`, `text-retro-green`).

## Auth model
Users pick their name from a dropdown and enter a 4-digit PIN. No real auth — this is for a small trusted group. PINs stored plaintext in `config.json`.
