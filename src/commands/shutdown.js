const { SlashCommandBuilder } = require('discord.js');
const { closeDb } = require('../database/database');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shutdown')
    .setDescription('Tắt bot'),

  async execute(interaction) {
    try {
      if (!config.adminUsers.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ **Lỗi quyền**\nChỉ admin mới dùng được lệnh này!', ephemeral: true });
      }

      await interaction.reply('🛑 **Đang tắt bot...**\nVui lòng chờ giây lát...');

      closeDb().finally(() => {
        interaction.client.destroy();
        process.exit(0);
      });
    } catch (error) {
      console.error('Shutdown command error:', error);
      return interaction.reply({
        content: '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi khi tắt bot!',
        ephemeral: true,
      });
    }
  },
};