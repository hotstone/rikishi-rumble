# Rikishi Rumble - Specification

## Overview

**Rikishi Rumble** is a sumo wrestling tipping competition website where a small group of friends pick a "stable" of wrestlers at the start of each 15-day basho (tournament). When a wrestler in your stable wins a bout, you earn a point. The player with the most points at the end of the basho wins.

The app pulls real match data from the `sumo-api.com` public API, automatically calculates scores, and displays a live leaderboard. Users can make limited substitutions to their stable each evening. The visual theme is inspired by 80s Japanese 8-bit sports games, specifically the Kunio-kun / Nekketsu series.

The app is designed for a small, trusted group of 5-15 users defined in a config file. There is no full authentication system -- users select their name from a dropdown and enter a simple 4-digit PIN to make changes.

## Goals & Non-Goals

### Goals

- Allow users to select a stable of 5 wrestlers across defined rank tiers before each basho
- Automatically fetch match results from sumo-api.com and calculate scores
- Display a live leaderboard with daily rankings, total points, and wrestler names
- Support mid-basho wrestler substitutions (up to 2 per day within a defined window)
- Award bonus points for kimboshi (Maegashira beating a Yokozuna)
- Deliver a fun, retro 8-bit Kunio-kun visual experience

### Non-Goals

- Full user authentication / account creation system
- Multi-basho / seasonal cumulative scoring -- each basho is standalone
- Coverage of lower divisions (Juryo, Makushita, etc.) -- Makuuchi only
- Mobile app -- web-only, responsive design
- Real-time live-streaming integration or push notifications

## Users & Access

Users are defined in a JSON or YAML config file managed by an admin. Each user entry contains a display name, a 4-digit PIN, and an `admin` boolean flag. Admin users can trigger manual data syncs and manage basho settings. There is no registration flow -- users are added manually by the person running the app.

To interact with the site, a user selects their name from a dropdown and enters their PIN. The PIN is a lightweight guard against accidental changes -- it is not a security mechanism against determined attackers. PINs are stored in plaintext in the config file since the threat model is "trusted friends."

The config file also defines the timezone for the substitution window (AEST) and other app-level settings like the current basho identifier.

**Example config structure:**

```json
{
  "timezone": "Australia/Sydney",
  "basho": "202603",
  "users": [
    { "name": "Matt", "pin": "1234", "admin": true },
    { "name": "Sarah", "pin": "5678", "admin": false }
  ]
}
```

## Gameplay Rules

### Stable Composition

Each user selects exactly one wrestler from each of the following five rank tiers. These tiers are based on the official banzuke (ranking list) for the current basho:

| Tier | Ranks Included         | Picks |
|------|------------------------|-------|
| 1    | Yokozuna + Ozeki       | 1     |
| 2    | Komusubi + Sekiwake    | 1     |
| 3    | Maegashira 1-6         | 1     |
| 4    | Maegashira 7-12        | 1     |
| 5    | Maegashira 13-17+      | 1     |

### Scoring

- **Win:** Each bout won by a wrestler in your stable earns you **1 point**.
- **Kimboshi:** If a Maegashira-ranked wrestler in your stable defeats a Yokozuna, you earn **1 extra bonus point** (2 total for that bout: 1 win + 1 kimboshi). This uses the strict traditional definition -- only Maegashira beating a Yokozuna counts. Wins by **Fusen** (forfeit, where the Yokozuna did not compete) do **not** count as kimboshi.
- Points are cumulative across the 15-day basho. The player with the most points at the end wins. **Tiebreaker:** if two players are tied on points, the player with more kimboshi ranks higher.

### Substitutions

- Each day, a user may substitute up to **2 wrestlers** in their stable.
- The substitution window opens at **8:00 PM AEST** and closes at **6:00 PM AEST** the following day. This ensures swaps happen after the day's results are in and before the next day's bouts begin.
- A substituted wrestler must be replaced with another wrestler from the **same rank tier**.
- Points earned by a swapped-out wrestler are **retained**. The new wrestler earns points from the next day onward.

### Wrestler Withdrawal (Kyujo)

