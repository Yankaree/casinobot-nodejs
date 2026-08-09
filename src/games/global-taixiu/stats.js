const { GlobalTaixiuSessionModel, JackpotModel } = require('../../database/models');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { formatCoins } = require('../../utils/formatter');

const GLOBAL_KEY = 'global';
const GAME_NAME = 'globaltaixiu';

async function getStatsEmbed() {
  const stats = await GlobalTaixiuSessionModel.getStats();
  const recent = await GlobalTaixiuSessionModel.getRecent(20);

  const taiPercent = stats.total > 0 ? Math.round((stats.tai / stats.total) * 100) : 0;
  const xiuPercent = stats.total > 0 ? Math.round((stats.xiu / stats.total) * 100) : 0;

  const recentResults = recent
    .slice(0, 10)
    .map((s) => `${s.result === 'tai' ? '📈' : '📉'} #${s.id}`)
    .join(' ');

  return new EmbedBuilder()
    .setTitle('📊 THỐNG KÊ TÀI XỈU GLOBAL')
    .setDescription(`**Tổng số ván: ${stats.total}**`)
    .addFields(
      {
        name: '📈 TÀI',
        value: `${stats.tai} ván (${taiPercent}%)`,
        inline: true,
      },
      {
        name: '📉 XỈU',
        value: `${stats.xiu} ván (${xiuPercent}%)`,
        inline: true,
      },
      {
        name: '🎯 10 Phiên gần nhất',
        value: recentResults || 'Chưa có dữ liệu',
        inline: false,
      }
    )
    .setColor(config.colors.info)
    .setTimestamp();
}

async function getJackpotEmbed() {
  const jackpot = await JackpotModel.getBalance(GLOBAL_KEY, GAME_NAME);

  return new EmbedBuilder()
    .setTitle('💰 HŨ TÀI XỈU GLOBAL')
    .setDescription(`**${formatCoins(jackpot)}** 🪙`)
    .setColor(config.colors.primary)
    .setTimestamp();
}

module.exports = { getStatsEmbed, getJackpotEmbed };
