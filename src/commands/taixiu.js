const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { ConfigModel } = require('../database/models');
const GameSession = require('../games/taixiu/session');
const config = require('../config');

const activeSessions = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('taixiu')
    .setDescription('Quản lý game Tài Xỉu')
    .addSubcommand((sub) =>
      sub
        .setName('setchannel')
        .setDescription('Đặt kênh chơi Tài Xỉu')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Kênh để chơi Tài Xỉu')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('start').setDescription('Bắt đầu game Tài Xỉu')
    )
    .addSubcommand((sub) =>
      sub.setName('stop').setDescription('Dừng game Tài Xỉu')
    )
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('Xem thống kê Tài Xỉu')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && !config.adminUsers.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Chỉ admin mới dùng được lệnh này!', ephemeral: true });
    }

    if (subcommand === 'setchannel') {
      const channel = interaction.options.getChannel('channel');
      ConfigModel.setChannel(interaction.guildId, channel.id);
      return interaction.reply({ content: `✅ Đã đặt kênh Tài Xỉu: ${channel}`, ephemeral: true });
    }

    if (subcommand === 'start') {
      const channelId = ConfigModel.getChannel(interaction.guildId);
      if (!channelId) {
        return interaction.reply({ content: '❌ Chưa đặt kênh Tài Xỉu! Dùng `/taixiu setchannel`', ephemeral: true });
      }
      if (activeSessions.has(interaction.guildId)) {
        return interaction.reply({ content: '❌ Game đang chạy!', ephemeral: true });
      }
      const session = new GameSession(interaction.guildId, channelId);
      activeSessions.set(interaction.guildId, session);
      await session.start(interaction.client);
      return interaction.reply({ content: '✅ Đã bắt đầu game Tài Xỉu!', ephemeral: true });
    }

    if (subcommand === 'stop') {
      const session = activeSessions.get(interaction.guildId);
      if (session) {
        session.stop();
        activeSessions.delete(interaction.guildId);
      }
      return interaction.reply({ content: '✅ Đã dừng game Tài Xỉu!', ephemeral: true });
    }

    if (subcommand === 'stats') {
      const { getStatsEmbed } = require('../games/taixiu/stats');
      const embed = getStatsEmbed(interaction.guildId);
      return interaction.reply({ embeds: [embed] });
    }
  },

  getActiveSession(guildId) {
    return activeSessions.get(guildId);
  },
};
