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

Multi-guild Discord bot. Game state lives in-memory (`activeSessions` Map in both `src/commands/taixiu.js` and `src/commands/baucua.js`), keyed by guildId. User balances are per-guild (same user, different coins on each server). A bot restart clears all active game sessions.

- **Entry**: `src/index.js` → loads commands, boots DB, starts HTTP keepalive server
- **Config**: `src/config.js` — all game params, admin IDs, colors
- **Commands**: `src/commands/*.js` — each exports `{ data: SlashCommandBuilder, execute(interaction) }`
- **Game engines**:
  - `src/games/taixiu/` — Tài Xỉu: `session.js`, `engine.js`, `reward.js`, `stats.js`
  - `src/games/taixiu/deathmatch/` — **Tài Xỉu Deathmatch**: nhánh độc lập mở rộng `GameSession` Tài Xỉu (`session.js` extends `../session`), RAM-only (Battle Coin, lobby, event, spectator, final round, ranking). `lobby.js`, `events.js`; lệnh `/txdeath`
  - `src/games/baucua/` — Bầu Cua: `session.js`, `engine.js`, `reward.js`, `stats.js`
  - `src/games/card_games/` — Card game framework: Tiến Lên Miền Nam / Tiến Lên / Sâm Lốc.
    - `engine/` — card, deck, hand, player, validator, comparator, turnManager (dùng chung, không hard-code luật)
    - `rules/` — registry + config luật từng game (whiteWin, chop, thoi...) trong `config.js`
    - `lobby/manager.js` — phòng & phiên lưu RAM (`cardSessions`), không lưu DB
    - `session.js` — CardSession: chia bài → báo Sâm → lượt chơi (timer 30s) → trả thưởng
    - `betting/` + `rewards/` — khóa cược bằng UserModel, trả thưởng + lưu `card_game_history`/`coin_transactions`
    - `ui/` — embed, buttons/select menu, DM bài riêng tư
    - `scripts/sim-card-games.js` — sim headless (chạy: `node scripts/sim-card-games.js`)
- **Database**: `src/database/database.js` (SQLite Cloud connection + keepalive) + `models.js` (ORM layer)
- **Utils**: `src/utils/formatter.js` (display helpers), `discordLogHook.js` (console → webhook)

## Database Schema

SQLite Cloud. All tables created in `database.js` on startup.

```
SHARED
├── users            (id, guild_id, discord_id, coin DEFAULT 10000, win_count, lose_count, last_work_at, created_at)
│                    UNIQUE(guild_id, discord_id)
├── config           (guild_id PK, taixiu_channel_id, baucua_channel_id)
└── loans            (id, guild_id, discord_id, amount, rate, debt, status 'active'|'repaid', created_at, updated_at)
                     — vay tiền với lãi: debt = amount × (1 + rate)

TAI XIU
├── taixiu_sessions  (id PK, guild_id, dice1, dice2, dice3, result, total_bet, created_at)
└── taixiu_bets      (id PK, session_id FK→taixiu_sessions, user_id FK→users,
                    choice CHECK('tai'|'xiu'), amount, won, payout, created_at)

BAU CUA
├── baucua_sessions  (id PK, guild_id, result_1, result_2, result_3, total_bet, created_at)
└── baucua_bets      (id PK, session_id FK→baucua_sessions, user_id FK→users,
                    animal, amount, won, payout, created_at)
```

### Default values

- `users.coin`: 10,000
- `config`: null channels

## Key files to read first

- `src/games/taixiu/session.js` — GameSession class: the core round loop (start → countdown → end → restart)
- `src/commands/taixiu.js` — `activeSessions` Map, admin commands (start/stop/setchannel), game channel registry
- `src/commands/bet.js` — player bet flow, validates against session state
- `src/commands/baucua.js` — Bầu Cua game management, `/baucua bet` handler
- `src/games/baucua/session.js` — Bầu Cua round lifecycle (similar to Tài Xỉu but with multi-bet and buttons)
- `src/config.js` — all tunable game parameters

## Gotchas

- **SQLite Cloud, not local SQLite.** The `database.js` file has keepalive + reconnect logic. Queries go through `queryWithRetry()`.
- **`activeSessions.delete(guildId)`** in `/taixiu stop` removes the session object entirely — there's no resume. A `/taixiu start` creates a brand new session.
- **Auto-pause**: after `config.game.maxEmptyRounds` (default 3) consecutive rounds with zero bets, the game pauses automatically. Anyone can run `/taixiu tieptuc` to resume (not admin-only).
- **One bet per user per round** — enforced by `this.bettors.has(userId)` in `GameSession.addBet()`.
- **Bet amounts deducted immediately** on placement. If a round is paused mid-countdown, deducted coins are tracked in `this.bets` / `this.bettors` and are NOT automatically refunded.
- **Deploy-commands.js uses global commands** (`Routes.applicationCommands`), not guild-scoped. Commands appear in all guilds the bot is in.
- **Card games**: one lobby per channel (`/card create <game> [bet]`), host starts; bài mỗi người chỉ gửi qua DM (không bao giờ đăng lên channel). Interaction customId prefix `card:` được route trong `src/index.js`. Mọi nước đánh validate ở server (validator.js) — client chỉ gửi id lá bài. Hết giờ (30s) tự bỏ lượt / tự đánh lá nhỏ nhất nếu đang dẫn đầu. Restart bot → mất phòng đang mở.
- **HTTP server on port 3000** (`src/server.js`) — keeps the bot alive on hosting platforms. `GET /ping` → `pong`.
- **Tài Xỉu Deathmatch** (`/txdeath`): lobby + trận đều RAM (`lobbies`/`matches`/`lastResults` Map trong `src/commands/txdeath.js`), không lưu DB. Battle Coin chỉ tồn tại trong trận. `DeathmatchSession` extends `GameSession` Tài Xỉu và override các method DB-coupled (start/addBet/end); dùng chung `rollResult` (key `dm:<guildId>`), `betConfirm`, formatter. Tất cả ACTIVE đã cược → lật kết quả **ngay** (bỏ qua rolling, `_instantEnd`); hết timer round → chốt; hết timer trận → FINAL_ROUND; ranking khi trận kết thúc. `/txdeath setcoin <amount> [@player]` tự chỉnh Battle Coin (chủ phòng/admin chỉnh được người khác) — `< minBattleCoin` → SPECTATOR, `>=` → ACTIVE. Button/modal customId prefix `txdeath_` và `confirm:dm:` route trong `src/index.js`.
