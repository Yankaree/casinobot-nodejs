const { getDb, queryWithRetry } = require('./database');

// ═══════════════════════════════════════════
// USER MODEL (shared)
// ═══════════════════════════════════════════

const UserModel = {
  async getOrCreate(guildId, discordId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql(
        'SELECT * FROM users WHERE guild_id = ? AND discord_id = ?',
        guildId, discordId
      );
      if (rows.length > 0) return rows[0];

      await db.sql(
        'INSERT INTO users (guild_id, discord_id) VALUES (?, ?)',
        guildId, discordId
      );
      const newRows = await db.sql(
        'SELECT * FROM users WHERE guild_id = ? AND discord_id = ?',
        guildId, discordId
      );
      return newRows[0];
    });
  },

  async getBalance(guildId, discordId) {
    const user = await this.getOrCreate(guildId, discordId);
    return user.coin;
  },

  async addCoins(guildId, discordId, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.getOrCreate(guildId, discordId);
      await db.sql(
        'UPDATE users SET coin = coin + ? WHERE guild_id = ? AND discord_id = ?',
        amount, guildId, discordId
      );
      return this.getBalance(guildId, discordId);
    });
  },

  async removeCoins(guildId, discordId, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.getOrCreate(guildId, discordId);
      await db.sql(
        'UPDATE users SET coin = coin - ? WHERE guild_id = ? AND discord_id = ?',
        amount, guildId, discordId
      );
      return this.getBalance(guildId, discordId);
    });
  },

  async addWin(guildId, discordId) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.getOrCreate(guildId, discordId);
      await db.sql(
        'UPDATE users SET win_count = win_count + 1 WHERE guild_id = ? AND discord_id = ?',
        guildId, discordId
      );
    });
  },

  async addLose(guildId, discordId) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.getOrCreate(guildId, discordId);
      await db.sql(
        'UPDATE users SET lose_count = lose_count + 1 WHERE guild_id = ? AND discord_id = ?',
        guildId, discordId
      );
    });
  },

  async setCoins(guildId, discordId, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.getOrCreate(guildId, discordId);
      await db.sql(
        'UPDATE users SET coin = ? WHERE guild_id = ? AND discord_id = ?',
        amount, guildId, discordId
      );
    });
  },

  async getLastWork(guildId, discordId) {
    const user = await this.getOrCreate(guildId, discordId);
    return user.last_work_at || null;
  },

  async setLastWork(guildId, discordId, time) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'UPDATE users SET last_work_at = ? WHERE guild_id = ? AND discord_id = ?',
        time, guildId, discordId
      );
    });
  },
};

// ═══════════════════════════════════════════
// CONFIG MODEL (channel settings)
// ═══════════════════════════════════════════

const ConfigModel = {
  async get(guildId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql('SELECT * FROM config WHERE guild_id = ?', guildId);
      if (rows.length > 0) return rows[0];

      await db.sql('INSERT INTO config (guild_id) VALUES (?)', guildId);
      const newRows = await db.sql('SELECT * FROM config WHERE guild_id = ?', guildId);
      return newRows[0];
    });
  },

  async setChannel(guildId, channelId) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.get(guildId);
      await db.sql('UPDATE config SET taixiu_channel_id = ? WHERE guild_id = ?', channelId, guildId);
    });
  },

  async getChannel(guildId) {
    const cfg = await this.get(guildId);
    return cfg.taixiu_channel_id;
  },

  async setBaucuaChannel(guildId, channelId) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.get(guildId);
      await db.sql('UPDATE config SET baucua_channel_id = ? WHERE guild_id = ?', channelId, guildId);
    });
  },

  async getBaucuaChannel(guildId) {
    const cfg = await this.get(guildId);
    return cfg.baucua_channel_id;
  },
};

// ═══════════════════════════════════════════
// JACKPOT MODEL (per-game)
// ═══════════════════════════════════════════

