const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, ModalBuilder } = require('discord.js');
const { ConfigModel, UserModel } = require('../database/models');
const GameSession = require('../games/taixiu/session');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');
const { showConfirmation } = require('../utils/betConfirm');

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

  // Handle button interactions for betting
  async handleButton(interaction) {
    const customId = interaction.customId;
    if (!customId.startsWith('taixiu_bet_')) return;

    const parts = customId.split('_');
    const choice = parts[2]; // 'tai' or 'xiu'
    const sessionId = parts[3];

    const session = activeSessions.get(interaction.guildId);
    if (!session) {
      return interaction.reply({ content: '❌ Phiên đã kết thúc!', ephemeral: true });
    }

    if (!session.isActive) {
      return interaction.reply({ content: '❌ Phiên đã đóng!', ephemeral: true });
    }

    if (session.isPaused) {
      return interaction.reply({ content: '⏸️ Game đang tạm dừng!', ephemeral: true });
    }

    if (session.bettors.has(interaction.user.id)) {
      return interaction.reply({ content: '❌ Bạn đã đặt cược rồi trong phiên này!', ephemeral: true });
    }

    // Get balance
    const balance = await UserModel.getBalance(interaction.guildId, interaction.user.id);

    // Show modal to enter amount
    const modal = new ModalBuilder()
      .setCustomId(`taixiu_modal_${choice}_${sessionId}`)
      .setTitle(`Đặt cược ${choice === 'tai' ? 'TÀI' : 'XỈU'}`);

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('💰 Nhập số tiền cược:')
      .setPlaceholder(`Số dư hiện tại: ${formatCoins(balance)} coin`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(20);

    const row = new ActionRowBuilder().addComponents(amountInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  },

  // Handle modal submission for betting
  async handleModal(interaction) {
    const customId = interaction.customId;
    if (!customId.startsWith('taixiu_modal_')) return;

    const parts = customId.split('_');
    const choice = parts[2]; // 'tai' or 'xiu'
    const sessionId = parts[3];

    const session = activeSessions.get(interaction.guildId);
    if (!session) {
      return interaction.reply({ content: '❌ Phiên đã kết thúc!', ephemeral: true });
    }

    if (!session.isActive) {
      return interaction.reply({ content: '❌ Phiên đã đóng!', ephemeral: true });
    }

    const amountStr = interaction.fields.getTextInputValue('amount');
    const amount = parseInt(amountStr.replace(/[.,\s]/g, ''), 10);

    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({ content: '❌ Số tiền không hợp lệ!', ephemeral: true });
    }

    if (amount < 1000) {
      return interaction.reply({ content: '❌ Mức cược tối thiểu là **1,000** 🪙!', ephemeral: true });
    }

    const balance = await UserModel.getBalance(interaction.guildId, interaction.user.id);
    if (balance < amount) {
      return interaction.reply({
        content: `❌ Không đủ coin!\n💰 Số dư hiện tại: **${formatCoins(balance)}** 🪙`,
        ephemeral: true,
      });
    }

    // Hiện UI xác nhận trước khi đặt cược thật
    return showConfirmation(interaction, {
      prefix: 'tx',
      emoji: '🎲',
      choiceLabel: choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU',
      amount,
      note: `💰 Số dư hiện tại: **${formatCoins(balance)}** 🪙`,
      onConfirm: async (confirmInteraction) => {
        const active = activeSessions.get(confirmInteraction.guildId);
        if (!active || !active.isActive) {
          return confirmInteraction.followUp({ content: '❌ Phiên đã kết thúc!', ephemeral: true });
        }
        const result = await active.addBet(confirmInteraction.user.id, choice, amount);
        if (!result.success) {
          return confirmInteraction.followUp({ content: `❌ ${result.message}`, ephemeral: true });
        }
        const choiceText = choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU';
        return confirmInteraction.followUp({
          content:
            `✅ Đặt cược thành công\n\n` +
            `Cửa: **${choiceText}**\n` +
            `Tiền cược: **${formatCoins(amount)}** 🪙\n` +
            `💰 Số dư còn lại: **${formatCoins(result.balance)}** 🪙`,
          ephemeral: true,
        });
      },
    });
  },

  getActiveSession(guildId) {
    return activeSessions.get(guildId);
  },
};
