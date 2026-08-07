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
    const lastWork = await UserModel.getLastWork(interaction.user.id);
    if (lastWork) {
      const lastTs = new Date(lastWork.replace(' ', 'T')).getTime();
      const remainingMs = config.work.cooldownMs - (Date.now() - lastTs);
      if (remainingMs > 0) {
        return interaction.reply({
          content: `⏳ Bạn cần nghỉ ngơi! Hãy quay lại sau **${formatTime(Math.ceil(remainingMs / 1000))}**`,
          ephemeral: true,
        });
      }
    }

    const reward = crypto.randomInt(config.work.minReward, config.work.maxReward + 1);
    await UserModel.addCoins(interaction.user.id, reward);
    await UserModel.setLastWork(
      interaction.user.id,
      new Date().toISOString().slice(0, 19).replace('T', ' ')
    );

    const balance = await UserModel.getBalance(interaction.user.id);

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
  },
};