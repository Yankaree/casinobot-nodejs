const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { TransactionModel } = require('../database/models');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');
const {
  getServerTop,
  isRateLimited,
  setCooldown,
  getGameLabel,
  formatRankLines,
} = require('../utils/leaderboardService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Xem bảng xếp hạng coin trong server')
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
        const stats = await TransactionModel.getUserStats(interaction.guildId, targetUser.id);
        const rank = await TransactionModel.getServerRank(interaction.guildId, targetUser.id);

        const totalGames = stats.wins + stats.losses;
        const winRate = totalGames > 0 ? Math.round((stats.wins / totalGames) * 100) : 0;

        const embed = new EmbedBuilder()
          .setTitle('🏆 THỐNG KÊ XẾP HẠNG SERVER')
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

      const top = await getServerTop(interaction.guildId);

      const embed = new EmbedBuilder()
        .setTitle('🏆 BẢNG XẾP HẠNG SERVER')
        .setDescription(`**Server:** ${interaction.guild.name}\n\n${formatRankLines(top)}`)
        .setColor(config.colors.primary)
        .setFooter({ text: `Dùng /leaderboard @user để xem thống kê riêng` })
        .setTimestamp();

      setCooldown(interaction.user.id);
      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Leaderboard command error:', error);
      return interaction.reply({
        content: '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi khi xem bảng xếp hạng. Vui lòng thử lại!',
        ephemeral: true,
      });
    }
  },
};
