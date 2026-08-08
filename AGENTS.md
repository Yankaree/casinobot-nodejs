# AGENTS.md

## Quick start

```bash
npm install
cp .env.example .env   # fill in DISCORD_TOKEN, CLIENT_ID, SQLITECLOUD_URI
node deploy-commands.js # register slash commands (must re-run after adding/changing commands)
npm start               # runs bot
```

## Commands after code changes

- **No lint, typecheck, or test suite exists.** Verify by running `node src/index.js` and checking the bot starts.
- After editing any file in `src/commands/` (adding/renaming/removing commands or subcommands), run `node deploy-commands.js` to register changes with Discord.

## Language

All user-facing strings (embed text, error messages, embed titles) are in **Vietnamese**. Keep them consistent.

## Architecture

Multi-guild Discord bot. Game state lives in-memory (`activeSessions` Map in `src/commands/taixiu.js`), keyed by guildId. Jackpot is per-guild in the database. User balances are per-guild (same user, different coins on each server). A bot restart clears all active game sessions.

- **Entry**: `src/index.js` → loads commands, boots DB, starts HTTP keepalive server
- **Config**: `src/config.js` — all game params, admin IDs, colors
- **Commands**: `src/commands/*.js` — each exports `{ data: SlashCommandBuilder, execute(interaction) }`
- **Game engine**: `src/games/taixiu/` — `session.js` (round lifecycle), `engine.js` (dice logic), `reward.js` (settlement), `stats.js` (embeds)
- **Database**: `src/database/database.js` (SQLite Cloud connection + keepalive) + `models.js` (ORM layer)
- **Utils**: `src/utils/formatter.js` (display helpers), `discordLogHook.js` (console → webhook)

## Key files to read first

- `src/games/taixiu/session.js` — GameSession class: the core round loop (start → countdown → end → restart)
- `src/commands/taixiu.js` — `activeSessions` Map, admin commands (start/stop/setchannel), game channel registry
- `src/commands/bet.js` — player bet flow, validates against session state
- `src/config.js` — all tunable game parameters

## Gotchas

- **SQLite Cloud, not local SQLite.** The `database.js` file has keepalive + reconnect logic. Queries go through `queryWithRetry()`.
- **`activeSessions.delete(guildId)`** in `/taixiu stop` removes the session object entirely — there's no resume. A `/taixiu start` creates a brand new session.
- **Auto-pause**: after `config.game.maxEmptyRounds` (default 3) consecutive rounds with zero bets, the game pauses automatically. Anyone can run `/taixiu tieptuc` to resume (not admin-only).
- **One bet per user per round** — enforced by `this.bettors.has(userId)` in `GameSession.addBet()`.
- **Bet amounts deducted immediately** on placement. If a round is paused mid-countdown, deducted coins are tracked in `this.bets` / `this.bettors` and are NOT automatically refunded.
- **Deploy-commands.js uses global commands** (`Routes.applicationCommands`), not guild-scoped. Commands appear in all guilds the bot is in.
- **HTTP server on port 3000** (`src/server.js`) — keeps the bot alive on hosting platforms. `GET /ping` → `pong`.
