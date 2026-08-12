const { Database } = require('@sqlitecloud/drivers');
const config = require('../config');

let db = null;
let keepaliveInterval = null;
let isReconnecting = false;

const KEEPALIVE_INTERVAL_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2_000;
const SQL_TIMEOUT_MS = 10_000;

const DEFAULT_JACKPOT = 10_000_000_000;
const DEFAULT_COIN = 100;

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    discord_id TEXT NOT NULL,
    coin INTEGER DEFAULT ${DEFAULT_COIN},
    win_count INTEGER DEFAULT 0,
    lose_count INTEGER DEFAULT 0,
    last_work_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, discord_id)
  )`,
  `CREATE TABLE IF NOT EXISTS config (
    guild_id TEXT PRIMARY KEY,
    taixiu_channel_id TEXT,
    baucua_channel_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS jackpots (
    guild_id TEXT NOT NULL,
    game_name TEXT NOT NULL,
    balance INTEGER DEFAULT ${DEFAULT_JACKPOT},
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, game_name)
  )`,
  `CREATE TABLE IF NOT EXISTS taixiu_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    dice1 INTEGER,
    dice2 INTEGER,
    dice3 INTEGER,
    result TEXT,
    total_bet INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS taixiu_bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    choice TEXT NOT NULL CHECK(choice IN ('tai', 'xiu')),
    amount INTEGER NOT NULL,
    won INTEGER DEFAULT 0,
    payout INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES taixiu_sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS baucua_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    result_1 TEXT,
    result_2 TEXT,
    result_3 TEXT,
    total_bet INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS baucua_bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    animal TEXT NOT NULL,
    amount INTEGER NOT NULL,
    won INTEGER DEFAULT 0,
    payout INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES baucua_sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS global_taixiu_channels (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, channel_id)
  )`,
  `CREATE TABLE IF NOT EXISTS global_taixiu_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dice1 INTEGER,
    dice2 INTEGER,
    dice3 INTEGER,
    result TEXT,
    total_bet INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS global_taixiu_bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    choice TEXT NOT NULL CHECK(choice IN ('tai', 'xiu')),
    amount INTEGER NOT NULL,
    won INTEGER DEFAULT 0,
    payout INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES global_taixiu_sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS werewolf_lobbies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    lobby_id TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'lobby',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS werewolf_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    winner TEXT NOT NULL,
    player_count INTEGER DEFAULT 0,
    days INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS coin_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('win', 'lose', 'reward', 'bonus', 'jackpot')),
    game TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_coin_transactions_guild ON coin_transactions (guild_id)`,
  `CREATE INDEX IF NOT EXISTS idx_coin_transactions_discord ON coin_transactions (discord_id)`,
];

function sqlWithTimeout(connection, sql, params) {
  return Promise.race([
    params ? connection.sql(sql, params) : connection.sql(sql),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SQL query timed out')), SQL_TIMEOUT_MS)
    ),
  ]);
}

async function connectDb() {
  if (db) {
    try {
      await sqlWithTimeout(db, 'SELECT 1');
      return db;
    } catch {
      db = null;
    }
  }

  const connection = new Database(config.sqliteUri);

  await sqlWithTimeout(connection, 'SELECT 1');
  db = connection;

  for (const sql of SCHEMA_SQL) {
    await sqlWithTimeout(db, sql);
  }

  const guilds = await sqlWithTimeout(db, 'SELECT DISTINCT guild_id FROM users');
  for (const row of guilds) {
    await sqlWithTimeout(db,
      `INSERT OR IGNORE INTO jackpots (guild_id, game_name, balance) VALUES (?, 'taixiu', ${DEFAULT_JACKPOT})`,
      row.guild_id
    );
    await sqlWithTimeout(db,
      `INSERT OR IGNORE INTO jackpots (guild_id, game_name, balance) VALUES (?, 'baucua', ${DEFAULT_JACKPOT})`,
      row.guild_id
    );
  }

  console.log('✅ Connected to SQLite Cloud');
  startKeepalive();
  return db;
}

function startKeepalive() {
  stopKeepalive();
  keepaliveInterval = setInterval(async () => {
    if (!db || isReconnecting) return;
    try {
      await sqlWithTimeout(db, 'SELECT 1');
    } catch (err) {
      console.warn('[Keepalive] Connection lost, attempting reconnect...');
      await reconnectDb();
    }
  }, KEEPALIVE_INTERVAL_MS);
}

function stopKeepalive() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

async function reconnectDb() {
  if (isReconnecting) return db;
  isReconnecting = true;

  for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    try {
      if (db) {
        try { await db.close(); } catch {}
        db = null;
      }
      db = new Database(config.sqliteUri);
      await sqlWithTimeout(db, 'SELECT 1');
      console.log(`✅ Reconnected to SQLite Cloud (attempt ${attempt})`);
      isReconnecting = false;
      return db;
    } catch (err) {
      console.warn(`[Reconnect] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS * attempt));
      }
    }
  }

  isReconnecting = false;
  console.error('[Reconnect] Failed after max attempts');
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connectDb() first.');
  return db;
}

async function queryWithRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (
      err.errorCode === 'ERR_CONNECTION_ENDED' ||
      err.errorCode === 'ERR_CONNECTION_NOT_ESTABLISHED' ||
      (err.message && err.message.includes('connection'))
    ) {
      console.warn(`[DB] Connection error (${err.errorCode}), reconnecting...`);
      await reconnectDb();
      return await fn();
    }
    throw err;
  }
}

async function closeDb() {
  stopKeepalive();
  if (db) {
    try { await db.close(); } catch {}
    db = null;
    console.log('🛑 SQLite Cloud connection closed');
  }
}

module.exports = { connectDb, getDb, closeDb, queryWithRetry, sqlWithTimeout };
