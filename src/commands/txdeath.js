const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
} = require('discord.js');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');
const { showConfirmation, handleConfirmationClick } = require('../utils/betConfirm');
const { DeathmatchLobby } = require('../games/taixiu/deathmatch/lobby');
const DeathmatchSession = require('../games/taixiu/deathmatch/session');

// ⚔️ Tài Xỉu Deathmatch — RAM-only: lobby + trận + kết quả đều không lưu DB
const lobbies = new Map(); // guildId -> DeathmatchLobby
const matches = new Map(); // guildId -> DeathmatchSession
const lastResults = new Map(); // guildId -> finalRanking (hiển thị /txdeath leaderboard sau trận)

const MEDALS = ['🥇', '🥈', '🥉'];

function rankingEmbed(roomId, ranking) {
  const lines = ranking.map(
    (r, i) =>
      `${MEDALS[i] || '🏅'} <@${r.userId}> — **${formatCoins(r.battleCoin)}** BC · ` +
      `(${r.wins} thắng / ${r.losses} thua)${r.status === 'SPECTATOR' ? ' 👁️' : ''}`
  );
  return new EmbedBuilder()
    .setTitle('⚔️ BẢNG XẾP HẠNG — TÀI XỈU DEATHMATCH')
    .setDescription(`**Phòng ${roomId}** · ✅ Trận đã kết thúc\n\n${lines.join('\n')}`)
    .setColor(config.colors.info)
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('txdeath')
    .setDescription('Tài Xỉu Deathmatch — trận đấu Battle Coin')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Tạo phòng Deathmatch (chủ phòng)')
        .addIntegerOption((option) =>
          option
            .setName('initialcoin')
            .setDescription('Vốn Battle Coin mỗi người (mặc định 100,000)')
            .setMinValue(10000)
            .setMaxValue(100000000)
        )
        .addIntegerOption((option) =>
          option
            .setName('minutes')
            .setDescription('Thời gian trận (phút, mặc định 10)')
            .setMinValue(1)
            .setMaxValue(60)
        )
        .addIntegerOption((option) =>
          option
            .setName('maxplayers')
            .setDescription(`Số người tối đa (2-${config.deathmatch.maxPlayers}, mặc định 4)`)
            .setMinValue(2)
            .setMaxValue(config.deathmatch.maxPlayers)
        )
    )
    .addSubcommand((sub) => sub.setName('join').setDescription('Tham gia phòng Deathmatch'))
    .addSubcommand((sub) => sub.setName('leave').setDescription('Rời phòng Deathmatch'))
    .addSubcommand((sub) => sub.setName('start').setDescription('Bắt đầu trận (chủ phòng)'))
    .addSubcommand((sub) => sub.setName('end').setDescription('Kết thúc trận sớm (chủ phòng)'))
    .addSubcommand((sub) =>
      sub
        .setName('setcoin')
        .setDescription('Tự chỉnh Battle Coin của mình (chủ phòng/admin chỉnh được người khác)')
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription('Số Battle Coin muốn đặt')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(config.deathmatch.setCoinMax)
        )
        .addUserOption((option) =>
          option
            .setName('player')
            .setDescription('Người cần chỉnh (mặc định: chính bạn)')
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('bet')
        .setDescription('Đặt cược Battle Coin')
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
            .setDescription('Số Battle Coin đặt cược')
            .setRequired(true)
            .setMinValue(config.deathmatch.minBet)
        )
    )
    .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Bảng xếp hạng Battle Coin'))
    .addSubcommand((sub) => sub.setName('info').setDescription('Xem thông tin phòng/trận')),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: '❌ Lệnh này chỉ dùng được trong server!', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // ── CREATE ────────────────────────────────
    if (subcommand === 'create') {
      if (lobbies.has(guildId) || matches.has(guildId)) {
        return interaction.reply({
          content: '❌ **Lỗi**\nĐã có phòng hoặc trận Deathmatch đang hoạt động trong server này!',
          ephemeral: true,
        });
      }
      if (!interaction.channel || !interaction.channel.isTextBased()) {
        return interaction.reply({
          content: '❌ **Lỗi**\nHãy tạo phòng trong kênh văn bản!',
          ephemeral: true,
        });
      }

      const initialCoin = interaction.options.getInteger('initialcoin') ?? config.deathmatch.defaultInitialCoin;
      const minutes = interaction.options.getInteger('minutes') ?? config.deathmatch.defaultMinutes;
      const maxPlayers = interaction.options.getInteger('maxplayers') ?? config.deathmatch.defaultMaxPlayers;

      const lobby = new DeathmatchLobby({
        guildId,
        channelId: interaction.channelId,
        hostId: interaction.user.id,
        initialCoin,
        minutes,
        maxPlayers,
      });
      lobby.addPlayer(interaction.user.id, interaction.user.username);
      lobbies.set(guildId, lobby);

      return interaction.reply({
        content: `✅ **Đã tạo phòng ${lobby.roomId}!**\nDùng \`/txdeath join\` để mời bạn bè, chủ phòng dùng \`/txdeath start\` khi đủ người.`,
        embeds: [lobby.toEmbed()],
      });
    }

    // ── JOIN ──────────────────────────────────
    if (subcommand === 'join') {
      const lobby = lobbies.get(guildId);
      if (!lobby) {
        return interaction.reply({ content: '❌ **Lỗi**\nKhông có phòng nào! Hãy dùng `/txdeath create`', ephemeral: true });
      }
      if (lobby.status !== 'open') {
        return interaction.reply({ content: '❌ **Lỗi**\nPhòng đã khóa/đã bắt đầu!', ephemeral: true });
      }
      if (lobby.players.has(interaction.user.id)) {
        return interaction.reply({ content: '❌ Bạn đã ở trong phòng rồi!', ephemeral: true });
      }
      if (lobby.isFull()) {
        return interaction.reply({ content: `❌ Phòng đã đầy (${lobby.maxPlayers} người)!`, ephemeral: true });
      }
      lobby.addPlayer(interaction.user.id, interaction.user.username);
      return interaction.reply({
        content: `✅ **${interaction.user.username}** đã vào phòng **${lobby.roomId}**!`,
        embeds: [lobby.toEmbed()],
      });
    }

    // ── LEAVE ─────────────────────────────────
    if (subcommand === 'leave') {
      const lobby = lobbies.get(guildId);
      if (!lobby) {
        return interaction.reply({ content: '❌ **Lỗi**\nKhông có phòng nào!', ephemeral: true });
      }
      if (!lobby.players.has(interaction.user.id)) {
        return interaction.reply({ content: '❌ Bạn không ở trong phòng!', ephemeral: true });
      }
      if (interaction.user.id === lobby.hostId) {
        lobbies.delete(guildId);
        return interaction.reply({
          content: '❌ Chủ phòng đã rời — **phòng đã bị đóng!** Hãy tạo phòng mới.',
          ephemeral: true,
        });
      }
      lobby.removePlayer(interaction.user.id);
      return interaction.reply({
        content: `✅ Bạn đã rời phòng **${lobby.roomId}**!`,
        embeds: [lobby.toEmbed()],
      });
    }

    // ── START ─────────────────────────────────
    if (subcommand === 'start') {
      const lobby = lobbies.get(guildId);
      if (!lobby) {
        return interaction.reply({ content: '❌ **Lỗi**\nKhông có phòng nào! Hãy dùng `/txdeath create`', ephemeral: true });
      }
      if (interaction.user.id !== lobby.hostId) {
        return interaction.reply({ content: '❌ Chỉ chủ phòng mới được start trận!', ephemeral: true });
      }
      if (lobby.status !== 'open') {
        return interaction.reply({ content: '❌ **Lỗi**\nPhòng đã khóa!', ephemeral: true });
      }
      if (lobby.playerCount() < config.deathmatch.minPlayersToStart) {
        return interaction.reply({
          content: `❌ Cần tối thiểu **${config.deathmatch.minPlayersToStart} người** để bắt đầu (hiện: ${lobby.playerCount()})!`,
          ephemeral: true,
        });
      }

      // Khóa lobby, clone player list → session, cấp Battle Coin
      lobby.lock();
      const players = new Map(lobby.players);
      lobbies.delete(guildId);

      const session = new DeathmatchSession(lobby, players);
      session.once('finished', (s) => {
        matches.delete(guildId);
        lastResults.set(guildId, s.finalRanking);
      });
      matches.set(guildId, session);

      try {
        await session.start(interaction.client);
      } catch (err) {
        matches.delete(guildId);
        throw err;
      }

      return interaction.reply({
        content:
          `✅ **Trận ${lobby.roomId} bắt đầu!**\n\n` +
          `💰 Mỗi chiến binh nhận **${formatCoins(lobby.initialCoin)}** Battle Coin\n` +
          `⏱️ Trận kéo dài **${lobby.minutes} phút** — hết giờ là FINAL ROUND\n` +
          `👥 **${players.size}** chiến binh tham chiến — chúc may mắn! ⚔️`,
      });
    }

    // ── END (kết thúc sớm — chủ phòng) ────────
    if (subcommand === 'end') {
      const match = matches.get(guildId);
      if (!match) {
        return interaction.reply({ content: '❌ **Lỗi**\nKhông có trận nào đang chạy!', ephemeral: true });
      }
      const isHost = interaction.user.id === match.hostId;
      const isAdminConfig = config.adminUsers.includes(interaction.user.id);
      const isAdminDiscord = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!isHost && !isAdminConfig && !isAdminDiscord) {
        return interaction.reply({ content: '❌ Chỉ chủ phòng hoặc admin mới kết thúc được trận!', ephemeral: true });
      }
      const result = await match.endMatchEarly(interaction.client);
      return interaction.reply({ content: result.message, ephemeral: true });
    }

    // ── SETCOIN (tự chỉnh Battle Coin) ────────
    if (subcommand === 'setcoin') {
      const match = matches.get(guildId);
      if (!match) {
        return interaction.reply({ content: '❌ **Lỗi**\nKhông có trận nào đang chạy!', ephemeral: true });
      }

      const amount = interaction.options.getInteger('amount');
      const target = interaction.options.getUser('player');
      const targetId = target ? target.id : interaction.user.id;

      if (target) {
        // Chỉnh người khác → cần chủ phòng/admin
        const isHost = interaction.user.id === match.hostId;
        const isAdminConfig = config.adminUsers.includes(interaction.user.id);
        const isAdminDiscord = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isHost && !isAdminConfig && !isAdminDiscord) {
          return interaction.reply({ content: '❌ Chỉ chủ phòng hoặc admin mới chỉnh được Battle Coin người khác!', ephemeral: true });
        }
      } else if (!match.players.has(interaction.user.id)) {
        return interaction.reply({ content: '❌ Bạn không tham gia trận này!', ephemeral: true });
      }

      const res = match.setBattleCoin(targetId, amount);
      if (!res.success) {
        return interaction.reply({ content: `❌ **Lỗi**\n${res.message}`, ephemeral: true });
      }

      const who = target ? `**${target.username}**` : 'Bạn';
      const statusText = res.status === 'ACTIVE' ? '⚔️ ACTIVE' : '👁️ SPECTATOR';
      return interaction.reply({
        content:
          `✅ **Đã chỉnh Battle Coin!**\n` +
          `${who} giờ có **${formatCoins(res.balance)}** Battle Coin · ${statusText}`,
        ephemeral: true,
      });
    }

    // ── BET ───────────────────────────────────
    if (subcommand === 'bet') {
      return this.handleBet(interaction);
    }

    // ── LEADERBOARD ───────────────────────────
    if (subcommand === 'leaderboard') {
      const match = matches.get(guildId);
      if (match) {
        return interaction.reply({ embeds: [match.getLeaderboardEmbed()] });
      }
      const last = lastResults.get(guildId);
      if (last) {
        return interaction.reply({ embeds: [rankingEmbed('(trận trước)', last)] });
      }
      return interaction.reply({ content: '⚠️ Chưa có trận Deathmatch nào!', ephemeral: true });
    }

    // ── INFO ──────────────────────────────────
    if (subcommand === 'info') {
      const match = matches.get(guildId);
      if (match) {
        return interaction.reply({ embeds: [match.getInfoEmbed()] });
      }
      const lobby = lobbies.get(guildId);
      if (lobby) {
        return interaction.reply({ embeds: [lobby.toEmbed()] });
      }
      return interaction.reply({ content: '⚠️ Không có phòng hoặc trận Deathmatch nào!', ephemeral: true });
    }
  },

  // ── /txdeath bet ────────────────────────────
  async handleBet(interaction) {
    try {
      const match = matches.get(interaction.guildId);
      if (!match) {
        return interaction.reply({
          content: '❌ **Lỗi**\nKhông có trận nào đang chạy! Hãy tạo phòng `/txdeath create` → `/txdeath start`',
          ephemeral: true,
        });
      }
      if (interaction.channelId !== match.channelId) {
        return interaction.reply({
          content: `❌ **Lỗi**\nHãy đặt cược trong kênh trận đấu! <#${match.channelId}>`,
          ephemeral: true,
        });
      }
      if (!match.isActive) {
        return interaction.reply({ content: '❌ **Lỗi**\nRound đang đóng — chờ round mới!', ephemeral: true });
      }

      const player = match.players.get(interaction.user.id);
      if (!player) {
        return interaction.reply({ content: '❌ Bạn không tham gia trận này!', ephemeral: true });
      }
      if (player.status !== 'ACTIVE') {
        return interaction.reply({ content: '👁️ Bạn là **SPECTATOR** — không thể đặt cược!', ephemeral: true });
      }

      const choice = interaction.options.getString('choice');
      const amount = interaction.options.getInteger('amount');
      const choiceText = choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU';

      // UI xác nhận trước khi đặt cược thật
      return showConfirmation(interaction, {
        prefix: 'dm',
        emoji: '⚔️',
        choiceLabel: choiceText,
        amount,
        note: `💰 Battle Coin hiện tại: **${formatCoins(player.battleCoin)}**`,
        onConfirm: async (confirmInteraction) => {
          const active = matches.get(confirmInteraction.guildId);
          if (!active || !active.isActive) {
            return confirmInteraction.followUp({ content: '❌ Round đã kết thúc!', ephemeral: true });
          }
          const result = await active.addBet(confirmInteraction.user.id, choice, amount);
          if (!result.success) {
            return confirmInteraction.followUp({ content: `❌ **Lỗi**\n${result.message}`, ephemeral: true });
          }
          return confirmInteraction.followUp({
            content:
              `✅ **Đặt cược thành công!**\n` +
              `Cửa: **${choiceText}**\n` +
              `Cược: **${formatCoins(amount)}** Battle Coin\n` +
              `💰 Còn lại: **${formatCoins(result.balance)}** Battle Coin`,
            ephemeral: true,
          });
        },
      });
    } catch (error) {
      console.error('[TXDeath] Bet command error:', error);
      return interaction.reply({
        content: '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi khi xử lý đặt cược. Vui lòng thử lại!',
        ephemeral: true,
      });
    }
  },

  // ── Buttons: nút TÀI/XỈU + nút xác nhận cược ──
  async handleButton(interaction) {
    const customId = interaction.customId;

    // Nút xác nhận đặt cược Deathmatch (confirm:dm:)
    if (customId.startsWith('confirm:dm:')) {
      return handleConfirmationClick(interaction, 'dm');
    }

    if (!customId.startsWith('txdeath_bet_')) return;

    const parts = customId.split('_');
    const choice = parts[2]; // 'tai' | 'xiu'
    const roundNumber = parts[3];

    const match = matches.get(interaction.guildId);
    if (!match) {
      return interaction.reply({ content: '❌ Trận đã kết thúc!', ephemeral: true });
    }
    if (!match.isActive) {
      return interaction.reply({ content: '❌ Round đã đóng!', ephemeral: true });
    }

    const player = match.players.get(interaction.user.id);
    if (!player) {
      return interaction.reply({ content: '❌ Bạn không tham gia trận này!', ephemeral: true });
    }
    if (player.status !== 'ACTIVE') {
      return interaction.reply({ content: '👁️ Bạn là **SPECTATOR** — không thể đặt cược!', ephemeral: true });
    }
    if (match.bettors.has(interaction.user.id)) {
      return interaction.reply({ content: '❌ Bạn đã đặt cược round này rồi!', ephemeral: true });
    }

    // Modal nhập số Battle Coin (giống luồng Tài Xỉu thường)
    const modal = new ModalBuilder()
      .setCustomId(`txdeath_modal_${choice}_${roundNumber}`)
      .setTitle(`Đặt cược ${choice === 'tai' ? 'TÀI' : 'XỈU'} — Battle Coin`);

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('💰 Nhập số Battle Coin:')
      .setPlaceholder(`Battle Coin hiện tại: ${formatCoins(player.battleCoin)}`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(20);

    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

    await interaction.showModal(modal);
  },

  // ── Modal nhập số tiền cược ─────────────────
  async handleModal(interaction) {
    const customId = interaction.customId;
    if (!customId.startsWith('txdeath_modal_')) return;

    const parts = customId.split('_');
    const choice = parts[2]; // 'tai' | 'xiu'
    const roundNumber = parts[3];

    const match = matches.get(interaction.guildId);
    if (!match) {
      return interaction.reply({ content: '❌ Trận đã kết thúc!', ephemeral: true });
    }
    if (!match.isActive) {
      return interaction.reply({ content: '❌ Round đã đóng!', ephemeral: true });
    }

    const player = match.players.get(interaction.user.id);
    if (!player) {
      return interaction.reply({ content: '❌ Bạn không tham gia trận này!', ephemeral: true });
    }
    if (player.status !== 'ACTIVE') {
      return interaction.reply({ content: '👁️ Bạn là **SPECTATOR** — không thể đặt cược!', ephemeral: true });
    }

    const amountStr = interaction.fields.getTextInputValue('amount');
    const amount = parseInt(amountStr.replace(/[.,\s]/g, ''), 10);

    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({ content: '❌ Số tiền không hợp lệ!', ephemeral: true });
    }
    if (amount < config.deathmatch.minBet) {
      return interaction.reply({
        content: `❌ Mức cược tối thiểu là **${formatCoins(config.deathmatch.minBet)}** Battle Coin!`,
        ephemeral: true,
      });
    }

    const choiceText = choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU';

    // UI xác nhận trước khi đặt cược thật
    return showConfirmation(interaction, {
      prefix: 'dm',
      emoji: '⚔️',
      choiceLabel: choiceText,
      amount,
      note: `💰 Battle Coin hiện tại: **${formatCoins(player.battleCoin)}**`,
      onConfirm: async (confirmInteraction) => {
        const active = matches.get(confirmInteraction.guildId);
        if (!active || !active.isActive) {
          return confirmInteraction.followUp({ content: '❌ Round đã kết thúc!', ephemeral: true });
        }
        const result = await active.addBet(confirmInteraction.user.id, choice, amount);
        if (!result.success) {
          return confirmInteraction.followUp({ content: `❌ ${result.message}`, ephemeral: true });
        }
        return confirmInteraction.followUp({
          content:
            `✅ Đặt cược thành công\n\n` +
            `Cửa: **${choiceText}**\n` +
            `Cược: **${formatCoins(amount)}** Battle Coin\n` +
            `💰 Còn lại: **${formatCoins(result.balance)}** Battle Coin`,
          ephemeral: true,
        });
      },
    });
  },

  getActiveMatch(guildId) {
    return matches.get(guildId);
  },
};
