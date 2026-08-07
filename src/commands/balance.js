const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel } = require('../database/models');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Xem số dư coin của bạn')
    .addUserOption((option) =>
      option.setName('user').setDescription('Xem số dư người khác').setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const user = await UserModel.getOrCreate(targetUser.id);

    const embed = new EmbedBuilder()
      .setTitle('💰 Số Dư Coin')
      .setDescription(`**${targetUser.username}**`)
      .addFields(
        { name: '🪙 Coin', value: formatCoins(user.coin), inline: true },
        { name: '🏆 Thắng', value: formatCoins(user.win_count), inline: true },
        { name: '💔 Thua', value: formatCoins(user.lose_count), inline: true }
      )
      .setColor(config.colors.primary)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