If a wrestler in your stable withdraws from the tournament (kyujo), their remaining bouts are recorded as losses (fusenpai). No special handling occurs -- the user can use their normal substitutions to swap the injured wrestler out. This adds a strategic element: do you burn a substitution on a withdrawn wrestler or keep your swaps for other tactical changes?

## API Integration & Data Sync

All tournament data is sourced from the public API at `https://www.sumo-api.com/api/`. The API is free, requires no authentication, and provides endpoints for wrestlers (rikishi), rankings (banzuke), and match results (torikumi). The API schema is documented at `https://www.sumo-api.com/api-guide`.

### Data Sync Strategy

- **Automated polling:** Two cron jobs run daily at **7:30 PM** and **8:00 PM AEST** to fetch the day's match results and update scores. The dual schedule provides redundancy -- the first run catches most results, the second picks up any stragglers or late updates.
- **Manual override:** An admin can trigger a manual data sync at any time via a button in the UI. This is useful if the API was temporarily down during the scheduled poll or if results need to be refreshed.
- **Caching:** Banzuke (ranking) data is fetched once at the start of each basho and cached locally. It does not change mid-tournament. Match results are cached after each daily sync.

### Kimboshi Detection

The API does not explicitly flag kimboshi. To detect them, the app compares the winner's rank from the cached banzuke against the loser's rank. A kimboshi is recorded when: (1) the winner holds a Maegashira rank, AND (2) the loser holds a Yokozuna rank, AND (3) the winning technique (kimarite) is not "Fusen" (forfeit). This check uses the banzuke as published at the start of the basho -- rank does not change mid-tournament.

### Error Handling

- If the API is unreachable during a scheduled poll, retry up to 3 times with exponential backoff. If all retries fail, log the error and mark the day's results as "pending" on the leaderboard.
- If match data appears incomplete (fewer bouts than expected), flag it for admin review rather than silently calculating partial scores.

## Technical Architecture

The app is built as a **Next.js (TypeScript)** full-stack application with **SQLite** for data persistence. It is self-hosted on the user's own server or VPS.

| Layer           | Technology                    | Rationale                                                              |
|-----------------|-------------------------------|------------------------------------------------------------------------|
| Frontend        | Next.js (React, TypeScript)   | Component-based UI, SSR for fast loads, single project with API routes |
| Backend / API   | Next.js API Routes            | Co-located with frontend, no separate server needed                    |
| Database        | SQLite (via better-sqlite3)   | Zero-config, file-based, perfect for small user base                   |
| Scheduling      | node-cron (in-process)        | Runs daily poll jobs. Simple, no external scheduler needed             |
| Hosting         | Fly.io                        | Simple container-based deploy, persistent volume for SQLite            |

### Key Architectural Decisions

- Single Next.js project for both frontend and backend -- simplifies deployment and development.
- SQLite chosen over PostgreSQL because the user base is small (5-15 people), writes are infrequent, and it eliminates the need for a database server.
- In-process cron via `node-cron` rather than system crontab, keeping all logic within the Node.js process for portability.

## Data Model

The SQLite database stores user stables, match results (cached from the API), and computed scores. The config file remains the source of truth for user identity and PINs.

```sql
-- Core tables

users (from config, mirrored at startup)
  id          TEXT PRIMARY KEY
  name        TEXT NOT NULL

basho
  id          TEXT PRIMARY KEY   -- e.g. "202603"
  start_date  TEXT
  status      TEXT               -- "upcoming", "active", "completed"

stables
  id          INTEGER PRIMARY KEY
  basho_id    TEXT REFERENCES basho(id)
  user_id     TEXT REFERENCES users(id)
  tier        INTEGER            -- 1-5
  rikishi_id  INTEGER
  selected_at TEXT               -- ISO timestamp
  UNIQUE(basho_id, user_id, tier)

substitutions
  id          INTEGER PRIMARY KEY
  basho_id    TEXT
  user_id     TEXT
  day         INTEGER            -- tournament day (1-15)
  old_rikishi INTEGER
  new_rikishi INTEGER
  tier        INTEGER
  created_at  TEXT

-- Cached API data

rikishi_cache
  id          INTEGER PRIMARY KEY
  name        TEXT
  rank        TEXT               -- e.g. "M3e", "Y1e", "O2w"
  basho_id    TEXT

bout_results
  id          INTEGER PRIMARY KEY
  basho_id    TEXT
  day         INTEGER
  winner_id   INTEGER
  loser_id    INTEGER
  kimarite    TEXT               -- winning technique
  is_kimboshi BOOLEAN DEFAULT 0

-- Computed scores

daily_scores
  basho_id    TEXT
  user_id     TEXT
  day         INTEGER
  points      INTEGER
  kimboshi    INTEGER
  PRIMARY KEY(basho_id, user_id, day)
```