const JackpotModel = {
  async get(guildId, gameName) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql(
        'SELECT * FROM jackpots WHERE guild_id = ? AND game_name = ?',
        guildId, gameName
      );
      if (rows.length > 0) return rows[0];

      await db.sql(
        'INSERT INTO jackpots (guild_id, game_name, balance) VALUES (?, ?, 100000000)',
        guildId, gameName
      );
      const newRows = await db.sql(
        'SELECT * FROM jackpots WHERE guild_id = ? AND game_name = ?',
        guildId, gameName
      );
      return newRows[0];
    });
  },

  async getBalance(guildId, gameName) {
    const jp = await this.get(guildId, gameName);
    return jp.balance;
  },

  async addAmount(guildId, gameName, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.get(guildId, gameName);
      await db.sql(
        'UPDATE jackpots SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND game_name = ?',
        amount, guildId, gameName
      );
      return this.getBalance(guildId, gameName);
    });
  },

  async reset(guildId, gameName) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.get(guildId, gameName);
      await db.sql(
        'UPDATE jackpots SET balance = 0, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND game_name = ?',
        guildId, gameName
      );
      return 0;
    });
  },
};

// ═══════════════════════════════════════════
// TAI XIU MODELS
// ═══════════════════════════════════════════

const SessionModel = {
  async create(guildId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const result = await db.sql('INSERT INTO taixiu_sessions (guild_id) VALUES (?)', guildId);
      return result.lastID;
    });
  },

  async finish(sessionId, dice1, dice2, dice3, result, totalBet) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'UPDATE taixiu_sessions SET dice1 = ?, dice2 = ?, dice3 = ?, result = ?, total_bet = ? WHERE id = ?',
        dice1, dice2, dice3, result, totalBet, sessionId
      );
    });
  },

  async getById(sessionId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql('SELECT * FROM taixiu_sessions WHERE id = ?', sessionId);
      return rows[0] || null;
    });
  },

  async getRecent(guildId, limit = 20) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        'SELECT * FROM taixiu_sessions WHERE guild_id = ? AND result IS NOT NULL ORDER BY id DESC LIMIT ?',
        guildId, limit
      );
    });
  },

  async getStats(guildId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN result = 'tai' THEN 1 ELSE 0 END) as tai,
          SUM(CASE WHEN result = 'xiu' THEN 1 ELSE 0 END) as xiu
         FROM taixiu_sessions WHERE guild_id = ? AND result IS NOT NULL`,
        guildId
      );
      if (rows.length === 0) return { total: 0, tai: 0, xiu: 0 };
      return { total: rows[0].total || 0, tai: rows[0].tai || 0, xiu: rows[0].xiu || 0 };
    });
  },

  async getTotalBets(sessionId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql(
        'SELECT COALESCE(SUM(amount), 0) as total FROM taixiu_bets WHERE session_id = ?',
        sessionId
      );
      return rows[0]?.total || 0;
    });
  },
};

const BetModel = {
  async create(sessionId, userId, choice, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        'INSERT INTO taixiu_bets (session_id, user_id, choice, amount) VALUES (?, ?, ?, ?)',
        sessionId, userId, choice, amount
      );
    });
  },

  async updateResult(sessionId, userId, won, payout) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'UPDATE taixiu_bets SET won = ?, payout = ? WHERE session_id = ? AND user_id = ?',
        won ? 1 : 0, payout, sessionId, userId
      );
    });
  },

  async getSessionBets(sessionId) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        `SELECT b.*, u.discord_id
         FROM taixiu_bets b
         JOIN users u ON b.user_id = u.id
         WHERE b.session_id = ?`,
        sessionId
      );
    });
  },

  async getUserStats(guildId, discordId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const userRows = await db.sql(
        'SELECT id FROM users WHERE guild_id = ? AND discord_id = ?',
        guildId, discordId
      );
      if (userRows.length === 0) return { totalBets: 0, totalWon: 0, totalLost: 0 };

      const userId = userRows[0].id;

      const taixiu = await db.sql(
        `SELECT
          COUNT(*) as totalBets,
          COALESCE(SUM(CASE WHEN won = 1 THEN payout ELSE 0 END), 0) as totalWon,
          COALESCE(SUM(CASE WHEN won = 0 THEN amount ELSE 0 END), 0) as totalLost
         FROM taixiu_bets WHERE user_id = ?`,
        userId
      );

      const baucua = await db.sql(
        `SELECT
          COUNT(*) as totalBets,
          COALESCE(SUM(CASE WHEN won = 1 THEN payout ELSE 0 END), 0) as totalWon,
          COALESCE(SUM(CASE WHEN won = 0 THEN amount ELSE 0 END), 0) as totalLost
         FROM baucua_bets WHERE user_id = ?`,
        userId
      );

      const tx = taixiu[0] || { totalBets: 0, totalWon: 0, totalLost: 0 };
      const bc = baucua[0] || { totalBets: 0, totalWon: 0, totalLost: 0 };

      return {
        totalBets: tx.totalBets + bc.totalBets,
        totalWon: tx.totalWon + bc.totalWon,
        totalLost: tx.totalLost + bc.totalLost,
      };
    });
  },
};

// ═══════════════════════════════════════════
// BAU CUA MODELS
// ═══════════════════════════════════════════

const BaucuaSessionModel = {
  async create(guildId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const result = await db.sql('INSERT INTO baucua_sessions (guild_id) VALUES (?)', guildId);
      return result.lastID;
    });
  },

  async finish(sessionId, result1, result2, result3, totalBet) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'UPDATE baucua_sessions SET result_1 = ?, result_2 = ?, result_3 = ?, total_bet = ? WHERE id = ?',
        result1, result2, result3, totalBet, sessionId
      );
    });
  },

  async getRecent(guildId, limit = 20) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        'SELECT * FROM baucua_sessions WHERE guild_id = ? AND result_1 IS NOT NULL ORDER BY id DESC LIMIT ?',
        guildId, limit
      );
    });
  },

  async getStats(guildId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN result_1 = result_2 AND result_2 = result_3 THEN 1 ELSE 0 END) as triple_count
         FROM baucua_sessions WHERE guild_id = ? AND result_1 IS NOT NULL`,
        guildId
      );
      if (rows.length === 0) return { total: 0, triple_count: 0 };
      return { total: rows[0].total || 0, triple_count: rows[0].triple_count || 0 };
    });
  },

  async getAnimalFrequency(guildId) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        `SELECT result as animal, COUNT(*) as count FROM (
           SELECT result_1 as result FROM baucua_sessions WHERE guild_id = ? AND result_1 IS NOT NULL
           UNION ALL
           SELECT result_2 as result FROM baucua_sessions WHERE guild_id = ? AND result_2 IS NOT NULL
           UNION ALL
           SELECT result_3 as result FROM baucua_sessions WHERE guild_id = ? AND result_3 IS NOT NULL
         ) GROUP BY result ORDER BY count DESC`,
        guildId, guildId, guildId
      );
    });
  },

  async getTopWinner(guildId, limit = 5) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        `SELECT u.discord_id, SUM(b.payout) as total_payout, COUNT(*) as win_count
         FROM baucua_bets b
         JOIN users u ON b.user_id = u.id
         JOIN baucua_sessions s ON b.session_id = s.id
         WHERE s.guild_id = ? AND b.won = 1 AND b.payout > 0
         GROUP BY u.discord_id
         ORDER BY total_payout DESC
         LIMIT ?`,
        guildId, limit
      );
    });
  },

  async getTotalPayout(guildId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql(
        `SELECT COALESCE(SUM(b.payout), 0) as total_payout
         FROM baucua_bets b
         JOIN baucua_sessions s ON b.session_id = s.id
         WHERE s.guild_id = ? AND b.won = 1`,
        guildId
      );
      return rows[0]?.total_payout || 0;
    });
  },
};

