const { Database } = require('@sqlitecloud/drivers');
const config = require('../config');

let db = null;

async function connectDb() {
  if (!db) {
    db = new Database(config.sqliteUri);

    await db.sql(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT UNIQUE NOT NULL,
        coin INTEGER DEFAULT 10000,
        win_count INTEGER DEFAULT 0,
        lose_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    const cols = await db.sql("PRAGMA table_info(users)");
    const hasLastWork = cols.some(c => c.name === 'last_work_at');
    if (!hasLastWork) {
      await db.sql('ALTER TABLE users ADD COLUMN last_work_at DATETIME');
    }

    console.log('✅ Connected to SQLite Cloud');
  }
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connectDb() first.');
  return db;
}

async function closeDb() {
  if (db) {
    await db.close();
    db = null;
    console.log('🛑 SQLite Cloud connection closed');
  }
}

module.exports = { connectDb, getDb, closeDb };