## UI/UX & Visual Theme

The visual design is inspired by **Kunio-kun / Nekketsu** series games (River City Ransom, Nekketsu Soccer). This means: chibi-style character representations, bold pixel fonts, vibrant sports-game color palettes, and an energetic, competitive atmosphere.

### Key UI Elements

- **Leaderboard page (home):** Styled like a sports game scoreboard. Ranked table with user names, total points, today's points (with a ★ if kimboshi were scored today), and kimboshi total (shown as ★ stars). The leading player is highlighted with a visual flourish. Clicking a player expands a per-day power-up bar and wrestler breakdown; kimboshi wins are marked with ★ in the wrestler view. Tiebreaker is most kimboshi.
- **Stable selection page:** 5 tier rows, each showing available wrestlers as selectable pixel-art cards. Wrestlers displayed with name and rank. Drag-and-drop or click to select.
- **Substitution page:** Shows current stable with swap buttons. Countdown timer for the substitution window. Disabled outside the allowed hours.
- **Rules tab:** Visible to all users including before login. Bulleted list covering stable tiers, scoring, kimboshi, substitution rules, and tiebreaker.
- **SUBS tab clash indicator:** An `!` badge appears on the SUBS tab when two wrestlers in your stable are scheduled to face each other the following day.
- **User selector:** Dropdown with user names + PIN input field. No separate login page -- integrated into the header/nav bar.

### Design Direction

- Pixel art fonts (e.g., Press Start 2P or similar retro font)
- NES/Famicom-era color palette: limited, high-contrast colors
- Chunky borders, tile-based layouts, and subtle scanline or CRT effects (optional, togglable)
- Simple sprite-style icons for wins, losses, kimboshi, and kyujo

## Implementation Order

Components are ordered by dependency chain. Each step builds on the previous one.

1. **Project scaffolding:** Next.js + TypeScript setup, SQLite integration, config file loading, dev tooling.
2. **API client layer:** Wrapper for sumo-api.com endpoints (rikishi, banzuke, torikumi). Response types, error handling, caching logic.
3. **Data model & migrations:** SQLite schema creation, seed scripts, rikishi cache population from API.
4. **User config & PIN auth:** Config file parser, user dropdown + PIN validation API route.
5. **Stable selection:** UI for picking wrestlers per tier, API routes for saving/loading stables, tier validation.
6. **Score calculation engine:** Match result processing, kimboshi detection, daily score aggregation.
7. **Automated data sync:** node-cron scheduled polling (7:30 PM + 8:00 PM AEST), manual sync admin endpoint, retry logic.
8. **Leaderboard:** Ranked scoreboard page, today's points, total points, wrestler names per user.
9. **Substitution system:** Substitution UI, time window enforcement (AEST), 2-per-day limit, same-tier validation.
10. **Visual theme & polish:** Kunio-kun pixel art styling, retro fonts, color palette, animations, responsive design.

