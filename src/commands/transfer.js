// ═══════════════════════════════════════════
// COMMAND — /transfer (chuyển coin cho người chơi khác trong server)
// ═══════════════════════════════════════════
// Coin theo server (per-guild): cả người gửi lẫn người nhận dùng số dư
// trong chính server đang gõ lệnh. Ghi 2 giao dịch (type 'reward',
// game 'transfer') cho bảng thống kê.

const { SlashCommandBuilder } = require('discord.js');
const { UserModel, TransactionModel } = require('../database/models');
const { formatCoins } = require('../utils/formatter');

const MAX_TRANSFER = 1_000_000_000; // tối đa 1 tỷ / lần chuyển

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Chuyển coin cho người chơi khác trong server')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Người nhận coin')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Số coin chuyển')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({
        content: '❌ Lệnh này chỉ dùng được trong server!',
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (target.id === interaction.user.id) {
      return interaction.reply({
        content: '❌ **Lỗi**\nBạn không thể chuyển coin cho chính mình!',
        ephemeral: true,
      });
    }
    if (!amount || amount <= 0) {
      return interaction.reply({
        content: '❌ **Lỗi**\nSố coin phải lớn hơn 0!',
        ephemeral: true,
      });
    }
    if (amount > MAX_TRANSFER) {
      return interaction.reply({
        content: `❌ **Lỗi**\nSố coin tối đa mỗi lần chuyển là **${formatCoins(MAX_TRANSFER)}** 🪙!`,
        ephemeral: true,
      });
    }

    try {
      const balance = await UserModel.getBalance(interaction.guildId, interaction.user.id);
      if (balance < amount) {
        return interaction.reply({
          content:
            `❌ **Không đủ coin!**\n` +
            `💰 Số dư hiện tại: **${formatCoins(balance)}** 🪙`,
          ephemeral: true,
        });
      }

      // Trừ người gửi, cộng người nhận (cùng server)
      await UserModel.removeCoins(interaction.guildId, interaction.user.id, amount);
      await UserModel.addCoins(interaction.guildId, target.id, amount);

      await TransactionModel.record({
        guildId: interaction.guildId,
        discordId: interaction.user.id,
        amount: -amount,
        type: 'reward',
        game: 'transfer',
      });
      await TransactionModel.record({
        guildId: interaction.guildId,
        discordId: target.id,
        amount,
        type: 'reward',
        game: 'transfer',
      });

      const newSender = await UserModel.getBalance(interaction.guildId, interaction.user.id);
      const newTarget = await UserModel.getBalance(interaction.guildId, target.id);

      return interaction.reply({
        content:
          `✅ **Chuyển coin thành công!**\n` +
          `💸 Đã chuyển **${formatCoins(amount)}** 🪙 cho ${target}\n` +
          `💰 Số dư của bạn: **${formatCoins(newSender)}** 🪙\n` +
          `💰 Số dư của ${target.username}: **${formatCoins(newTarget)}** 🪙`,
      });
    } catch (error) {
      console.error('Transfer command error:', error);
      return interaction.reply({
        content: '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi khi chuyển coin. Vui lòng thử lại!',
        ephemeral: true,
      });
    }
  },
};
