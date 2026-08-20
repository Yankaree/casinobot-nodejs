require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const { Database } = require('@sqlitecloud/drivers');

const SQL_TIMEOUT_MS = 15_000;

const TABLES_TO_DROP = [
  'idx_coin_transactions_guild',
  'idx_coin_transactions_discord',
  'idx_card_game_history_guild',
  'idx_loans_active',
  'coin_transactions',
  'taixiu_bets',
  'taixiu_sessions',
  'baucua_bets',
  'baucua_sessions',
  'global_taixiu_bets',
  'global_taixiu_sessions',
  'global_taixiu_channels',
  'card_game_history',
  'werewolf_lobbies',
  'werewolf_history',
  'loans',
  'users',
  'config',
];

async function resetDatabase() {
  const uri = process.env.SQLITECLOUD_URI;
  if (!uri) {
    console.error('❌ SQLITECLOUD_URI not set in .env / .env.local');
    process.exit(1);
  }

  console.log('🔌 Connecting to SQLite Cloud...');
  const db = new Database(uri);

  try {
    await sqlWithTimeout(db, 'SELECT 1');
    console.log('✅ Connected to SQLite Cloud');
  } catch (err) {
    console.error(`❌ Connection failed: ${err.message}`);
    process.exit(1);
  }

  // Check what tables exist
  console.log('\n📋 Listing existing tables...');
  try {
    const tables = await sqlWithTimeout(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    if (tables && tables.length > 0) {
      console.log(`   Found ${tables.length} tables: ${tables.map(t => t.name).join(', ')}`);
    } else {
      console.log('   No user tables found — database is already clean.');
    }
  } catch (err) {
    console.warn(`   Could not list tables: ${err.message}`);
  }

  // Drop all tables (order matters due to foreign keys)
  console.log('\n🗑️  Dropping all tables...');
  let dropped = 0;
  for (const table of TABLES_TO_DROP) {
    try {
      await sqlWithTimeout(db, `DROP TABLE IF EXISTS "${table}"`);
      console.log(`   ✓ Dropped ${table}`);
      dropped++;
    } catch (err) {
      console.warn(`   ⚠ Failed to drop ${table}: ${err.message}`);
    }
  }

  // Also try to drop any tables we might have missed
  try {
    const remaining = await sqlWithTimeout(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    if (remaining && remaining.length > 0) {
      for (const t of remaining) {
        try {
          await sqlWithTimeout(db, `DROP TABLE IF EXISTS "${t.name}"`);
          console.log(`   ✓ Dropped extra table: ${t.name}`);
          dropped++;
        } catch {}
      }
    }
  } catch {}

  console.log(`\n✅ Database reset complete — dropped ${dropped} tables`);
  console.log('📌 Tables will be recreated automatically on bot startup.\n');

  await db.close();
}

function sqlWithTimeout(connection, sql) {
  return Promise.race([
    connection.sql(sql),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SQL query timed out')), SQL_TIMEOUT_MS)
    ),
  ]);
}

resetDatabase().catch(err => {
  console.error('❌ Reset failed:', err.message);
  process.exit(1);
});
