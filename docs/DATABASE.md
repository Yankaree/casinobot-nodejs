# Database

SQLite Cloud database (`SQLITECLOUD_URI` in `.env`), accessed through the
singleton connection in `src/database/database.js`. Schema is created at
startup with `CREATE TABLE IF NOT EXISTS`.

## Schema

### `users`

| Column        | Type     | Notes                                    |
|---------------|----------|------------------------------------------|
| `id`          | INTEGER  | PK, autoincrement                        |
| `discord_id`  | TEXT     | UNIQUE, NOT NULL — Discord user id       |
| `coin`        | INTEGER  | Balance, default `10000`                 |
| `win_count`   | INTEGER  | Wins, default `0`                        |
| `lose_count`  | INTEGER  | Losses, default `0`                      |
| `created_at`  | DATETIME | Default `CURRENT_TIMESTAMP`              |

### `sessions`

| Column       | Type     | Notes                              |
|--------------|----------|------------------------------------|
| `id`         | INTEGER  | PK, autoincrement                  |
| `guild_id`   | TEXT     | NOT NULL                          |
| `dice1`      | INTEGER  | Rolled value, set on finish        |
| `dice2`      | INTEGER  | Rolled value, set on finish        |
| `dice3`      | INTEGER  | Rolled value, set on finish        |
| `result`     | TEXT     | `'tai'` / `'xiu'`, set on finish   |
| `total_bet`  | INTEGER  | Sum of bets, default `0`           |
| `timestamp`  | DATETIME | Default `CURRENT_TIMESTAMP`        |

### `bets`

| Column       | Type     | Notes                                     |
|--------------|----------|-------------------------------------------|
| `id`         | INTEGER  | PK, autoincrement                         |
| `session_id` | INTEGER  | NOT NULL, FK → `sessions.id`              |
| `user_id`    | INTEGER  | NOT NULL, FK → `users.id`                 |
| `choice`     | TEXT     | NOT NULL, `CHECK(choice IN ('tai','xiu'))`|
| `amount`     | INTEGER  | NOT NULL                                  |
| `won`        | INTEGER  | `0`/`1`, set on settle                    |
| `payout`     | INTEGER  | Coins paid, set on settle                 |
| `created_at` | DATETIME | Default `CURRENT_TIMESTAMP`               |

### `config`

| Column              | Type    | Notes                        |
|---------------------|---------|------------------------------|
| `guild_id`          | TEXT    | PK                           |
| `taixiu_channel_id` | TEXT    | Channel the game runs in     |
| `jackpot_balance`   | INTEGER | Pool, default `0`            |

## Data access (`src/database/models.js`)

All models call `getDb().sql(...)` directly; no ORM is used. Key operations:

- **Users**: rows are lazily created on first touch via `getOrCreate(discordId)`.
  Coin changes use `UPDATE ... coin = coin ± ?`.
- **Sessions**: `create()` returns `lastInsertRowid` for the active round;
  `finish()` writes dice/result/total once the round ends. `getStats()` counts
  totals per result; `getRecent()` lists finished rounds newest-first.
- **Bets**: rows created during the round, updated after settlement with
  `won` + `payout`. `getSessionBets()` joins `users` to expose `discord_id`.
- **Config**: per-guild row lazily created by `get()`; jackpot helpers
  increment/decrement `jackpot_balance`.

## Money flow

```
bet:    user.coin       - amount
lose:   jackpot_balance + amount            (full losing stake)
win:    jackpot_balance - payout            (payout = amount × 1.2, or × 1.4 on jackpot)
        user.coin       + payout            (capped at jackpot_balance)
```
