const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { closeDb } = require('../database/database');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shutdown')
    .setDescription('Tắt bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && !config.adminUsers.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Chỉ admin mới dùng được lệnh này!', ephemeral: true });
    }

    await interaction.reply('🛑 Đang tắt bot...');

    closeDb().finally(() => {
      interaction.client.destroy();
      process.exit(0);
    });
  },
};