# Architecture

Tài Xỉu (Sic Bo) mini-game Discord bot written in Node.js using `discord.js` v14 and SQLite Cloud.

## Overview

```
┌────────────────────────────────────────────────────────────────┐
│                          index.js                              │
│   Entry point — bootstraps client, loads commands, DB, server  │
└────────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────────┐
          ▼               ▼                   ▼
   ┌────────────┐   ┌────────────┐    ┌─────────────┐
   │ commands/  │   │  database/ │    │   server.js │
   │ (5 files)  │   │ (models +  │    │ HTTP status │
   │            │   │ connection)│    │ page + /ping│
   └─────┬──────┘   └─────┬──────┘    └─────────────┘
         │                │
         │      ┌─────────▼──────────┐
         └─────▶│  games/taixiu/     │
                │ session · engine   │
                │ reward · stats     │
                └────────────────────┘
```

## Start sequence (`src/index.js`)

1. `dotenv` loads environment variables.
2. A `discord.js` `Client` is created with `Guilds` and `GuildMessages` intents.
3. All files in `src/commands/` exposing `data` and `execute` are registered in `client.commands`.
4. On `ready`, the bot logs in and reports guild count.
5. `interactionCreate` dispatches slash commands; errors are caught and replied to as ephemeral messages.
6. `connectDb()` initializes the SQLite Cloud connection and creates tables.
7. `createServer(client)` starts an HTTP status server (port `3000` by default).
8. `client.login(config.token)` connects to Discord.
9. On `SIGINT`, the DB connection is closed and the client is destroyed.

## Core flow

### Session lifecycle (`src/games/taixiu/session.js`)

`GameSession` extends `EventEmitter` and owns one game round per guild:

1. **Start** — creates a DB `sessions` row, posts an embed with a live countdown.
2. **Countdown** — a recursive `setTimeout` with 800–1200 ms jitter updates the
   embed each second until `timeLeft` reaches 0.
3. **End** — if nobody bet, a "no bets" embed is posted and the next session
   starts after 3 s. Otherwise:
   - posts a "rolling dice" embed and waits 2 s;
   - rolls the result via `rollResult()` (cryptographically secure 50/50);
   - persists the session outcome (`SessionModel.finish`);
   - settles all bets (`processRewards`);
   - posts the result embed with per-player win/loss lines;
   - starts the next session after 5 s.

Sessions emit an `ended` event after settling. `stop()` cancels the timer and
deactivates the session. `addBet()` guards against duplicate bets and accepts
one bet per user per round.

### Betting flow (`src/commands/bet.js`)

1. Validates a configured channel exists and the command runs in it.
2. Requires an active session for the guild.
3. Validates `amount > 0` and sufficient balance.
4. Deducts coins (`UserModel.removeCoins`).
5. Calls `session.addBet()`; if it fails (e.g. already bet), coins are refunded.
6. Confirms with an ephemeral reply.

### Settlement flow (`src/games/taixiu/reward.js`)

- **Losers** (bet choice ≠ result): their stake was already deducted at bet time,
  `lose_count` incremented, bet marked lost.
- **Winners**: payout = `amount × 2.5`, paid directly from the house (no jackpot
  pool). `win_count` incremented and the bet marked won.

## Design notes

- **Single-threaded state**: active sessions live in an in-memory `Map` in
  `src/commands/taixiu.js` (one `GameSession` per guild); restarting the bot
  clears running games.
- **SQLite Cloud** is the only persistence layer; all models in
  `src/database/models.js` are thin wrappers over raw `db.sql()` calls.
- **Deterministic rules** live in `src/config.js` (`sessionDuration`,
  `betMultiplier`, `startingCoins`).
