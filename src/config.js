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
    startingCoins: 100,
    maxEmptyRounds: 3,
  },

  work: {
    cooldownMs: 30 * 1000, // 30 giây
    minReward: 10000,
    maxReward: 100000,
  },

  leaderboard: {
    topCount: 10,
    cacheTtlMs: 2 * 60 * 1000, // 2 phút
    largeTxThreshold: 1000000, // Giao dịch lớn → xóa cache ngay
    cooldownMs: 10 * 1000, // 10 giây chống spam
  },

  jackpot: {
    dailyResetHourGmt7: 7, // Reset hũ hằng ngày lúc 7:00 (GMT+7)
    defaultBalance: 1000000000, // Giá trị hũ sau khi reset (1 tỷ)
  },

  loan: {
    maxLoan: 1000000000, // Vay tối đa 1 tỷ / lần
    tierBoundary: 100000000, // Từ 100 triệu trở lên → lãi 200%
    lowRate: 1.0, // Lãi 100% (dưới 100 triệu)
    highRate: 2.0, // Lãi 200% (từ 100 triệu)
  },

  adminUsers: ['924487653456511048'],

  colors: {
    primary: 0xffd700,
    success: 0x00ff00,
    danger: 0xff0000,
    info: 0x0099ff,
  },
};
