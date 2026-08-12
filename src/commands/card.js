// ═══════════════════════════════════════════
// COMMAND — /card (Tiến Lên Miền Nam, Tiến Lên, Sâm Lốc)
// ═══════════════════════════════════════════
// Flow: /card create <game> [bet] → join → start
// UI: button / select menu / (modal sẵn sàng mở rộng)

const { SlashCommandBuilder } = require('discord.js');
const { LobbyManager } = require('../games/card_games/lobby/manager');
const { getGame, getGameChoices } = require('../games/card_games/rules/registry');
const { CARD_GAME_CONFIG } = require('../games/card_games/config');
const { lobbyEmbed, tableEmbed } = require('../games/card_games/ui/embed');
const { lobbyButtons } = require('../games/card_games/ui/components');
const { formatCoins } = require('../utils/formatter');

function getMemberName(interaction) {
  return interaction.member?.displayName || interaction.user.username;
}

function parseCustomId(customId) {
  const parts = customId.split(':');
  return {
    action: parts[1] || null,
    id: parts[2] || null,
    payload: parts.slice(3).join(':'),
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('card')
    .setDescription('Chơi game bài: Tiến Lên, Sâm Lốc')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Tạo phòng chơi game bài')
        .addStringOption((option) =>
          option
            .setName('game')
            .setDescription('Chọn game bài')
            .setRequired(true)
            .addChoices(...getGameChoices())
        )
        .addIntegerOption((option) =>
          option
            .setName('bet')
            .setDescription(`Mức cược mỗi người (mặc định ${CARD_GAME_CONFIG.defaultBet} 🪙)`)
            .setMinValue(CARD_GAME_CONFIG.minBet)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('join').setDescription('Tham gia phòng chơi trong kênh này')
    )
    .addSubcommand((sub) =>
      sub.setName('leave').setDescription('Rời phòng chơi')
    )
    .addSubcommand((sub) =>
      sub.setName('start').setDescription('Bắt đầu ván (chỉ chủ phòng)')
    )
    .addSubcommand((sub) =>
      sub.setName('info').setDescription('Xem thông tin phòng / ván đang chơi')
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({
        content: '❌ Lệnh này chỉ dùng được trong server!',
        ephemeral: true,
      });
    }
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create':
        return this.handleCreate(interaction);
      case 'join':
        return this.handleJoin(interaction);
      case 'leave':
        return this.handleLeave(interaction);
      case 'start':
        return this.handleStart(interaction);
      case 'info':
        return this.handleInfo(interaction);
      default:
        return interaction.reply({ content: '❌ Lệnh không hợp lệ!', ephemeral: true });
    }
  },

  // ── /card create ──
  async handleCreate(interaction) {
    const gameType = interaction.options.getString('game');
    const bet = interaction.options.getInteger('bet') || CARD_GAME_CONFIG.defaultBet;

    if (bet < CARD_GAME_CONFIG.minBet) {
      return interaction.reply({
        content: `❌ Mức cược tối thiểu là **${formatCoins(CARD_GAME_CONFIG.minBet)}** 🪙!`,
        ephemeral: true,
      });
    }
    const rule = getGame(gameType);
    if (!rule) {
      return interaction.reply({ content: '❌ Game không tồn tại!', ephemeral: true });
    }

    try {
      const lobby = await LobbyManager.create({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        hostId: interaction.user.id,
        hostName: getMemberName(interaction),
        gameType,
        bet,
        client: interaction.client,
      });
      return interaction.reply({
        content:
          `✅ Đã tạo phòng **${rule.emoji} ${rule.name}**!\n` +
          `💰 Mức cược: **${formatCoins(bet)}** 🪙/người\n` +
          `🚪 Bấm nút **Tham gia** hoặc dùng \`/card join\` để vào phòng.`,
        ephemeral: true,
      });
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  },

  // ── /card join ──
  async handleJoin(interaction) {
    const lobby = LobbyManager.getLobby(interaction.guildId, interaction.channelId);
    if (!lobby) {
      return interaction.reply({
        content: '❌ Không có phòng nào trong kênh này! Dùng `/card create` để tạo phòng.',
        ephemeral: true,
      });
    }
    try {
      await LobbyManager.join(lobby, interaction.user.id, getMemberName(interaction));
      await LobbyManager.refreshLobbyMessage(lobby);
      return interaction.reply({ content: '✅ Bạn đã vào phòng!', ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  },

  // ── /card leave ──
  async handleLeave(interaction) {
    const lobby = LobbyManager.getLobby(interaction.guildId, interaction.channelId);
    if (!lobby) {
      return interaction.reply({ content: '❌ Không có phòng nào trong kênh này!', ephemeral: true });
    }
    try {
      const result = await LobbyManager.leave(lobby, interaction.user.id);
      if (!result) {
        // Phòng trống → đóng
        try {
          await lobby.message.edit({ content: '🚪 Phòng đã đóng — không có ai chơi.', embeds: [], components: [] });
        } catch (err) {
          console.error('[CardGames] close empty lobby:', err.message);
        }
        return interaction.reply({ content: '✅ Bạn đã rời phòng. Phòng đã đóng.', ephemeral: true });
      }
      await LobbyManager.refreshLobbyMessage(result);
      return interaction.reply({ content: '✅ Bạn đã rời phòng!', ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  },

  // ── /card start ──
  async handleStart(interaction) {
    const lobby = LobbyManager.getLobby(interaction.guildId, interaction.channelId);
    if (!lobby) {
      return interaction.reply({ content: '❌ Không có phòng nào trong kênh này!', ephemeral: true });
    }
    try {
      await interaction.deferReply({ ephemeral: true });
      const result = await LobbyManager.start(lobby, interaction);
      if (!result.ok && result.canceled) {
        const failedLines = result.failed
          .map((f) => `<@${f.discordId}>: ${f.reason}`)
          .join('\n');
        await LobbyManager.refreshLobbyMessage(lobby);
        return interaction.editReply({
          content: `❌ **Không đủ người chơi đủ coin!**\n${failedLines}\n\nPhòng vẫn mở — mời thêm người hoặc dùng \`/card leave\`.`,
        });
      }
      const removedLines = result.removed.length
        ? `\n⚠️ Đã loại người không đủ coin:\n${result.removed.map((f) => `• <@${f.discordId}>`).join('\n')}`
        : '';
      return interaction.editReply({
        content: `✅ **Ván đã bắt đầu!** 🎮\n🃏 Bài đã gửi riêng qua **DM** cho từng người chơi.${removedLines}`,
      });
    } catch (err) {
      try {
        return interaction.editReply({ content: `❌ ${err.message}` });
      } catch (e) {
        return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
      }
    }
  },

  // ── /card info ──
  async handleInfo(interaction) {
    const lobby = LobbyManager.getLobby(interaction.guildId, interaction.channelId);
    if (!lobby) {
      return interaction.reply({
        content: '❌ Không có phòng nào trong kênh này! Dùng `/card create` để tạo phòng.',
        ephemeral: true,
      });
    }
    const session = lobby.session;
    if (session && !session.ended) {
      return interaction.reply({ embeds: [tableEmbed(session)] });
    }
    const rule = getGame(lobby.gameType);
    return interaction.reply({ embeds: [lobbyEmbed(lobby, rule)] });
  },

  // ── Nút bấm ──
  async handleButton(interaction) {
    const { action, id, payload } = parseCustomId(interaction.customId);

    if (action === 'join' || action === 'leave' || action === 'start') {
      const lobby = LobbyManager.getLobbyById(id);
      if (!lobby) {
        return interaction.reply({ content: '❌ Phòng đã đóng!', ephemeral: true });
      }
      try {
        if (action === 'join') {
          await LobbyManager.join(lobby, interaction.user.id, getMemberName(interaction));
          await LobbyManager.refreshLobbyMessage(lobby);
          return interaction.reply({ content: '✅ Bạn đã vào phòng!', ephemeral: true });
        }
        if (action === 'leave') {
          const result = await LobbyManager.leave(lobby, interaction.user.id);
          if (!result) {
            try {
              await lobby.message.edit({ content: '🚪 Phòng đã đóng — không có ai chơi.', embeds: [], components: [] });
            } catch (err) {
              console.error('[CardGames] close empty lobby:', err.message);
            }
            return interaction.reply({ content: '✅ Bạn đã rời phòng. Phòng đã đóng.', ephemeral: true });
          }
          await LobbyManager.refreshLobbyMessage(result);
          return interaction.reply({ content: '✅ Bạn đã rời phòng!', ephemeral: true });
        }
        if (action === 'start') {
          await interaction.deferUpdate();
          const result = await LobbyManager.start(lobby, interaction);
          if (!result.ok && result.canceled) {
            await LobbyManager.refreshLobbyMessage(lobby);
            return interaction.followUp({
              content: '❌ **Không đủ người chơi đủ coin!** Phòng vẫn mở.',
              ephemeral: true,
            });
          }
          return interaction.followUp({ content: '✅ **Ván đã bắt đầu!** Bài đã gửi qua DM.', ephemeral: true });
        }
      } catch (err) {
        return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
      }
      return;
    }

    // Các nút thuộc phiên chơi (báo sâm / đánh bài / bỏ lượt)
    if (action === 'sam' || action === 'catch' || action === 'play' || action === 'pass' || action === 'reselect') {
      const session = LobbyManager.getSessionById(id);
      if (!session || session.ended) {
        return interaction.reply({ content: '❌ Phiên đã kết thúc!', ephemeral: true });
      }
      try {
        if (action === 'sam') return session.handleBaoSam(interaction);
        if (action === 'catch') return session.handleCatchSam(interaction);
        if (action === 'pass') return session.handlePass(interaction);
        if (action === 'reselect') return session.handleReselect(interaction);
        if (action === 'play') {
          const cardIds = payload.split(',').filter(Boolean);
          return session.handlePlay(interaction, cardIds);
        }
      } catch (err) {
        console.error('[CardGames] session button error:', err.message);
        return interaction.reply({ content: '❌ Lỗi hệ thống khi xử lý nước đi!', ephemeral: true });
      }
    }
  },

  // ── Select menu ──
  async handleSelectMenu(interaction) {
    const { action, id } = parseCustomId(interaction.customId);
    if (action !== 'select') return;
    const session = LobbyManager.getSessionById(id);
    if (!session || session.ended) {
      return interaction.reply({ content: '❌ Phiên đã kết thúc!', ephemeral: true });
    }
    try {
      return session.handleSelect(interaction);
    } catch (err) {
      console.error('[CardGames] select error:', err.message);
      return interaction.reply({ content: '❌ Lỗi hệ thống khi chọn bài!', ephemeral: true });
    }
  },

  // ── Modal (dự phòng cho mở rộng sau này) ──
  async handleModal(interaction) {
    const { action, id } = parseCustomId(interaction.customId);
    if (action !== 'modal') return;
    const session = LobbyManager.getSessionById(id);
    if (!session || session.ended) {
      return interaction.reply({ content: '❌ Phiên đã kết thúc!', ephemeral: true });
    }
  },
};
