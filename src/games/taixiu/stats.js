const { SessionModel } = require('../../database/models');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { formatCoins } = require('../../utils/formatter');

function getStatsEmbed(guildId) {
  const stats = SessionModel.getStats(guildId);
  const recent = SessionModel.getRecent(guildId, 20);

  const taiPercent = stats.total > 0 ? Math.round((stats.tai / stats.total) * 100) : 0;
  const xiuPercent = stats.total > 0 ? Math.round((stats.xiu / stats.total) * 100) : 0;

  const recentResults = recent
    .slice(0, 10)
    .map((s) => `${s.result === 'tai' ? '📈' : '📉'} #${s.id}`)
    .join(' ');

  return new EmbedBuilder()
    .setTitle('📊 THỐNG KÊ TÀI XỈU')
    .setDescription(`**Tổng số ván: ${stats.total}**`)
    .addFields(
      {
        name: '📈 TÀI',
        value: `${formatCoins(stats.tai)} ván (${taiPercent}%)`,
        inline: true,
      },
      {
        name: '📉 XỈU',
        value: `${formatCoins(stats.xiu)} ván (${xiuPercent}%)`,
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

function getJackpotEmbed(guildId) {
  const jackpot = require('../../database/models').ConfigModel.getJackpot(guildId);

  return new EmbedBuilder()
    .setTitle('💰 HŨ HIỆN TẠI')
    .setDescription(`**${formatCoins(jackpot)}** 🪙`)
    .setColor(config.colors.primary)
    .setTimestamp();
}

module.exports = { getStatsEmbed, getJackpotEmbed };
