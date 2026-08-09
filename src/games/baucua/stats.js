const { BaucuaSessionModel, JackpotModel } = require('../../database/models');
const { EmbedBuilder } = require('discord.js');
const { ANIMALS } = require('./engine');
const { GAME_NAME } = require('./jackpot');
const { formatCoins, formatProgressBar } = require('../../utils/formatter');
const config = require('../../config');

async function getStatsEmbed(guildId) {
  const stats = await BaucuaSessionModel.getStats(guildId);
  const recent = await BaucuaSessionModel.getRecent(guildId, 20);
  const animalFreq = await BaucuaSessionModel.getAnimalFrequency(guildId);
  const topWinners = await BaucuaSessionModel.getTopWinner(guildId, 5);
  const totalPayout = await BaucuaSessionModel.getTotalPayout(guildId);

  const freqMap = {};
  animalFreq.forEach((r) => { freqMap[r.animal] = r.count; });

  const totalSlots = animalFreq.reduce((sum, r) => sum + r.count, 0);

  const animalLines = ANIMALS.map((a) => {
    const count = freqMap[a.name] || 0;
    const percent = totalSlots > 0 ? Math.round((count / totalSlots) * 100) : 0;
    const bar = formatProgressBar(count, totalSlots || 1, 10);
    return `${a.emoji} ${a.label}\n${bar} ${percent}%`;
  });

  const recentResults = recent
    .slice(0, 10)
    .map((s) => `${s.result_1 === s.result_2 && s.result_2 === s.result_3 ? '💎' : '🎲'} #${s.id}`)
    .join(' ');

  const winnerLines = topWinners.length > 0
    ? topWinners.map((w, i) =>
      `${i + 1}. <@${w.discord_id}> - ${formatCoins(w.total_payout)} 🪙 (${w.win_count} lần)`
    ).join('\n')
    : 'Chưa có dữ liệu';

  return new EmbedBuilder()
    .setTitle('📊 THỐNG KÊ BẦU CUA')
    .setDescription(`**Tổng số ván: ${stats.total}** | **Tổng thưởng đã trả: ${formatCoins(totalPayout)} 🪙**`)
    .addFields(
      {
        name: '🎯 Tần suất biểu tượng',
        value: animalLines.join('\n\n'),
        inline: false,
      },
      {
        name: '🏆 Top người thắng',
        value: winnerLines,
        inline: false,
      },
      {
        name: '🎯 10 Phiên gần nhất',
        value: recentResults || 'Chưa có dữ liệu',
        inline: false,
      }
    )
    .setColor(0xff69b4)
    .setTimestamp();
}

module.exports = { getStatsEmbed };
