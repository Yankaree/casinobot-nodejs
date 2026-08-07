const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { UserModel, ConfigModel } = require('../database/models');
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
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && !config.adminUsers.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Chỉ admin mới dùng được lệnh này!', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'givecoin') {
      const user = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      if (amount <= 0) {
        return interaction.reply({ content: '❌ Số coin phải lớn hơn 0!', ephemeral: true });
      }
      await UserModel.addCoins(user.id, amount);
      const newBalance = await UserModel.getBalance(user.id);
      return interaction.reply({
        content: `✅ Đã tặng **${formatCoins(amount)}** 🪙 cho ${user}\n💰 Số dư mới: **${formatCoins(newBalance)}** 🪙`,
      });
    }

    if (subcommand === 'resetjackpot') {
      await ConfigModel.resetJackpot(interaction.guildId);
      return interaction.reply({ content: '✅ Đã reset jackpot!' });
    }
  },
};
