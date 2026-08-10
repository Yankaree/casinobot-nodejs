const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const { getSession, createSession, deleteSession, MIN_PLAYERS, MAX_PLAYERS } = require('../games/werewolf/session');
const { getAllRoles, getRole } = require('../games/werewolf/roles');
const { WerewolfLobbyModel, WerewolfHistoryModel } = require('../database/models');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ww')
    .setDescription('Minigame Ma Sói')
    .addSubcommand((sub) =>
      sub.setName('create').setDescription('Tạo lobby Ma Sói')
    )
    .addSubcommand((sub) =>
      sub.setName('join').setDescription('Tham gia lobby Ma Sói')
    )
    .addSubcommand((sub) =>
      sub.setName('leave').setDescription('Rời lobby Ma Sói')
    )
    .addSubcommand((sub) =>
      sub.setName('start').setDescription('Bắt đầu game Ma Sói')
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Xem trạng thái lobby')
    )
    .addSubcommand((sub) =>
      sub.setName('stop').setDescription('Dừng game Ma Sói')
    )
    .addSubcommand((sub) =>
      sub.setName('roles').setDescription('Xem danh sách role')
    )
    .addSubcommand((sub) =>
      sub
        .setName('kill')
        .setDescription('[Sói] Giết người (ban đêm)')
        .addUserOption((option) =>
          option.setName('target').setDescription('Mục tiêu').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('heal')
        .setDescription('[Bác sĩ] Cứu người (ban đêm)')
        .addUserOption((option) =>
          option.setName('target').setDescription('Mục tiêu').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('investigate')
        .setDescription('[Thầy bói] Soi role (ban đêm)')
        .addUserOption((option) =>
          option.setName('target').setDescription('Mục tiêu').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('guard')
        .setDescription('[Vệ sĩ] Bảo vệ (ban đêm)')
        .addUserOption((option) =>
          option.setName('target').setDescription('Mục tiêu').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('vote')
        .setDescription('Bầu chọn loại người (ban ngày)')
        .addUserOption((option) =>
          option.setName('target').setDescription('Người muốn loại').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('docto')
        .setDescription('[Dược sư] Độc tố (ban ngày)')
        .addUserOption((option) =>
          option.setName('target').setDescription('Mục tiêu').setRequired(true)
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

    switch (subcommand) {
      case 'create':
        return this.handleCreate(interaction);
      case 'join':
        return this.handleJoin(interaction);
      case 'leave':
        return this.handleLeave(interaction);
      case 'start':
        return this.handleStart(interaction);
      case 'status':
        return this.handleStatus(interaction);
      case 'stop':
        return this.handleStop(interaction);
      case 'roles':
        return this.handleRoles(interaction);
      case 'kill':
        return this.handleKill(interaction);
      case 'heal':
        return this.handleHeal(interaction);
      case 'investigate':
        return this.handleInvestigate(interaction);
      case 'guard':
        return this.handleGuard(interaction);
      case 'vote':
        return this.handleVote(interaction);
      case 'docto':
        return this.handleDocto(interaction);
      default:
        return interaction.reply({
          content: '❌ Lệnh không hợp lệ!',
          ephemeral: true,
        });
    }
  },

  async handleCreate(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const existing = getSession(lobbyId);
    if (existing) {
      return interaction.reply({
        content: '❌ Đã có lobby trong channel này!',
        ephemeral: true,
      });
    }

    const session = createSession(
      interaction.guildId,
      interaction.channelId,
      interaction.user.id
    );
    if (!session) {
      return interaction.reply({
        content: '❌ Không thể tạo lobby!',
        ephemeral: true,
      });
    }

    const result = session.addPlayer(interaction.user.id);
    if (!result.success) {
      deleteSession(lobbyId);
      return interaction.reply({
        content: `❌ ${result.message}`,
        ephemeral: true,
      });
    }

    await WerewolfLobbyModel.create(
      interaction.guildId,
      interaction.channelId,
      lobbyId
    );

    const embed = new EmbedBuilder()
      .setTitle('🐺 MA SÓI - LOBBY')
      .setDescription(
        `**Lobby đã được tạo!**\n\n` +
        `Người tạo: <@${interaction.user.id}>\n` +
        `Số người: **${session.players.length}/${MAX_PLAYERS}**\n\n` +
        `Cần ít nhất **${MIN_PLAYERS}** người để bắt đầu.\n\n` +
        `Dùng \`/ww join\` để tham gia!\n` +
        `Dùng \`/ww start\` để bắt đầu game!`
      )
      .setColor(0x8b0000)
      .setTimestamp();

    session.lobbyMessage = await interaction.reply({ embeds: [embed], fetchReply: true });
  },

  async handleJoin(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);

    if (!session) {
      return interaction.reply({
        content: '❌ Không có lobby trong channel này! Dùng `/ww create`',
        ephemeral: true,
      });
    }

    const result = session.addPlayer(interaction.user.id);
    if (!result.success) {
      return interaction.reply({ content: result.message, ephemeral: true });
    }

    await interaction.reply({
      content: `✅ <@${interaction.user.id}> đã tham gia lobby! (${session.players.length}/${MAX_PLAYERS})`,
    });

    await this.updateLobbyMessage(session);
  },

  async handleLeave(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);

    if (!session) {
      return interaction.reply({
        content: '❌ Không có lobby trong channel này!',
        ephemeral: true,
      });
    }

    const result = session.removePlayer(interaction.user.id);
    if (!result.success) {
      return interaction.reply({ content: result.message, ephemeral: true });
    }

    const wasCreator = session.creatorId !== interaction.user.id;
    await interaction.reply({
      content: `✅ <@${interaction.user.id}> đã rời lobby. (${session.players.length}/${MAX_PLAYERS})` +
        (wasCreator ? `\n👑 <@${session.creatorId}> là người tạo mới.` : ''),
    });

    if (session.players.length === 0) {
      deleteSession(lobbyId);
      await WerewolfLobbyModel.setStatus(lobbyId, 'empty');
      await interaction.followUp({ content: '🗑️ Lobby trống, đã xóa.' });
      return;
    }

    await this.updateLobbyMessage(session);
  },

  async handleStart(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);

    if (!session) {
      return interaction.reply({
        content: '❌ Không có lobby trong channel này!',
        ephemeral: true,
      });
    }

    if (session.creatorId !== interaction.user.id) {
      return interaction.reply({
        content: '❌ Chỉ người tạo lobby mới có thể bắt đầu!',
        ephemeral: true,
      });
    }

    // Register gameEnd listener BEFORE start
    session.once('gameEnd', async (data) => {
      await WerewolfHistoryModel.create(
        data.guildId,
        data.winner,
        data.players,
        data.days,
        data.duration
      );
      deleteSession(lobbyId);
      await WerewolfLobbyModel.setStatus(lobbyId, 'ended');
    });

    const result = await session.start(interaction.client);
    if (!result.success) {
      session.removeAllListeners('gameEnd');
      return interaction.reply({ content: result.message, ephemeral: true });
    }

    await WerewolfLobbyModel.setStatus(lobbyId, 'playing');

    await interaction.reply({
      content: '🐺 **Game Ma Sói đã bắt đầu!**\nKiểm tra DM để xem role của bạn!',
      ephemeral: true,
    });
  },

  async handleStatus(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);

    if (!session) {
      return interaction.reply({
        content: '❌ Không có lobby trong channel này!',
        ephemeral: true,
      });
    }

    const status = session.getStatus();

    const embed = new EmbedBuilder()
      .setTitle('🐺 TRẠNG THÁI MA SÓI')
      .setDescription(
        `**Phase:** ${status.phase}\n` +
        `**Ngày:** ${status.day}\n` +
        `**Người chơi:** ${status.playerCount}\n` +
        `**Sống:** ${status.aliveCount} | **Chết:** ${status.deadCount}\n\n` +
        `**Danh sách:**\n` +
        session.players
          .map((p) => {
            const icon = p.alive ? '✅' : '💀';
            return `${icon} <@${p.userId}>`;
          })
          .join('\n')
      )
      .setColor(0x8b0000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async handleStop(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);

    if (!session) {
      return interaction.reply({
        content: '❌ Không có lobby trong channel này!',
        ephemeral: true,
      });
    }

    if (
      session.creatorId !== interaction.user.id &&
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: '❌ Chỉ người tạo lobby hoặc admin mới có thể dừng!',
        ephemeral: true,
      });
    }

    deleteSession(lobbyId);
    await WerewolfLobbyModel.setStatus(lobbyId, 'stopped');

    await interaction.reply({
      content: '🛑 Game Ma Sói đã dừng!',
    });
  },

  async handleRoles(interaction) {
    const roles = getAllRoles();
    const teamText = { werewolf: '🐺 Sói', villager: '🧑‍🌾 Dân làng', neutral: '⚖️ Trung lập' };

    const desc = roles
      .map(
        (r) =>
          `${r.emoji} **${r.name}** (${teamText[r.team]})\n${r.description}`
      )
      .join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle('📋 DANH SÁCH ROLE')
      .setDescription(desc)
      .setColor(0x8b0000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async handleKill(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);
    if (!session) return interaction.reply({ content: '❌ Không có game!', ephemeral: true });

    const target = interaction.options.getUser('target');
    const result = session.submitNightAction(interaction.user.id, 'kill', target.id);

    await interaction.reply({ content: result.success ? `🐺 Đã chọn <@${target.id}> làm mục tiêu.` : result.message, ephemeral: true });
  },

  async handleHeal(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);
    if (!session) return interaction.reply({ content: '❌ Không có game!', ephemeral: true });

    const target = interaction.options.getUser('target');
    const result = session.submitNightAction(interaction.user.id, 'heal', target.id);

    await interaction.reply({ content: result.success ? `🩺 Đã chọn cứu <@${target.id}>.` : result.message, ephemeral: true });
  },

  async handleInvestigate(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);
    if (!session) return interaction.reply({ content: '❌ Không có game!', ephemeral: true });

    const target = interaction.options.getUser('target');
    const result = session.submitNightAction(interaction.user.id, 'investigate', target.id);

    await interaction.reply({ content: result.success ? `🔮 Đã chọn soi <@${target.id}>.` : result.message, ephemeral: true });
  },

  async handleGuard(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);
    if (!session) return interaction.reply({ content: '❌ Không có game!', ephemeral: true });

    const target = interaction.options.getUser('target');
    const result = session.submitNightAction(interaction.user.id, 'guard', target.id);

    await interaction.reply({ content: result.success ? `🛡️ Đã chọn bảo vệ <@${target.id}>.` : result.message, ephemeral: true });
  },

  async handleVote(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);
    if (!session) return interaction.reply({ content: '❌ Không có game!', ephemeral: true });

    const target = interaction.options.getUser('target');
    const result = session.submitVote(interaction.user.id, target.id);

    await interaction.reply({ content: result.success ? `🗳️ Đã bầu <@${target.id}>.` : result.message, ephemeral: true });
  },

  async handleDocto(interaction) {
    const lobbyId = `${interaction.guildId}_${interaction.channelId}`;
    const session = getSession(lobbyId);
    if (!session) return interaction.reply({ content: '❌ Không có game!', ephemeral: true });

    const target = interaction.options.getUser('target');
    const result = session.usePoison(interaction.user.id, target.id);

    await interaction.reply({ content: result.success ? `☠️ Độc tố đã được sử dụng.` : result.message, ephemeral: true });
  },

  async updateLobbyMessage(session) {
    if (!session.lobbyMessage) return;
    try {
      const embed = new EmbedBuilder()
        .setTitle('🐺 MA SÓI - LOBBY')
        .setDescription(
          `**Lobby Ma Sói**\n\n` +
          `Người tạo: <@${session.creatorId}>\n` +
          `Số người: **${session.players.length}/${MAX_PLAYERS}**\n\n` +
          `**Người chơi:**\n` +
          session.players.map((p) => `<@${p.userId}>`).join(', ') +
          `\n\nCần ít nhất **${MIN_PLAYERS}** người.\n` +
          `Dùng \`/ww join\` để tham gia!`
        )
        .setColor(0x8b0000)
        .setTimestamp();

      await session.lobbyMessage.edit({ embeds: [embed] });
    } catch {}
  },
};
