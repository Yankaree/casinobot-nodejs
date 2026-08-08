const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { ConfigModel } = require('../database/models');
const GameSession = require('../games/taixiu/session');
const config = require('../config');

const activeSessions = new Map();
const startLocks = new Map();

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
    )
    .addSubcommand((sub) =>
      sub.setName('tieptuc').setDescription('Tiếp tục game sau khi tạm dừng')
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: '❌ Lệnh này chỉ dùng được trong server!', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'stats') {
      const { getStatsEmbed } = require('../games/taixiu/stats');
      const embed = await getStatsEmbed(interaction.guildId);
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'tieptuc') {
      const session = activeSessions.get(interaction.guildId);
      if (!session) {
        return interaction.reply({ content: '⚠️ **Thông báo**\nGame chưa được bắt đầu!', ephemeral: true });
      }
      if (!session.isPaused) {
        return interaction.reply({ content: '⚠️ **Thông báo**\nGame chưa tạm dừng!', ephemeral: true });
      }
      await session.resume(interaction.client);
      return interaction.reply({ content: '✅ Đã tiếp tục game Tài Xỉu! 🎲' });
    }

    const isAdminConfig = config.adminUsers.includes(interaction.user.id);
    const isAdminDiscord = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    
    if (!isAdminConfig && !isAdminDiscord) {
      return interaction.reply({ content: '❌ Chỉ admin mới dùng được lệnh này!', ephemeral: true });
    }

    if (subcommand === 'setchannel') {
      const channel = interaction.options.getChannel('channel');
      await ConfigModel.setChannel(interaction.guildId, channel.id);
      return interaction.reply({ content: `✅ Đã đặt kênh Tài Xỉu: ${channel}`, ephemeral: true });
    }

    if (subcommand === 'start') {
      if (startLocks.has(interaction.guildId)) {
        return interaction.reply({ content: '⏳ **Đang xử lý**\nVui lòng chờ giây lát...', ephemeral: true });
      }
      
      startLocks.set(interaction.guildId, true);
      
      try {
        const channelId = await ConfigModel.getChannel(interaction.guildId);
        if (!channelId) {
          return interaction.reply({ content: '❌ **Lỗi**\nChưa đặt kênh Tài Xỉu! Dùng `/taixiu setchannel`', ephemeral: true });
        }
        if (activeSessions.has(interaction.guildId)) {
          return interaction.reply({ content: '❌ **Lỗi**\nGame đang chạy!', ephemeral: true });
        }
        const session = new GameSession(interaction.guildId, channelId);
        activeSessions.set(interaction.guildId, session);
        try {
          await session.start(interaction.client);
        } catch (err) {
          activeSessions.delete(interaction.guildId);
          throw err;
        }
        return interaction.reply({ content: '✅ Đã bắt đầu game Tài Xỉu!', ephemeral: true });
      } finally {
        startLocks.delete(interaction.guildId);
      }
    }

    if (subcommand === 'stop') {
      const session = activeSessions.get(interaction.guildId);
      if (session) {
        session.stop();
        activeSessions.delete(interaction.guildId);
        return interaction.reply({ content: '✅ Đã dừng game Tài Xỉu!', ephemeral: true });
      }
      return interaction.reply({ content: '⚠️ **Thông báo**\nGame chưa được bắt đầu!', ephemeral: true });
    }
  },

  getActiveSession(guildId) {
    return activeSessions.get(guildId);
  },
};
