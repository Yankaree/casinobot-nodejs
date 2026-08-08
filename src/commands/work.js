const crypto = require('crypto');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel } = require('../database/models');
const config = require('../config');
const { formatCoins, formatTime } = require('../utils/formatter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Đi làm kiếm thêm coin'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: '❌ Lệnh này chỉ dùng được trong server!', ephemeral: true });
    }

    try {
      const lastWork = await UserModel.getLastWork(interaction.guildId, interaction.user.id);
      if (lastWork) {
        try {
          let lastTs;
          if (lastWork instanceof Date) {
            lastTs = lastWork.getTime();
          } else if (typeof lastWork === 'string') {
            lastTs = new Date(lastWork.replace(' ', 'T')).getTime();
          } else {
            lastTs = Date.now();
          }
          
          if (!isNaN(lastTs)) {
            const remainingMs = config.work.cooldownMs - (Date.now() - lastTs);
            if (remainingMs > 0) {
              return interaction.reply({
                content: `⏳ **Nghỉ ngơi**\nBạn cần nghỉ ngơi! Hãy quay lại sau **${formatTime(Math.ceil(remainingMs / 1000))}**`,
                ephemeral: true,
              });
            }
          }
        } catch (e) {
          console.error('Error parsing work timestamp:', e);
        }
      }

      const reward = crypto.randomInt(config.work.minReward, config.work.maxReward + 1);
      await UserModel.addCoins(interaction.guildId, interaction.user.id, reward);
      await UserModel.setLastWork(
        interaction.guildId,
        interaction.user.id,
        new Date().toISOString().slice(0, 19).replace('T', ' ')
      );

      const balance = await UserModel.getBalance(interaction.guildId, interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle('💼 ĐI LÀM')
        .setDescription(
          `**${interaction.user.username}** đã hoàn thành công việc!`
        )
        .addFields(
          { name: '💰 Lương nhận được', value: `+${formatCoins(reward)} 🪙`, inline: true },
          { name: '🪙 Số dư mới', value: `${formatCoins(balance)} 🪙`, inline: true },
          {
            name: '⏱️ Lần làm việc tiếp theo',
            value: `Sau **${formatTime(Math.ceil(config.work.cooldownMs / 1000))}**`,
            inline: false,
          }
        )
        .setColor(config.colors.success)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Work command error:', error);
      return interaction.reply({
        content: '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi khi xử lý. Vui lòng thử lại!',
        ephemeral: true,
      });
    }
  },
};
