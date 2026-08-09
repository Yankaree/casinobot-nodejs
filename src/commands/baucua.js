const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const { ConfigModel } = require('../database/models');
const GameSession = require('../games/baucua/session');
const { ANIMALS } = require('../games/baucua/engine');
const { getJackpotEmbed, resetJackpot } = require('../games/baucua/jackpot');
const { getStatsEmbed } = require('../games/baucua/stats');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');

const activeSessions = new Map();
const startLocks = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('baucua')
    .setDescription('Quản lý game Bầu Cua')
    .addSubcommand((sub) =>
      sub
        .setName('setchannel')
        .setDescription('Đặt kênh chơi Bầu Cua')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Kênh để chơi Bầu Cua')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('start').setDescription('Bắt đầu game Bầu Cua')
    )
    .addSubcommand((sub) =>
      sub.setName('stop').setDescription('Dừng game Bầu Cua')
    )
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('Xem thống kê Bầu Cua')
    )
    .addSubcommand((sub) =>
      sub.setName('tieptuc').setDescription('Tiếp tục game sau khi tạm dừng')
    )
    .addSubcommand((sub) =>
      sub
        .setName('bet')
        .setDescription('Đặt cược Bầu Cua')
        .addStringOption((option) =>
          option
            .setName('animal')
            .setDescription('Chọn biểu tượng')
            .setRequired(true)
            .addChoices(
              { name: '🥣 Bầu', value: 'bau' },
              { name: '🦀 Cua', value: 'cua' },
              { name: '🦐 Tôm', value: 'tom' },
              { name: '🐟 Cá', value: 'ca' },
              { name: '🐓 Gà', value: 'ga' },
              { name: '🦌 Nai', value: 'nai' }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription('Số coin đặt cược')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('jackpot').setDescription('Xem hũ Bầu Cua')
    )
    .addSubcommand((sub) =>
      sub.setName('resetjackpot').setDescription('Reset hũ Bầu Cua')
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({
        content: '❌ Lệnh này chỉ dùng được trong server!',
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'stats') {
      const embed = await getStatsEmbed(interaction.guildId);
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'jackpot') {
      const embed = await getJackpotEmbed(interaction.guildId);
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'tieptuc') {
      const session = activeSessions.get(interaction.guildId);
      if (!session) {
        return interaction.reply({
          content: '⚠️ **Thông báo**\nGame chưa được bắt đầu!',
          ephemeral: true,
        });
      }
      if (!session.isPaused) {
        return interaction.reply({
          content: '⚠️ **Thông báo**\nGame chưa tạm dừng!',
          ephemeral: true,
        });
      }
      await session.resume(interaction.client);
      return interaction.reply({
        content: '✅ Đã tiếp tục game Bầu Cua! 🦀',
      });
    }

    const isAdminConfig = config.adminUsers.includes(interaction.user.id);
    const isAdminDiscord = interaction.member.permissions.has(
      PermissionFlagsBits.Administrator
    );

    if (subcommand === 'bet') {
      return this.handleBet(interaction);
    }

    if (subcommand === 'resetjackpot') {
      if (!isAdminConfig && !isAdminDiscord) {
        return interaction.reply({
          content: '❌ Chỉ admin mới dùng được lệnh này!',
          ephemeral: true,
        });
      }
      await resetJackpot(interaction.guildId);
      return interaction.reply({
        content: '✅ **Thành công**\nĐã reset hũ Bầu Cua!',
      });
    }

    if (!isAdminConfig && !isAdminDiscord) {
      return interaction.reply({
        content: '❌ Chỉ admin mới dùng được lệnh này!',
        ephemeral: true,
      });
    }

    if (subcommand === 'setchannel') {
      const channel = interaction.options.getChannel('channel');
      await ConfigModel.setBaucuaChannel(interaction.guildId, channel.id);
      return interaction.reply({
        content: `✅ Đã đặt kênh Bầu Cua: ${channel}`,
        ephemeral: true,
      });
    }

    if (subcommand === 'start') {
      if (startLocks.has(interaction.guildId)) {
        return interaction.reply({
          content: '⏳ **Đang xử lý**\nVui lòng chờ giây lát...',
          ephemeral: true,
        });
      }

      startLocks.set(interaction.guildId, true);

      try {
        const channelId = await ConfigModel.getBaucuaChannel(
          interaction.guildId
        );
        if (!channelId) {
          return interaction.reply({
            content:
              '❌ **Lỗi**\nChưa đặt kênh Bầu Cua! Dùng `/baucua setchannel`',
            ephemeral: true,
          });
        }
        if (activeSessions.has(interaction.guildId)) {
          return interaction.reply({
            content: '❌ **Lỗi**\nGame đang chạy!',
            ephemeral: true,
          });
        }
        const session = new GameSession(
          interaction.guildId,
          channelId
        );
        activeSessions.set(interaction.guildId, session);
        try {
          await session.start(interaction.client);
        } catch (err) {
          activeSessions.delete(interaction.guildId);
          throw err;
        }
        return interaction.reply({
          content: '✅ Đã bắt đầu game Bầu Cua!',
          ephemeral: true,
        });
      } finally {
        startLocks.delete(interaction.guildId);
      }
    }

    if (subcommand === 'stop') {
      const session = activeSessions.get(interaction.guildId);
      if (session) {
        session.stop();
        activeSessions.delete(interaction.guildId);
        return interaction.reply({
          content: '✅ Đã dừng game Bầu Cua!',
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: '⚠️ **Thông báo**\nGame chưa được bắt đầu!',
        ephemeral: true,
      });
    }
  },

  async handleBet(interaction) {
    try {
      const session = activeSessions.get(interaction.guildId);
      const channelId = await ConfigModel.getBaucuaChannel(
        interaction.guildId
      );

      if (!channelId) {
        return interaction.reply({
          content:
            '❌ **Lỗi**\nChưa đặt kênh Bầu Cua! Hãy dùng `/baucua setchannel`',
          ephemeral: true,
        });
      }

      if (interaction.channelId !== channelId) {
        return interaction.reply({
          content: `❌ **Lỗi**\nHãy đặt cược trong kênh Bầu Cua! <#${channelId}>`,
          ephemeral: true,
        });
      }

      if (!session) {
        return interaction.reply({
          content:
            '❌ **Lỗi**\nPhiên cược chưa bắt đầu! Hãy chờ admin `/baucua start`',
          ephemeral: true,
        });
      }

      if (session.isPaused) {
        return interaction.reply({
          content:
            '⏸️ **Tạm dừng**\nGame đang tạm dừng! Dùng `/baucua tieptuc` để tiếp tục',
          ephemeral: true,
        });
      }

      if (!session.isActive) {
        return interaction.reply({
          content:
            '❌ **Lỗi**\nPhiên cược chưa bắt đầu! Hãy chờ admin `/baucua start`',
          ephemeral: true,
        });
      }

      const animal = interaction.options.getString('animal');
      const amount = interaction.options.getInteger('amount');

      if (amount < 1000) {
        return interaction.reply({
          content: '❌ **Lỗi**\nMức cược tối thiểu là **1,000** 🪙!',
          ephemeral: true,
        });
      }

      const result = await session.addBet(
        interaction.user.id,
        animal,
        amount
      );
      if (!result.success) {
        return interaction.reply({
          content: `❌ **Lỗi**\n${result.message}`,
          ephemeral: true,
        });
      }

      const animalInfo = ANIMALS.find((a) => a.name === animal);
      return interaction.reply({
        content: `✅ Đã đặt **${formatCoins(amount)}** 🪙 vào ${animalInfo.emoji} ${animalInfo.label}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('[Baucua] Bet command error:', error);
      return interaction.reply({
        content:
          '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi khi xử lý đặt cược. Vui lòng thử lại!',
        ephemeral: true,
      });
    }
  },

  getActiveSession(guildId) {
    return activeSessions.get(guildId);
  },
};
