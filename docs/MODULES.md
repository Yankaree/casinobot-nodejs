# Modules

## Entry & infrastructure

### `index.js` → `src/index.js`
Entry point. Creates the Discord client, loads slash commands from
`src/commands/`, connects to the database, starts the HTTP status server, and
logs in. Handles graceful shutdown on `SIGINT`.

### `src/server.js`
Creates a plain `http.Server` that returns:
- `GET /ping` → `pong` (for uptime monitors);
- any other path → an HTML status page showing bot status, guild count, bot tag,
  uptime, and a keep-alive hint.

Exports: `createServer(client)`.

### `src/config.js`
Centralized configuration loaded from environment plus hard-coded game rules:

- `token`, `clientId`, `guildId`, `sqliteUri` — from `.env`.
- `game.sessionDuration` — seconds per round (50).
- `game.betMultiplier` — normal win payout factor (1.2).
- `game.jackpotMultiplier` — jackpot payout factor (1.4).
- `game.jackpotChance2` / `jackpotChance` — triple values that trigger jackpot (1-1-1, 6-6-6).
- `game.jackpotPercent` — fraction of losing stakes added to the jackpot (5%).
- `game.startingCoins` — new-user balance (10000).
- `adminUsers` — array of Discord user IDs with admin privileges.
- `colors` — embed colours used across the bot.

### `deploy-commands.js`
Standalone script. Reads `.env`, scans `src/commands/`, serialises every
command's `data` to JSON, and bulk-registers them as guild commands via the
Discord REST API. Requires `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`.

### `src/utils/formatter.js`
Pure formatting helpers:
- `formatCoins(n)` — locale number formatting (`vi-VN`).
- `formatDice(d1,d2,d3)` — unicode dice glyphs.
- `formatProgressBar(current,total,len=10)` — `█░` bar.
- `formatTime(seconds)` — Vietnamese duration string.
- `getResultEmoji(result)` / `getResultText(result)` — map `'tai'`/`'xiu'`.

## Database: `src/database/`

### `src/database/database.js`
Creates the singleton SQLite Cloud `Database`, runs the DDL for all tables
(`users`, `sessions`, `bets`, `config`), and exposes `connectDb()`, `getDb()`,
`closeDb()`.

### `src/database/models.js`
Model objects wrapping SQL:

- **`UserModel`** — `getOrCreate(discordId)`, `getBalance`, `addCoins`,
  `removeCoins`, `addWin`, `addLose`, `setCoins`.
- **`SessionModel`** — `create(guildId)`, `finish(...)`, `getById`,
  `getRecent(guildId, limit)`, `getStats(guildId)`, `getTotalBets(sessionId)`.
- **`BetModel`** — `create(sessionId,userId,choice,amount)`,
  `updateResult(...)`, `getSessionBets(sessionId)`, `getUserStats(discordId)`.
- **`ConfigModel`** — `get(guildId)`, `setChannel`, `getChannel`,
  `getJackpot`, `addJackpot`, `resetJackpot`.

## Game: `src/games/taixiu/`

### `src/games/taixiu/session.js`
`class GameSession extends EventEmitter`. Orchestrates one round:

- Constructor takes `guildId`, `channelId`; keeps `sessionId`, `isActive`,
  `timeLeft`, timers, the live message, per-side bets (`bets.tai/xiu`), and a
  `Map` of bettors.
- `start(client)` — begins a round, sends/updates the countdown embed.
- `createEmbed()` — live bet embed with progress bars.
- `createResultEmbed(...)` — result embed with dice, total, outcome, jackpot
  banner, and winner/loser lists.
- `addBet(userId, choice, amount)` — registers a bet (guards duplicates).
- `end(client)` — settles the round and schedules the next one.
- `stop()` — halts the round.

### `src/games/taixiu/engine.js`
Game rules, using Node `crypto` for secure randomness:
- `rollDice()` → `{ d1, d2, d3 }` (3–18 total, shuffled).
- `calculateResult(d1,d2,d3)` → `'xiu'` (4–10) | `'tai'` (11–17) | `null`.
- `isJackpot(d1,d2,d3)` → true on triple 1s or triple 6s.
- `getDiceTotal(d1,d2,d3)` → sum.

### `src/games/taixiu/reward.js`
`processRewards(guildId, sessionId, result, jackpotBets, bets)`:
settles losers/winners, transfers to/from the jackpot pool, updates user
`win`/`lose` counters and bet records.

###  `src/games/taixiu/stats.js`
- `getStatsEmbed(guildId)` — totals, Tai/Xiu percentages, recent-10 results.
- `getJackpotEmbed(guildId)` — current jackpot balance.

## Commands: `src/commands/`

- `taixiu.js` — guild admin: `setchannel`, `start`, `stop`, `stats`. Holds the
  `activeSessions` map (one `GameSession` per guild) exposed via
  `getActiveSession(guildId)`.
- `bet.js` — `bet` command: choice (`tai`/`xiu`) + integer amount.
- `balance.js` — `balance` command: shows coin, win, lose counts (optional user).
- `jackpot.js` — `jackpot` command: shows current jackpot.
- `admin.js` — `admin` command: `givecoin`, `resetjackpot`.