const { SlashCommandBuilder } = require('discord.js');
const { getJackpotEmbed } = require('../games/taixiu/stats');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jackpot')
    .setDescription('Xem jackpot hiện tại'),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: '❌ Lệnh này chỉ dùng được trong server!', ephemeral: true });
    }
    const embed = await getJackpotEmbed(interaction.guildId);
    return interaction.reply({ embeds: [embed] });
  },
};