const BaucuaBetModel = {
  async create(sessionId, userId, animal, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        'INSERT INTO baucua_bets (session_id, user_id, animal, amount) VALUES (?, ?, ?, ?)',
        sessionId, userId, animal, amount
      );
    });
  },

  async updateResult(sessionId, userId, animal, won, payout) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'UPDATE baucua_bets SET won = ?, payout = ? WHERE session_id = ? AND user_id = ? AND animal = ?',
        won ? 1 : 0, payout, sessionId, userId, animal
      );
    });
  },

  async getSessionBets(sessionId) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        `SELECT b.*, u.discord_id
         FROM baucua_bets b
         JOIN users u ON b.user_id = u.id
         WHERE b.session_id = ?`,
        sessionId
      );
    });
  },

  async getUserStats(guildId, discordId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const userRows = await db.sql(
        'SELECT id FROM users WHERE guild_id = ? AND discord_id = ?',
        guildId, discordId
      );
      if (userRows.length === 0) return { totalBets: 0, totalWon: 0, totalLost: 0 };

      const rows = await db.sql(
        `SELECT
          COUNT(*) as totalBets,
          COALESCE(SUM(CASE WHEN b.won = 1 THEN b.payout ELSE 0 END), 0) as totalWon,
          COALESCE(SUM(CASE WHEN b.won = 0 THEN b.amount ELSE 0 END), 0) as totalLost
         FROM baucua_bets b
         JOIN baucua_sessions s ON b.session_id = s.id
         WHERE b.user_id = ? AND s.guild_id = ?`,
        userRows[0].id, guildId
      );
      if (rows.length === 0) return { totalBets: 0, totalWon: 0, totalLost: 0 };
      return rows[0];
    });
  },
};

