require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  sqliteUri: process.env.SQLITECLOUD_URI,

  game: {
    sessionDuration: 50,
    betMultiplier: 2.5,
    jackpotMultiplier: 5.0,
    jackpotChance: [1, 1, 1], // Triple 1
    jackpotChance2: [6, 6, 6], // Triple 6
    jackpotPercent: 0.05,
    startingCoins: 10000,
    maxEmptyRounds: 3,
  },

  work: {
    cooldownMs: 90 * 1000, // 90 giây
    minReward: 5000,
    maxReward: 10000,
  },

  adminUsers: ['924487653456511048'],

  colors: {
    primary: 0xffd700,
    success: 0x00ff00,
    danger: 0xff0000,
    info: 0x0099ff,
  },
};
