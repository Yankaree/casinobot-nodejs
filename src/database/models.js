const { getDb, queryWithRetry } = require('./database');

const UserModel = {
  async getOrCreate(discordId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql('SELECT * FROM users WHERE discord_id = ?', discordId);
      if (rows.length > 0) return rows[0];

      await db.sql('INSERT INTO users (discord_id) VALUES (?)', discordId);
      const newRows = await db.sql('SELECT * FROM users WHERE discord_id = ?', discordId);
      return newRows[0];
    });
  },

  async getBalance(discordId) {
    const user = await this.getOrCreate(discordId);
    return user.coin;
  },

  async addCoins(discordId, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.getOrCreate(discordId);
      await db.sql('UPDATE users SET coin = coin + ? WHERE discord_id = ?', amount, discordId);
      return this.getBalance(discordId);
    });
  },

  async removeCoins(discordId, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.getOrCreate(discordId);
      await db.sql('UPDATE users SET coin = coin - ? WHERE discord_id = ?', amount, discordId);
      return this.getBalance(discordId);
    });
  },

  async addWin(discordId) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.getOrCreate(discordId);
      await db.sql('UPDATE users SET win_count = win_count + 1 WHERE discord_id = ?', discordId);
    });
  },

  async addLose(discordId) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.getOrCreate(discordId);
      await db.sql('UPDATE users SET lose_count = lose_count + 1 WHERE discord_id = ?', discordId);
    });
  },

  async setCoins(discordId, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.getOrCreate(discordId);
      await db.sql('UPDATE users SET coin = ? WHERE discord_id = ?', amount, discordId);
    });
  },

  async getLastWork(discordId) {
    const user = await this.getOrCreate(discordId);
    return user.last_work_at || null;
  },

  async setLastWork(discordId, time) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql('UPDATE users SET last_work_at = ? WHERE discord_id = ?', time, discordId);
    });
  },
};

const SessionModel = {
  async create(guildId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const result = await db.sql('INSERT INTO sessions (guild_id) VALUES (?)', guildId);
      return result.lastID;
    });
  },

  async finish(sessionId, dice1, dice2, dice3, result, totalBet) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'UPDATE sessions SET dice1 = ?, dice2 = ?, dice3 = ?, result = ?, total_bet = ? WHERE id = ?',
        dice1, dice2, dice3, result, totalBet, sessionId
      );
    });
  },

  async getById(sessionId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const rows = await db.sql('SELECT * FROM sessions WHERE id = ?', sessionId);
      return rows[0] || null;
    });
  },

  async getRecent(guildId, limit = 20) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        'SELECT * FROM sessions WHERE guild_id = ? AND result IS NOT NULL ORDER BY id DESC LIMIT ?',
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
         FROM sessions WHERE guild_id = ? AND result IS NOT NULL`,
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
        'SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE session_id = ?',
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
        'INSERT INTO bets (session_id, user_id, choice, amount) VALUES (?, ?, ?, ?)',
        sessionId, userId, choice, amount
      );
    });
  },

  async updateResult(sessionId, userId, won, payout) {
    return queryWithRetry(async () => {
      const db = getDb();
      await db.sql(
        'UPDATE bets SET won = ?, payout = ? WHERE session_id = ? AND user_id = ?',
        won ? 1 : 0, payout, sessionId, userId
      );
    });
  },

  async getSessionBets(sessionId) {
    return queryWithRetry(async () => {
      const db = getDb();
      return db.sql(
        `SELECT b.*, u.discord_id
         FROM bets b
         JOIN users u ON b.user_id = u.id
         WHERE b.session_id = ?`,
        sessionId
      );
    });
  },

  async getUserStats(discordId) {
    return queryWithRetry(async () => {
      const db = getDb();
      const userRows = await db.sql('SELECT id FROM users WHERE discord_id = ?', discordId);
      if (userRows.length === 0) return { totalBets: 0, totalWon: 0, totalLost: 0 };

      const rows = await db.sql(
        `SELECT
          COUNT(*) as totalBets,
          COALESCE(SUM(CASE WHEN won = 1 THEN payout ELSE 0 END), 0) as totalWon,
          COALESCE(SUM(CASE WHEN won = 0 THEN amount ELSE 0 END), 0) as totalLost
         FROM bets WHERE user_id = ?`,
        userRows[0].id
      );
      if (rows.length === 0) return { totalBets: 0, totalWon: 0, totalLost: 0 };
      return rows[0];
    });
  },
};

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

  async getJackpot(guildId) {
    const cfg = await this.get(guildId);
    return cfg.jackpot_balance;
  },

  async addJackpot(guildId, amount) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.get(guildId);
      await db.sql('UPDATE config SET jackpot_balance = jackpot_balance + ? WHERE guild_id = ?', amount, guildId);
      return this.getJackpot(guildId);
    });
  },

  async resetJackpot(guildId) {
    return queryWithRetry(async () => {
      const db = getDb();
      await this.get(guildId);
      await db.sql('UPDATE config SET jackpot_balance = 0 WHERE guild_id = ?', guildId);
      return 0;
    });
  },
};

module.exports = { UserModel, SessionModel, BetModel, ConfigModel };
