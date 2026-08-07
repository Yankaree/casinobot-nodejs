const { MongoClient } = require('mongodb');
const config = require('../config');

const client = new MongoClient(config.mongoUri);
let db = null;

async function connectDb() {
  if (!db) {
    await client.connect();
    db = client.db('taixiu_bot');

    await db.collection('users').createIndex({ discord_id: 1 }, { unique: true });
    await db.collection('sessions').createIndex({ guild_id: 1, id: -1 });
    await db.collection('bets').createIndex({ session_id: 1 });
    await db.collection('bets').createIndex({ user_id: 1 });
    await db.collection('config').createIndex({ guild_id: 1 }, { unique: true });

    console.log('✅ Connected to MongoDB');
  }
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connectDb() first.');
  return db;
}

async function closeDb() {
  if (client) {
    await client.close();
    db = null;
    console.log('🛑 MongoDB connection closed');
  }
}

module.exports = { connectDb, getDb, closeDb };
