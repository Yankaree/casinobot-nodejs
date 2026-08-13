const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { TransactionModel } = require('../database/models');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');
const {
  getGlobalTop,
  isRateLimited,
  setCooldown,
  getGameLabel,
  formatRankLines,
} = require('../utils/leaderboardService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('globalleaderboard')
    .setDescription('Xem bảng xếp hạng coin toàn bot (mọi server)')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Xem thống kê xếp hạng của người chơi cụ thể')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: '❌ Lệnh này chỉ dùng được trong server!', ephemeral: true });
    }

    if (isRateLimited(interaction.user.id)) {
      return interaction.reply({
        content: `⏳ **Chờ chút**\nVui lòng chờ **${Math.ceil(config.leaderboard.cooldownMs / 1000)} giây** trước khi dùng lại!`,
        ephemeral: true,
      });
    }

    try {
      const targetUser = interaction.options.getUser('user');

      if (targetUser) {
        const stats = await TransactionModel.getGlobalUserStats(targetUser.id);
        const rank = await TransactionModel.getGlobalRank(targetUser.id);

        const totalGames = stats.wins + stats.losses;
        const winRate = totalGames > 0 ? Math.round((stats.wins / totalGames) * 100) : 0;

        const embed = new EmbedBuilder()
          .setTitle('🌎 THỐNG KÊ XẾP HẠNG TOÀN BOT')
          .setDescription(`**${targetUser.username}**`)
          .addFields(
            { name: '📊 Xếp hạng', value: `#${rank}`, inline: true },
            { name: '💰 Tổng lãi/lỗ', value: `${stats.net >= 0 ? '+' : ''}${formatCoins(stats.net)} 🪙`, inline: true },
            { name: '🏆 Thắng', value: `${formatCoins(stats.wins)} ván`, inline: true },
            { name: '💔 Thua', value: `${formatCoins(stats.losses)} ván`, inline: true },
            { name: '📈 Tỷ lệ thắng', value: `${winRate}%`, inline: true },
            {
              name: '🎲 Trò chơi yêu thích',
              value: stats.favoriteGame ? getGameLabel(stats.favoriteGame) : 'Chưa chơi',
              inline: true,
            }
          )
          .setColor(config.colors.primary)
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp();

        setCooldown(interaction.user.id);
        return interaction.reply({ embeds: [embed] });
      }

      const top = await getGlobalTop();

      const embed = new EmbedBuilder()
        .setTitle('🌎 BẢNG XẾP HẠNG TOÀN BOT')
        .setDescription(formatRankLines(top))
        .setColor(config.colors.primary)
        .setFooter({ text: `Tính trên mọi server | Dùng /globalleaderboard @user để xem thống kê riêng` })
        .setTimestamp();

      setCooldown(interaction.user.id);
      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Global leaderboard command error:', error);
      return interaction.reply({
        content: '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi khi xem bảng xếp hạng. Vui lòng thử lại!',
        ephemeral: true,
      });
    }
  },
};
