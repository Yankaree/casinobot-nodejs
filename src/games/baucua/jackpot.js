const { JackpotModel } = require('../../database/models');
const { formatCoins } = require('../../utils/formatter');
const { EmbedBuilder } = require('discord.js');

const GAME_NAME = 'baucua';
const JACKPOT_PERCENT = 0.05;

async function addToJackpot(guildId, totalBets) {
  const amount = Math.floor(totalBets * JACKPOT_PERCENT);
  if (amount > 0) {
    await JackpotModel.addAmount(guildId, GAME_NAME, amount);
  }
  return amount;
}

async function getJackpotBalance(guildId) {
  return JackpotModel.getBalance(guildId, GAME_NAME);
}

async function resetJackpot(guildId) {
  return JackpotModel.reset(guildId, GAME_NAME);
}

async function getJackpotEmbed(guildId) {
  const balance = await getJackpotBalance(guildId);
  return new EmbedBuilder()
    .setTitle('💎 HŨ BẦU CUA')
    .setDescription(`**${formatCoins(balance)}** 🪙`)
    .setColor(0xff69b4)
    .setTimestamp();
}

module.exports = {
  GAME_NAME,
  JACKPOT_PERCENT,
  addToJackpot,
  getJackpotBalance,
  resetJackpot,
  getJackpotEmbed,
};
