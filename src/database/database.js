const { Database } = require('@sqlitecloud/drivers');
const config = require('../config');

let db = null;
let keepaliveInterval = null;
let isReconnecting = false;

const KEEPALIVE_INTERVAL_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2_000;

async function connectDb() {
  if (db) {
    try {
      await db.sql('SELECT 1');
      return db;
    } catch {
      db = null;
    }
  }

  db = new Database(config.sqliteUri);

  await db.sql(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      discord_id TEXT NOT NULL,
      coin INTEGER DEFAULT 10000,
      win_count INTEGER DEFAULT 0,
      lose_count INTEGER DEFAULT 0,
      last_work_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, discord_id)
    )
  `);

  await db.sql(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      dice1 INTEGER,
      dice2 INTEGER,
      dice3 INTEGER,
      result TEXT,
      total_bet INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.sql(`
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      choice TEXT NOT NULL CHECK(choice IN ('tai', 'xiu')),
      amount INTEGER NOT NULL,
      won INTEGER DEFAULT 0,
      payout INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.sql(`
    CREATE TABLE IF NOT EXISTS config (
      guild_id TEXT PRIMARY KEY,
      taixiu_channel_id TEXT,
      jackpot_balance INTEGER DEFAULT 0
    )
  `);

  console.log('✅ Connected to SQLite Cloud');
  startKeepalive();
  return db;
}

function startKeepalive() {
  stopKeepalive();
  keepaliveInterval = setInterval(async () => {
    if (!db || isReconnecting) return;
    try {
      await db.sql('SELECT 1');
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
      await db.sql('SELECT 1');
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

module.exports = { connectDb, getDb, closeDb, queryWithRetry };
