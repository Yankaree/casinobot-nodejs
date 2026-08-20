require('dotenv').config();
// Load overrides from .env.local if present (e.g. SQLite Cloud URI)
require('dotenv').config({ path: '.env.local', override: true });

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  sqliteUri: process.env.SQLITECLOUD_URI,

  game: {
    sessionDuration: 50,
    betMultiplier: 2.5,
    startingCoins: 100000,
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

  loan: {
    maxLoan: 1000000000, // Vay tối đa 1 tỷ / lần
    tierBoundary: 100000000, // Từ 100 triệu trở lên → lãi 200%
    lowRate: 1.0, // Lãi 100% (dưới 100 triệu)
    highRate: 2.0, // Lãi 200% (từ 100 triệu)
  },

  // ⚔️ Tài Xỉu Deathmatch — nhánh độc lập của Tài Xỉu thường
  // Dùng Battle Coin (RAM, không phải coin chính), lobby + timer trận riêng.
  deathmatch: {
    defaultInitialCoin: 100000, // Vốn Battle Coin mỗi người khi trận bắt đầu
    defaultMinutes: 10, // Thời gian trận mặc định (phút)
    defaultMaxPlayers: 4, // Số người tối đa mặc định
    minPlayersToStart: 2, // Cần tối thiểu bao nhiêu người để start
    maxPlayers: 8, // Giới hạn người chơi tối đa
    minBet: 1000, // Cược tối thiểu mỗi round
    minBattleCoin: 1000, // Battle Coin < mức này → ACTIVE → SPECTATOR
    setCoinMax: 1000000000, // Giới hạn trên khi tự chỉnh Battle Coin (/txdeath setcoin)
    roundDuration: 50, // Giây mỗi round (dùng chung với timer Tài Xỉu thường)
    eventChance: 0.15, // 15% round có event (hiếm hơn — giảm từ 40%)
    taxPercent: 0.01, // Event thuế: mỗi người mất 1% Battle Coin (nerf mạnh từ 5%)
    helpPercent: 1.0, // Event trợ giúp: kẻ yếu nhất +100% (buff từ +50%, tối thiểu 5,000)
    luckyPercent: 0.5, // Event may mắn: ngẫu nhiên +50% (buff từ +20%, tối thiểu 2,000)
    hitPercent: 0.05, // Event tổn thất: ngẫu nhiên -5% (nerf mạnh từ -30%)
    rollDelayMs: 2000, // Delay 'Đang quay...' trước khi lật kết quả
    noBetDelayMs: 3000, // Delay khi round không ai cược
    nextRoundDelayMs: 5000, // Delay giữa 2 round
    allBetDelayMs: 1500, // Delay trước khi lật kết quả khi tất cả ACTIVE đã cược
  },

  adminUsers: ['924487653456511048'],

  colors: {
    primary: 0xffd700,
    success: 0x00ff00,
    danger: 0xff0000,
    info: 0x0099ff,
  },
};