// ═══════════════════════════════════════════
// GLOBAL TAI XIU CHANNEL MODEL
// ═══════════════════════════════════════════

const GlobalTaixiuChannelModel = {
  async add(guildId, channelId) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'INSERT OR IGNORE INTO global_taixiu_channels (guild_id, channel_id) VALUES (?, ?)',
        guildId, channelId
      );
    });
  },

  async remove(guildId, channelId) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'DELETE FROM global_taixiu_channels WHERE guild_id = ? AND channel_id = ?',
        guildId, channelId
      );
    });
  },

  async getAllChannelIds() {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql('SELECT channel_id FROM global_taixiu_channels');
      return rows.map((r) => r.channel_id);
    });
  },

  async isChannelRegistered(guildId, channelId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql(
        'SELECT 1 FROM global_taixiu_channels WHERE guild_id = ? AND channel_id = ?',
        guildId, channelId
      );
      return rows.length > 0;
    });
  },

  async getByGuild(guildId) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        'SELECT channel_id FROM global_taixiu_channels WHERE guild_id = ?',
        guildId
      );
    });
  },
};

// ═══════════════════════════════════════════
// GLOBAL TAI XIU SESSION MODEL
// ═══════════════════════════════════════════

const GlobalTaixiuSessionModel = {
  async create() {
    return queryWithRetry(async () => {
      const db = getDb();
      const result = await db.sql('INSERT INTO global_taixiu_sessions DEFAULT VALUES');
      return result.lastID;
    });
  },

  async finish(sessionId, dice1, dice2, dice3, result, totalBet) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'UPDATE global_taixiu_sessions SET dice1 = ?, dice2 = ?, dice3 = ?, result = ?, total_bet = ? WHERE id = ?',
        dice1, dice2, dice3, result, totalBet, sessionId
      );
    });
  },

  async getById(sessionId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql('SELECT * FROM global_taixiu_sessions WHERE id = ?', sessionId);
      return rows[0] || null;
    });
  },

  async getRecent(limit = 20) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        'SELECT * FROM global_taixiu_sessions WHERE result IS NOT NULL ORDER BY id DESC LIMIT ?',
        limit
      );
    });
  },

  async getStats() {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN result = 'tai' THEN 1 ELSE 0 END) as tai,
          SUM(CASE WHEN result = 'xiu' THEN 1 ELSE 0 END) as xiu
         FROM global_taixiu_sessions WHERE result IS NOT NULL`
      );
      if (rows.length === 0) return { total: 0, tai: 0, xiu: 0 };
      return { total: rows[0].total || 0, tai: rows[0].tai || 0, xiu: rows[0].xiu || 0 };
    });
  },

  async getTotalBets(sessionId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql(
        'SELECT COALESCE(SUM(amount), 0) as total FROM global_taixiu_bets WHERE session_id = ?',
        sessionId
      );
      return rows[0]?.total || 0;
    });
  },
};

// ═══════════════════════════════════════════
// GLOBAL TAI XIU BET MODEL
// ═══════════════════════════════════════════

const GlobalTaixiuBetModel = {
  async create(sessionId, userId, guildId, choice, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        'INSERT INTO global_taixiu_bets (session_id, user_id, guild_id, choice, amount) VALUES (?, ?, ?, ?, ?)',
        sessionId, userId, guildId, choice, amount
      );
    });
  },

  async updateResult(sessionId, userId, won, payout) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'UPDATE global_taixiu_bets SET won = ?, payout = ? WHERE session_id = ? AND user_id = ?',
        won ? 1 : 0, payout, sessionId, userId
      );
    });
  },

  async getSessionBets(sessionId) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        `SELECT b.*, u.discord_id
         FROM global_taixiu_bets b
         JOIN users u ON b.user_id = u.id
         WHERE b.session_id = ?`,
        sessionId
      );
    });
  },
};

module.exports = {
  UserModel,
  ConfigModel,
  JackpotModel,
  SessionModel,
  BetModel,
  BaucuaSessionModel,
  BaucuaBetModel,
  GlobalTaixiuChannelModel,
  GlobalTaixiuSessionModel,
  GlobalTaixiuBetModel,
};
