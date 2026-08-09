const { SlashCommandBuilder } = require('discord.js');
const { UserModel, JackpotModel } = require('../database/models');
const { formatCoins } = require('../utils/formatter');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands')
    .addSubcommand((sub) =>
      sub
        .setName('givecoin')
        .setDescription('Tặng coin cho người chơi')
        .addUserOption((option) =>
          option.setName('user').setDescription('Người nhận').setRequired(true)
        )
        .addIntegerOption((option) =>
          option.setName('amount').setDescription('Số coin').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('resetjackpot').setDescription('Reset jackpot')
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: '❌ Lệnh này chỉ dùng được trong server!', ephemeral: true });
    }
    try {
      if (!config.adminUsers.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ **Lỗi quyền**\nChỉ admin mới dùng được lệnh này!', ephemeral: true });
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'givecoin') {
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        if (amount <= 0) {
          return interaction.reply({ content: '❌ **Lỗi**\nSố coin phải lớn hơn 0!', ephemeral: true });
        }
        if (amount > 10000000) {
          return interaction.reply({ content: '❌ **Lỗi**\nSố coin tối đa là **10,000,000**!', ephemeral: true });
        }
        await UserModel.addCoins(interaction.guildId, user.id, amount);
        const newBalance = await UserModel.getBalance(interaction.guildId, user.id);
        return interaction.reply({
          content: `✅ **Thành công**\nĐã tặng **${formatCoins(amount)}** 🪙 cho ${user}\n💰 Số dư mới: **${formatCoins(newBalance)}** 🪙`,
        });
      }

      if (subcommand === 'resetjackpot') {
        await JackpotModel.reset(interaction.guildId, 'taixiu');
        return interaction.reply({ content: '✅ **Thành công**\nĐã reset jackpot Tài Xỉu!' });
      }
    } catch (error) {
      console.error('Admin command error:', error);
      return interaction.reply({
        content: '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi khi xử lý. Vui lòng thử lại!',
        ephemeral: true,
      });
    }
  },
};