## Decisions Log

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | User scope | Small trusted group (5-15) | No need for full auth; config-file based users with dropdown selection |
| 2 | Rank tier overlap | M7-12 / M13-17+ (clean split) | Fixed the M12 overlap from original requirements |
| 3 | Substitution points | Keep accumulated points | Simplest and most intuitive; no penalty for swapping |
| 4 | Timezone | AEST (Australia/Sydney) | User group is Australian; matches finish ~8pm AEST |
| 5 | Kimboshi definition | Strict: Maegashira beats Yokozuna, excluding Fusen wins | Traditional definition; Fusen excluded because the Yokozuna didn't compete |
| 6 | Competition scope | Single basho at a time | Clean reset each tournament; no seasonal tracking |
| 7 | Data sync strategy | Hybrid: auto-poll + manual override | Daily cron at 7:30 PM + 8:00 PM AEST, plus admin button for ad-hoc syncs |
| 8 | Kyujo handling | Treat as normal losses | No special handling; user can use substitutions strategically |
| 9 | Tech stack | Next.js + TypeScript + SQLite | Single project, lightweight, perfect for self-hosted small group app |
| 10 | User guard | Simple 4-digit PIN per user | Prevents accidental changes; not meant as real security |
| 11 | Admin role | Boolean flag in config per user | Admins can trigger manual syncs and manage basho settings |
| 12 | Substitution window | 8:00 PM - 6:00 PM AEST | Opens after results are in, closes before next day's bouts |
| 13 | Tiebreaker | Most kimboshi wins ties | Adds a secondary incentive for high-risk tier 1 picks |
| 14 | Hosting | Fly.io | Container-based deploy with persistent volume for SQLite; simpler than managing a VPS |

## Implementation Checklist

### Phase 1: Foundation
- [ ] Initialize Next.js project with TypeScript
- [ ] Set up SQLite (better-sqlite3 or Drizzle ORM)
- [ ] Create config file schema and loader (`config.json`)
- [ ] Set up project structure (pages, api routes, lib, types)

### Phase 2: API Client & Data Layer
- [ ] Build sumo-api.com client wrapper with TypeScript types
- [ ] Implement banzuke (rankings) endpoint integration
- [ ] Implement torikumi (match results) endpoint integration
- [ ] Implement rikishi (wrestler) endpoint integration
- [ ] Add response caching and error handling (retries, exponential backoff)

### Phase 3: Database & Schema
- [ ] Create SQLite schema (users, basho, stables, substitutions, rikishi_cache, bout_results, daily_scores)
- [ ] Build migration scripts
- [ ] Sync users from config file to database on startup
- [ ] Build rikishi cache population from API (banzuke fetch)

### Phase 4: User System
- [ ] Config file parser with admin flag support
- [ ] User dropdown selector component
- [ ] PIN validation API route
- [ ] Session/state management (client-side, cookie or localStorage)

### Phase 5: Stable Selection
- [ ] API route: GET available wrestlers per tier (from cached banzuke)
- [ ] API route: POST/PUT save stable selections
- [ ] API route: GET current stable for a user
- [ ] Stable selection UI -- tier rows with wrestler cards
- [ ] Tier validation (one pick per tier, correct rank boundaries)

### Phase 6: Scoring Engine
- [ ] Match result processing -- determine winners from torikumi data
- [ ] Kimboshi detection (Maegashira winner + Yokozuna loser from banzuke)
- [ ] Daily score calculation per user (iterate stable, count wins + kimboshi)
- [ ] Score aggregation (total points across all days)
- [ ] Handle substitutions in scoring (wrestler earns points only for days active)

### Phase 7: Data Sync & Cron
- [ ] Implement node-cron jobs (7:30 PM + 8:00 PM AEST)
- [ ] Fetch daily results, update bout_results table
- [ ] Recalculate daily_scores after each sync
- [ ] Mark incomplete data as "pending" for admin review
- [ ] Admin-only manual sync API route + UI button

### Phase 8: Leaderboard
- [ ] API route: GET leaderboard (ranked users with points breakdown)
- [ ] Leaderboard page -- ranked table with user name, total points, today's points, wrestler names
- [ ] Highlight leading player
- [ ] Show "pending" indicator when results haven't synced yet

### Phase 9: Substitution System
- [ ] API route: POST substitution (validate tier, window, daily limit)
- [ ] Time window enforcement (8:00 PM - 2:00 PM AEST)
- [ ] 2-per-day limit enforcement
- [ ] Substitution UI -- current stable with swap buttons
- [ ] Countdown timer for substitution window
- [ ] Substitution history log

### Phase 10: Visual Theme & Polish
- [ ] Integrate pixel art font (Press Start 2P or similar)
- [ ] Apply Kunio-kun / Nekketsu color palette and styling
- [ ] Chunky borders, tile-based card layouts
- [ ] Sprite-style icons for wins, losses, kimboshi, kyujo
- [ ] Optional scanline/CRT effect (togglable)
- [ ] Responsive design for mobile browsers
- [ ] Final UI polish and playtesting
