const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel, BetModel } = require('../database/models');
const { ConfigModel } = require('../database/models');
const { getActiveSession } = require('./taixiu');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bet')
    .setDescription('Đặt cược Tài Xỉu')
    .addStringOption((option) =>
      option
        .setName('choice')
        .setDescription('Chọn Tài hoặc Xỉu')
        .setRequired(true)
        .addChoices(
          { name: '📈 Tài', value: 'tai' },
          { name: '📉 Xỉu', value: 'xiu' }
        )
    )
    .addIntegerOption((option) =>
      option.setName('amount').setDescription('Số coin đặt cược').setRequired(true)
    ),

  async execute(interaction) {
    const session = getActiveSession(interaction.guildId);
    const channelId = await ConfigModel.getChannel(interaction.guildId);

    if (!channelId) {
      return interaction.reply({
        content: '❌ Chưa đặt kênh Tài Xỉu!',
        ephemeral: true,
      });
    }

    if (interaction.channelId !== channelId) {
      return interaction.reply({
        content: `❌ Hãy đặt cược trong kênh Tài Xỉu!`,
        ephemeral: true,
      });
    }

    if (!session || !session.isActive) {
      return interaction.reply({
        content: '❌ Phiên cược chưa bắt đầu!',
        ephemeral: true,
      });
    }

    const choice = interaction.options.getString('choice');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      return interaction.reply({
        content: '❌ Số tiền phải lớn hơn 0!',
        ephemeral: true,
      });
    }

    const balance = await UserModel.getBalance(interaction.user.id);
    if (balance < amount) {
      return interaction.reply({
        content: `❌ Không đủ coin! Số dư: **${formatCoins(balance)}** 🪙`,
        ephemeral: true,
      });
    }

    await UserModel.removeCoins(interaction.user.id, amount);

    const result = await session.addBet(interaction.user.id, choice, amount);
    if (!result.success) {
      await UserModel.addCoins(interaction.user.id, amount);
      return interaction.reply({
        content: `❌ ${result.message}`,
        ephemeral: true,
      });
    }

    const choiceText = choice === 'tai' ? '📈 TÀI' : '📉 XỈU';
    return interaction.reply({
      content: `✅ Đã đặt **${formatCoins(amount)}** 🪙 vào ${choiceText}`,
      ephemeral: true,
    });
  },
};
