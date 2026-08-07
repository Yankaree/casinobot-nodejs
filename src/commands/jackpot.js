const { SlashCommandBuilder } = require('discord.js');
const { getJackpotEmbed } = require('../games/taixiu/stats');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jackpot')
    .setDescription('Xem jackpot hiện tại'),

  async execute(interaction) {
    const embed = getJackpotEmbed(interaction.guildId);
    return interaction.reply({ embeds: [embed] });
  },
};
