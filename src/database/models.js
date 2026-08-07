const { getDb } = require('./database');
const { ObjectId } = require('mongodb');

const UserModel = {
  collection() {
    return getDb().collection('users');
  },

  async getOrCreate(discordId) {
    let user = await this.collection().findOne({ discord_id: discordId });
    if (!user) {
      const doc = {
        discord_id: discordId,
        coin: 10000,
        win_count: 0,
        lose_count: 0,
        created_at: new Date(),
      };
      const result = await this.collection().insertOne(doc);
      user = await this.collection().findOne({ _id: result.insertedId });
    }
    return user;
  },

  async getBalance(discordId) {
    const user = await this.getOrCreate(discordId);
    return user.coin;
  },

  async addCoins(discordId, amount) {
    await this.getOrCreate(discordId);
    await this.collection().updateOne({ discord_id: discordId }, { $inc: { coin: amount } });
    return this.getBalance(discordId);
  },

  async removeCoins(discordId, amount) {
    await this.getOrCreate(discordId);
    await this.collection().updateOne({ discord_id: discordId }, { $inc: { coin: -amount } });
    return this.getBalance(discordId);
  },

  async addWin(discordId) {
    await this.getOrCreate(discordId);
    await this.collection().updateOne({ discord_id: discordId }, { $inc: { win_count: 1 } });
  },

  async addLose(discordId) {
    await this.getOrCreate(discordId);
    await this.collection().updateOne({ discord_id: discordId }, { $inc: { lose_count: 1 } });
  },

  async setCoins(discordId, amount) {
    await this.getOrCreate(discordId);
    await this.collection().updateOne({ discord_id: discordId }, { $set: { coin: amount } });
  },
};

const SessionModel = {
  collection() {
    return getDb().collection('sessions');
  },

  async create(guildId) {
    const doc = {
      guild_id: guildId,
      dice1: null,
      dice2: null,
      dice3: null,
      result: null,
      total_bet: 0,
      timestamp: new Date(),
    };
    const result = await this.collection().insertOne(doc);
    return result.insertedId;
  },

  async finish(sessionId, dice1, dice2, dice3, result, totalBet) {
    await this.collection().updateOne(
      { _id: new ObjectId(sessionId) },
      { $set: { dice1, dice2, dice3, result, total_bet: totalBet } }
    );
  },

  async getById(sessionId) {
    return this.collection().findOne({ _id: new ObjectId(sessionId) });
  },

  async getRecent(guildId, limit = 20) {
    return this.collection()
      .find({ guild_id: guildId, result: { $ne: null } })
      .sort({ _id: -1 })
      .limit(limit)
      .toArray();
  },

  async getStats(guildId) {
    const pipeline = [
      { $match: { guild_id: guildId, result: { $ne: null } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          tai: { $sum: { $cond: [{ $eq: ['$result', 'tai'] }, 1, 0] } },
          xiu: { $sum: { $cond: [{ $eq: ['$result', 'xiu'] }, 1, 0] } },
        },
      },
    ];
    const result = await this.collection().aggregate(pipeline).toArray();
    if (result.length === 0) return { total: 0, tai: 0, xiu: 0 };
    return { total: result[0].total, tai: result[0].tai, xiu: result[0].xiu };
  },

  async getTotalBets(sessionId) {
    const pipeline = [
      { $match: { session_id: new ObjectId(sessionId) } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ];
    const result = await getDb().collection('bets').aggregate(pipeline).toArray();
    return result.length > 0 ? result[0].total : 0;
  },
};

const BetModel = {
  collection() {
    return getDb().collection('bets');
  },

  async create(sessionId, userId, choice, amount) {
    const doc = {
      session_id: new ObjectId(sessionId),
      user_id: new ObjectId(userId),
      choice,
      amount,
      won: 0,
      payout: 0,
      created_at: new Date(),
    };
    return this.collection().insertOne(doc);
  },

  async updateResult(sessionId, userId, won, payout) {
    await this.collection().updateOne(
      { session_id: new ObjectId(sessionId), user_id: new ObjectId(userId) },
      { $set: { won: won ? 1 : 0, payout } }
    );
  },

  async getSessionBets(sessionId) {
    return this.collection()
      .aggregate([
        { $match: { session_id: new ObjectId(sessionId) } },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $project: {
            _id: 1,
            session_id: 1,
            user_id: 1,
            choice: 1,
            amount: 1,
            won: 1,
            payout: 1,
            discord_id: '$user.discord_id',
          },
        },
      ])
      .toArray();
  },

  async getUserStats(discordId) {
    const user = await getDb().collection('users').findOne({ discord_id: discordId });
    if (!user) return { totalBets: 0, totalWon: 0, totalLost: 0 };

    const pipeline = [
      { $match: { user_id: user._id } },
      {
        $group: {
          _id: null,
          totalBets: { $sum: 1 },
          totalWon: {
            $sum: { $cond: [{ $eq: ['$won', 1] }, '$payout', 0] },
          },
          totalLost: {
            $sum: { $cond: [{ $eq: ['$won', 0] }, '$amount', 0] },
          },
        },
      },
    ];
    const result = await this.collection().aggregate(pipeline).toArray();
    if (result.length === 0) return { totalBets: 0, totalWon: 0, totalLost: 0 };
    return result[0];
  },
};

const ConfigModel = {
  collection() {
    return getDb().collection('config');
  },

  async get(guildId) {
    let cfg = await this.collection().findOne({ guild_id: guildId });
    if (!cfg) {
      const doc = {
        guild_id: guildId,
        taixiu_channel_id: null,
        jackpot_balance: 0,
      };
      await this.collection().insertOne(doc);
      cfg = await this.collection().findOne({ guild_id: guildId });
    }
    return cfg;
  },

  async setChannel(guildId, channelId) {
    await this.get(guildId);
    await this.collection().updateOne(
      { guild_id: guildId },
      { $set: { taixiu_channel_id: channelId } }
    );
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
    await this.get(guildId);
    await this.collection().updateOne(
      { guild_id: guildId },
      { $inc: { jackpot_balance: amount } }
    );
    return this.getJackpot(guildId);
  },

  async resetJackpot(guildId) {
    await this.get(guildId);
    await this.collection().updateOne(
      { guild_id: guildId },
      { $set: { jackpot_balance: 0 } }
    );
    return 0;
  },
};

module.exports = { UserModel, SessionModel, BetModel, ConfigModel };
