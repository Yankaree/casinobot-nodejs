const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel, BetModel } = require('../database/models');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Xem profile và số dư coin của người chơi')
    .addUserOption((option) =>
      option.setName('user').setDescription('Xem profile người khác').setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const user = await UserModel.getOrCreate(targetUser.id);
    const betStats = await BetModel.getUserStats(targetUser.id);

    const totalGames = user.win_count + user.lose_count;
    const winRate = totalGames > 0 ? Math.round((user.win_count / totalGames) * 100) : 0;

    const embed = new EmbedBuilder()
      .setTitle('👤 Profile Người Chơi')
      .setDescription(`**${targetUser.username}**`)
      .addFields(
        { name: '🪙 Coin', value: formatCoins(user.coin), inline: true },
        { name: '🏆 Thắng', value: formatCoins(user.win_count), inline: true },
        { name: '💔 Thua', value: formatCoins(user.lose_count), inline: true },
        { name: '⭐ Tỉ lệ thắng', value: `${winRate}%`, inline: true },
        { name: '🎲 Tổng lượt cược', value: formatCoins(betStats.totalBets), inline: true },
        { name: '💰 Tiền thắng', value: `${formatCoins(betStats.totalWon)} 🪙`, inline: true },
        { name: '💸 Tiền thua', value: `${formatCoins(betStats.totalLost)} 🪙`, inline: true }
      )
      .setColor(config.colors.primary)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};