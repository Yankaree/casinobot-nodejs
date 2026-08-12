const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const { GlobalTaixiuChannelModel, JackpotModel } = require('../database/models');
const GameSession = require('../games/global-taixiu/session');
const { getStatsEmbed, getJackpotEmbed } = require('../games/global-taixiu/stats');
const { refreshRegisteredChannels } = require('../games/global-taixiu/chat/listener');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');

let activeSession = null;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('globaltaixiu')
    .setDescription('Quản lý Tài Xỉu Global')
    .addSubcommand((sub) =>
      sub
        .setName('setchannel')
        .setDescription('Đăng ký kênh Global Chat Tài Xỉu')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Kênh để đăng ký Global Chat')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('removechannel')
        .setDescription('Gỡ kênh Global Chat Tài Xỉu')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Kênh cần gỡ')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('listchannels').setDescription('Xem danh sách kênh Global Chat')
    )
    .addSubcommand((sub) =>
      sub.setName('start').setDescription('Bắt đầu game Tài Xỉu Global')
    )
    .addSubcommand((sub) =>
      sub.setName('stop').setDescription('Dừng game Tài Xỉu Global')
    )
    .addSubcommand((sub) =>
      sub.setName('tieptuc').setDescription('Tiếp tục game sau khi tạm dừng')
    )
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('Xem thống kê Tài Xỉu Global')
    )
    .addSubcommand((sub) =>
      sub.setName('jackpot').setDescription('Xem hũ Tài Xỉu Global')
    )
    .addSubcommand((sub) =>
      sub
        .setName('addjackpot')
        .setDescription('Cộng tiền vào hũ Tài Xỉu Global')
        .addIntegerOption((option) =>
          option.setName('amount').setDescription('Số coin cộng vào hũ').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('bet')
        .setDescription('Đặt cược Tài Xỉu Global')
        .addStringOption((option) =>
          option
            .setName('choice')
            .setDescription('Chọn Tài hoặc Xỉu')
            .setRequired(true)
            .addChoices(
              { name: '📈 Tài', value: 'tai' },
              { name: '📉 Xỉu', value: 'xiu' }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription('Số coin đặt cược')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({
        content: '❌ Lệnh này chỉ dùng được trong server!',
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'listchannels') {
      const channels = await GlobalTaixiuChannelModel.getByGuild(interaction.guildId);
      if (channels.length === 0) {
        return interaction.reply({
          content: '⚠️ Chưa đăng ký kênh Global Chat nào!',
          ephemeral: true,
        });
      }
      const list = channels.map((c) => `<#${c.channel_id}>`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('🌐 Kênh Global Chat Tài Xỉu')
        .setDescription(list)
        .setColor(config.colors.info)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'stats') {
      const embed = await getStatsEmbed();
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'jackpot') {
      const embed = await getJackpotEmbed();
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'tieptuc') {
      if (!activeSession) {
        return interaction.reply({
          content: '⚠️ **Thông báo**\nGame chưa được bắt đầu!',
          ephemeral: true,
        });
      }
      if (!activeSession.isPaused) {
        return interaction.reply({
          content: '⚠️ **Thông báo**\nGame chưa tạm dừng!',
          ephemeral: true,
        });
      }
      await activeSession.resume(interaction.client);
      return interaction.reply({
        content: '✅ Đã tiếp tục game Tài Xỉu Global! 🎲',
      });
    }

    if (subcommand === 'bet') {
      return this.handleBet(interaction);
    }

    const isAdminConfig = config.adminUsers.includes(interaction.user.id);
    const isAdminDiscord = interaction.member.permissions.has(
      PermissionFlagsBits.Administrator
    );

    if (!isAdminConfig && !isAdminDiscord) {
      return interaction.reply({
        content: '❌ Chỉ admin mới dùng được lệnh này!',
        ephemeral: true,
      });
    }

    if (subcommand === 'setchannel') {
      const channel = interaction.options.getChannel('channel');
      const existing = await GlobalTaixiuChannelModel.isChannelRegistered(
        interaction.guildId,
        channel.id
      );
      if (existing) {
        return interaction.reply({
          content: `⚠️ ${channel} đã được đăng ký Global Chat!`,
          ephemeral: true,
        });
      }
      await GlobalTaixiuChannelModel.add(interaction.guildId, channel.id);
      await refreshRegisteredChannels();
      return interaction.reply({
        content: `✅ Đã đăng ký ${channel} cho Global Chat Tài Xỉu!`,
        ephemeral: true,
      });
    }

    if (subcommand === 'removechannel') {
      const channel = interaction.options.getChannel('channel');
      const existing = await GlobalTaixiuChannelModel.isChannelRegistered(
        interaction.guildId,
        channel.id
      );
      if (!existing) {
        return interaction.reply({
          content: `⚠️ ${channel} chưa được đăng ký Global Chat!`,
          ephemeral: true,
        });
      }
      await GlobalTaixiuChannelModel.remove(interaction.guildId, channel.id);
      await refreshRegisteredChannels();
      return interaction.reply({
        content: `✅ Đã gỡ ${channel} khỏi Global Chat!`,
        ephemeral: true,
      });
    }

    if (subcommand === 'start') {
      if (activeSession) {
        return interaction.reply({
          content: '❌ **Lỗi**\nGame đang chạy!',
          ephemeral: true,
        });
      }
      const channelIds = await GlobalTaixiuChannelModel.getAllChannelIds();
      if (channelIds.length === 0) {
        return interaction.reply({
          content:
            '❌ **Lỗi**\nChưa đăng ký kênh nào! Dùng `/globaltaixiu setchannel`',
          ephemeral: true,
        });
      }
      activeSession = new GameSession();
      try {
        await activeSession.start(interaction.client);
      } catch (err) {
        activeSession = null;
        throw err;
      }
      return interaction.reply({
        content: '✅ Đã bắt đầu game Tài Xỉu Global!',
        ephemeral: true,
      });
    }

    if (subcommand === 'stop') {
      if (activeSession) {
        activeSession.stop();
        activeSession = null;
        return interaction.reply({
          content: '✅ Đã dừng game Tài Xỉu Global!',
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: '⚠️ **Thông báo**\nGame chưa được bắt đầu!',
        ephemeral: true,
      });
    }

    if (subcommand === 'addjackpot') {
      const amount = interaction.options.getInteger('amount');
      if (amount <= 0) {
        return interaction.reply({ content: '❌ **Lỗi**\nSố coin phải lớn hơn 0!', ephemeral: true });
      }
      if (amount > 10000000000) {
        return interaction.reply({ content: '❌ **Lỗi**\nSố coin tối đa là **10,000,000,000**!', ephemeral: true });
      }
      await JackpotModel.addAmount('global', 'globaltaixiu', amount);
      const newBalance = await JackpotModel.getBalance('global', 'globaltaixiu');
      return interaction.reply({
        content:
          `✅ **Thành công**\n` +
          `Đã cộng **${formatCoins(amount)}** 🪙 vào hũ Tài Xỉu Global\n` +
          `💰 Hũ hiện tại: **${formatCoins(newBalance)}** 🪙`,
      });
    }
  },

  async handleBet(interaction) {
    try {
      if (!activeSession) {
        return interaction.reply({
          content:
            '❌ **Lỗi**\nPhiên cược chưa bắt đầu! Hãy chờ admin `/globaltaixiu start`',
          ephemeral: true,
        });
      }

      if (activeSession.isPaused) {
        return interaction.reply({
          content:
            '⏸️ **Tạm dừng**\nGame đang tạm dừng! Dùng `/globaltaixiu tieptuc` để tiếp tục',
          ephemeral: true,
        });
      }

      if (!activeSession.isActive) {
        return interaction.reply({
          content:
            '❌ **Lỗi**\nPhiên cược chưa bắt đầu! Hãy chờ admin `/globaltaixiu start`',
          ephemeral: true,
        });
      }

      const channelIds = await GlobalTaixiuChannelModel.getAllChannelIds();
      if (!channelIds.includes(interaction.channelId)) {
        return interaction.reply({
          content:
            '❌ **Lỗi**\nHãy đặt cược trong kênh Global Chat đã đăng ký!',
          ephemeral: true,
        });
      }

      const choice = interaction.options.getString('choice');
      const amount = interaction.options.getInteger('amount');

      if (amount < 1000) {
        return interaction.reply({
          content: '❌ **Lỗi**\nMức cược tối thiểu là **1,000** 🪙!',
          ephemeral: true,
        });
      }

      const result = await activeSession.addBet(
        interaction.user.id,
        interaction.guildId,
        choice,
        amount
      );
      if (!result.success) {
        return interaction.reply({
          content: `❌ **Lỗi**\n${result.message}`,
          ephemeral: true,
        });
      }

      const choiceText = choice === 'tai' ? '📈 TÀI' : '📉 XỈU';
      return interaction.reply({
        content: `✅ Đã đặt **${formatCoins(amount)}** 🪙 vào ${choiceText}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('[GlobalTX] Bet command error:', error);
      return interaction.reply({
        content:
          '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi khi xử lý đặt cược. Vui lòng thử lại!',
        ephemeral: true,
      });
    }
  },

  getActiveSession() {
    return activeSession;
  },
};
