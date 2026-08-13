const { SlashCommandBuilder } = require('discord.js');
const { ConfigModel } = require('../database/models');
const { getActiveSession } = require('./taixiu');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');
const { showConfirmation, handleConfirmationClick } = require('../utils/betConfirm');

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
    if (!interaction.guildId) {
      return interaction.reply({ content: '❌ Lệnh này chỉ dùng được trong server!', ephemeral: true });
    }
    try {
      const session = getActiveSession(interaction.guildId);
      const channelId = await ConfigModel.getChannel(interaction.guildId);

      if (!channelId) {
        return interaction.reply({
          content: '❌ **Lỗi**\nChưa đặt kênh Tài Xỉu! Hãy dùng /taixiu setchannel',
          ephemeral: true,
        });
      }

      if (interaction.channelId !== channelId) {
        return interaction.reply({
          content: `❌ **Lỗi**\nHãy đặt cược trong kênh Tài Xỉu! <#${channelId}>`,
          ephemeral: true,
        });
      }

      if (!session) {
        return interaction.reply({
          content: '❌ **Lỗi**\nPhiên cược chưa bắt đầu! Hãy chờ admin /taixiu start',
          ephemeral: true,
        });
      }

      if (session.isPaused) {
        return interaction.reply({
          content: '⏸️ **Tạm dừng**\nGame đang tạm dừng! Dùng /taixiu tieptuc để tiếp tục',
          ephemeral: true,
        });
      }

      if (!session.isActive) {
        return interaction.reply({
          content: '❌ **Lỗi**\nPhiên cược chưa bắt đầu! Hãy chờ admin /taixiu start',
          ephemeral: true,
        });
      }

      const choice = interaction.options.getString('choice');
      const amount = interaction.options.getInteger('amount');

      if (amount < 1000) {
        return interaction.reply({
          content: '❌ **Lỗi**\nMức cược tối thiểu là **1,000** 🪙!',
          ephemeral: true,
        });
      }

      // Hiện UI xác nhận trước khi đặt cược thật
      return showConfirmation(interaction, {
        prefix: 'tx',
        emoji: '🎲',
        choiceLabel: choice === 'tai' ? '📈 TÀI' : '📉 XỈU',
        amount,
        onConfirm: async (confirmInteraction) => {
          const active = getActiveSession(confirmInteraction.guildId);
          if (!active || !active.isActive) {
            return confirmInteraction.followUp({ content: '❌ Phiên đã kết thúc!', ephemeral: true });
          }
          if (active.isPaused) {
            return confirmInteraction.followUp({ content: '⏸️ Game đang tạm dừng!', ephemeral: true });
          }
          const result = await active.addBet(confirmInteraction.user.id, choice, amount);
          if (!result.success) {
            return confirmInteraction.followUp({ content: `❌ **Lỗi**\n${result.message}`, ephemeral: true });
          }
          const choiceText = choice === 'tai' ? '📈 TÀI' : '📉 XỈU';
          return confirmInteraction.followUp({
            content:
              `✅ **Đặt cược thành công!**\n` +
              `Cửa: **${choiceText}**\n` +
              `Tiền cược: **${formatCoins(amount)}** 🪙\n` +
              `💰 Số dư còn lại: **${formatCoins(result.balance ?? 0)}** 🪙`,
            ephemeral: true,
          });
        },
      });
    } catch (error) {
      console.error('Bet command error:', error);
      return interaction.reply({
        content: '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi khi xử lý đặt cược. Vui lòng thử lại!',
        ephemeral: true,
      });
    }
  },

  // Nút xác nhận đặt cược (confirm:tx:)
  async handleButton(interaction) {
    if (!interaction.customId.startsWith('confirm:tx:')) return;
    return handleConfirmationClick(interaction, 'tx');
  },
};
