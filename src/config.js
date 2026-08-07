require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  mongoUri: process.env.MONGODB_URI,

  game: {
    sessionDuration: 50,
    betMultiplier: 1.2,
    jackpotMultiplier: 1.4,
    jackpotChance: [1, 1, 1], // Triple 1
    jackpotChance2: [6, 6, 6], // Triple 6
    jackpotPercent: 0.05,
    startingCoins: 10000,
  },

  adminUsers: ['924487653456511048'],

  colors: {
    primary: 0xffd700,
    success: 0x00ff00,
    danger: 0xff0000,
    info: 0x0099ff,
  },
};
