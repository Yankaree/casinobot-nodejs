const { getDb } = require('./database');

const UserModel = {
  getOrCreate(discordId) {
    const db = getDb();
    let user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    if (!user) {
      const stmt = db.prepare('INSERT INTO users (discord_id) VALUES (?)');
      const result = stmt.run(discordId);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }
    return user;
  },

  getBalance(discordId) {
    const user = this.getOrCreate(discordId);
    return user.coin;
  },

  addCoins(discordId, amount) {
    const db = getDb();
    this.getOrCreate(discordId);
    db.prepare('UPDATE users SET coin = coin + ? WHERE discord_id = ?').run(amount, discordId);
    return this.getBalance(discordId);
  },

  removeCoins(discordId, amount) {
    const db = getDb();
    this.getOrCreate(discordId);
    db.prepare('UPDATE users SET coin = coin - ? WHERE discord_id = ?').run(amount, discordId);
    return this.getBalance(discordId);
  },

  addWin(discordId) {
    const db = getDb();
    this.getOrCreate(discordId);
    db.prepare('UPDATE users SET win_count = win_count + 1 WHERE discord_id = ?').run(discordId);
  },

  addLose(discordId) {
    const db = getDb();
    this.getOrCreate(discordId);
    db.prepare('UPDATE users SET lose_count = lose_count + 1 WHERE discord_id = ?').run(discordId);
  },

  setCoins(discordId, amount) {
    const db = getDb();
    this.getOrCreate(discordId);
    db.prepare('UPDATE users SET coin = ? WHERE discord_id = ?').run(amount, discordId);
  },
};

const SessionModel = {
  create(guildId) {
    const db = getDb();
    const stmt = db.prepare('INSERT INTO sessions (guild_id) VALUES (?)');
    const result = stmt.run(guildId);
    return result.lastInsertRowid;
  },

  finish(sessionId, dice1, dice2, dice3, result, totalBet) {
    const db = getDb();
    db.prepare(
      'UPDATE sessions SET dice1 = ?, dice2 = ?, dice3 = ?, result = ?, total_bet = ? WHERE id = ?'
    ).run(dice1, dice2, dice3, result, totalBet, sessionId);
  },

  getById(sessionId) {
    const db = getDb();
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  },

  getRecent(guildId, limit = 20) {
    const db = getDb();
    return db
      .prepare(
        'SELECT * FROM sessions WHERE guild_id = ? AND result IS NOT NULL ORDER BY id DESC LIMIT ?'
      )
      .all(guildId, limit);
  },

  getStats(guildId) {
    const db = getDb();
    const total = db
      .prepare('SELECT COUNT(*) as count FROM sessions WHERE guild_id = ? AND result IS NOT NULL')
      .get(guildId);
    const tai = db
      .prepare(
        'SELECT COUNT(*) as count FROM sessions WHERE guild_id = ? AND result = ?'
      )
      .get(guildId, 'tai');
    const xiu = db
      .prepare(
        'SELECT COUNT(*) as count FROM sessions WHERE guild_id = ? AND result = ?'
      )
      .get(guildId, 'xiu');
    return {
      total: total.count,
      tai: tai.count,
      xiu: xiu.count,
    };
  },

  getTotalBets(sessionId) {
    const db = getDb();
    const result = db
      .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE session_id = ?')
      .get(sessionId);
    return result.total;
  },
};

const BetModel = {
  create(sessionId, userId, choice, amount) {
    const db = getDb();
    const stmt = db.prepare(
      'INSERT INTO bets (session_id, user_id, choice, amount) VALUES (?, ?, ?, ?)'
    );
    return stmt.run(sessionId, userId, choice, amount);
  },

  updateResult(sessionId, userId, won, payout) {
    const db = getDb();
    db.prepare('UPDATE bets SET won = ?, payout = ? WHERE session_id = ? AND user_id = ?').run(
      won ? 1 : 0,
      payout,
      sessionId,
      userId
    );
  },

  getSessionBets(sessionId) {
    const db = getDb();
    return db
      .prepare(
        `SELECT b.*, u.discord_id 
         FROM bets b 
         JOIN users u ON b.user_id = u.id 
         WHERE b.session_id = ?`
      )
      .all(sessionId);
  },

  getUserStats(discordId) {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE discord_id = ?').get(discordId);
    if (!user) return { totalBets: 0, totalWon: 0, totalLost: 0 };

    const stats = db
      .prepare(
        `SELECT 
          COUNT(*) as totalBets,
          COALESCE(SUM(CASE WHEN won = 1 THEN payout ELSE 0 END), 0) as totalWon,
          COALESCE(SUM(CASE WHEN won = 0 THEN amount ELSE 0 END), 0) as totalLost
         FROM bets WHERE user_id = ?`
      )
      .get(user.id);
    return stats;
  },
};

const ConfigModel = {
  get(guildId) {
    const db = getDb();
    let config = db.prepare('SELECT * FROM config WHERE guild_id = ?').get(guildId);
    if (!config) {
      db.prepare('INSERT INTO config (guild_id) VALUES (?)').run(guildId);
      config = db.prepare('SELECT * FROM config WHERE guild_id = ?').get(guildId);
    }
    return config;
  },

  setChannel(guildId, channelId) {
    const db = getDb();
    this.get(guildId);
    db.prepare('UPDATE config SET taixiu_channel_id = ? WHERE guild_id = ?').run(
      channelId,
      guildId
    );
  },

  getChannel(guildId) {
    const config = this.get(guildId);
    return config.taixiu_channel_id;
  },

  getJackpot(guildId) {
    const config = this.get(guildId);
    return config.jackpot_balance;
  },

  addJackpot(guildId, amount) {
    const db = getDb();
    this.get(guildId);
    db.prepare('UPDATE config SET jackpot_balance = jackpot_balance + ? WHERE guild_id = ?').run(
      amount,
      guildId
    );
    return this.getJackpot(guildId);
  },

  resetJackpot(guildId) {
    const db = getDb();
    this.get(guildId);
    db.prepare('UPDATE config SET jackpot_balance = 0 WHERE guild_id = ?').run(guildId);
    return 0;
  },
};

module.exports = { UserModel, SessionModel, BetModel, ConfigModel };
