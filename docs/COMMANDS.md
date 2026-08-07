# Commands reference

All commands are slash commands (registered via `deploy-commands.js`) and
defined in `src/commands/`.

## Player commands

### `/balance [user]`
Shows a coin balance embed with win/lose counts. Optional `user` maps to view
another member.

Source: `src/commands/balance.js`

### `/work`
Lets the player earn coins (random 500–2000, from `config.work`) once per
cooldown period (default 1 hour, `config.work.cooldownMs`). The last work time
is stored per user in the `users.last_work_at` column.

Source: `src/commands/work.js`

### `/bet <choice> <amount>`
Places a bet in the active Tài Xỉu session.
- `choice` — `📈 Tài` (`tai`) or `📉 Xỉu` (`xiu`).
- `amount` — positive integer of coins.

Validated that: a game channel is configured, the command runs in that channel,
a session is active, `amount > 0`, and the player can afford it. On a rejected
bet coins are automatically refunded.

Source: `src/commands/bet.js`

### `/jackpot`
Shows the current jackpot balance.

Source: `src/commands/jackpot.js`

## Admin commands

Permissions: requires the `Administrator` permission **or** membership in
`config.adminUsers`.

### `/taixiu setchannel <channel>`
Stores the Tài Xỉu channel for the guild (text channels only).

### `/taixiu start`
Begins the session loop in the configured channel. Errors if no channel is set
or a session is already running.

### `/taixiu stop`
Stops the current session for the guild.

### `/taixiu stats`
Embed with total rounds, Tai/Xiu breakdown (counts + %), and the last 10 results.

Source: `src/commands/taixiu.js`

### `/admin givecoin <user> <amount>`
Adds coins to a user and reports the new balance.

### `/admin resetjackpot`
Sets the guild jackpot balance back to 0.

Source: `src/commands/admin.js`