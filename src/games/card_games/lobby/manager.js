// ═══════════════════════════════════════════
// LOBBY — Quản lý phòng chơi & phiên (toàn bộ trong RAM)
// ═══════════════════════════════════════════
// Mỗi kênh một phòng. Mỗi phòng một phiên chơi.
// Restart bot → xóa hết phòng đang mở (nhất quán với các game khác).

const { UserModel } = require('../../../database/models');
const { CardSession } = require('../session');
const { getGame, calculateMaxPlayers } = require('../rules/registry');
const { refundBets } = require('../betting/manager');
const { lobbyEmbed } = require('../ui/embed');
const { lobbyButtons } = require('../ui/components');
const { formatCoins } = require('../../../utils/formatter');

// cardSessions = { gameId, players, hands, turn, state, bet } — lưu RAM, không lưu DB
const lobbies = new Map(); // `${guildId}:${channelId}` → lobby
const byId = new Map(); // lobby.id → lobby
const sessionsById = new Map(); // session.id → CardSession

function generateId(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

const LobbyManager = {
  key(guildId, channelId) {
    return `${guildId}:${channelId}`;
  },

  getLobby(guildId, channelId) {
    return lobbies.get(this.key(guildId, channelId)) || null;
  },

  getLobbyById(id) {
    return byId.get(id) || null;
  },

  getSessionById(id) {
    return sessionsById.get(id) || null;
  },

  getSession(guildId, channelId) {
    const lobby = this.getLobby(guildId, channelId);
    return lobby && lobby.session ? lobby.session : null;
  },

  // ── Tạo phòng ──
  async create({ guildId, channelId, hostId, hostName, gameType, bet, client }) {
    if (lobbies.has(this.key(guildId, channelId))) {
      throw new Error('Đã có một phòng chơi trong kênh này!');
    }
    const rule = getGame(gameType);
    if (!rule) {
      throw new Error('Game không tồn tại!');
    }

    const lobby = {
      id: `L${generateId(7)}`,
      guildId,
      channelId,
      gameType,
      bet,
      hostId,
      status: 'open', // open | starting | playing
      players: [hostId],
      playerNames: { [hostId]: hostName || hostId },
      message: null,
      session: null,
      createdAt: Date.now(),
    };

    lobbies.set(this.key(guildId, channelId), lobby);
    byId.set(lobby.id, lobby);

    const channel = client.channels.cache.get(channelId);
    if (!channel) throw new Error('Không tìm thấy kênh!');
    lobby.message = await channel.send({
      embeds: [lobbyEmbed(lobby, rule)],
      components: lobbyButtons(lobby.id),
    });
    return lobby;
  },

  // ── Tham gia ──
  async join(lobby, userId, userName) {
    if (lobby.status !== 'open') {
      throw new Error('Phòng đang chơi — không thể tham gia!');
    }
    if (lobby.players.includes(userId)) {
      throw new Error('Bạn đã ở trong phòng!');
    }
    const max = calculateMaxPlayers(lobby.gameType);
    if (lobby.players.length >= max) {
      throw new Error(`Phòng đã đủ tối đa **${max}** người!`);
    }
    const balance = await UserModel.getBalance(lobby.guildId, userId);
    if (balance < lobby.bet) {
      throw new Error(
        `Bạn cần ít nhất **${formatCoins(lobby.bet)}** 🪙 để vào phòng (số dư: **${formatCoins(balance)}** 🪙)!`
      );
    }
    lobby.players.push(userId);
    lobby.playerNames[userId] = userName || userId;
    return lobby;
  },

  // ── Rời phòng ──
  async leave(lobby, userId) {
    if (lobby.status !== 'open') {
      throw new Error('Phòng đang chơi — không thể rời!');
    }
    const idx = lobby.players.indexOf(userId);
    if (idx === -1) {
      throw new Error('Bạn không ở trong phòng!');
    }
    lobby.players.splice(idx, 1);
    delete lobby.playerNames[userId];

    if (lobby.players.length === 0) {
      this.destroy(lobby);
      return null;
    }
    if (lobby.hostId === userId) {
      lobby.hostId = lobby.players[0];
    }
    return lobby;
  },

  // ── Bắt đầu ván ──
  async start(lobby, interaction) {
    if (lobby.status !== 'open') {
      throw new Error('Phòng đang chơi — không thể bắt đầu!');
    }
    if (interaction.user.id !== lobby.hostId) {
      throw new Error('Chỉ chủ phòng mới có thể bắt đầu ván!');
    }
    const rule = getGame(lobby.gameType);
    if (lobby.players.length < rule.minPlayers) {
      throw new Error(`Cần tối thiểu **${rule.minPlayers}** người để bắt đầu!`);
    }

    const session = new CardSession(lobby);
    lobby.status = 'starting';
    lobby.session = session;
    sessionsById.set(session.id, session);
    session.channelMessage = lobby.message;
    session.onEnd = () => {
      sessionsById.delete(session.id);
      this.destroy(lobby);
    };

    try {
      const res = await session.start(interaction.client);

      if (!res.ok && res.canceled) {
        // Không đủ người chơi đủ coin → hủy ván
        lobby.status = 'open';
        lobby.session = null;
        sessionsById.delete(session.id);
        session.ended = true;
        return { ok: false, canceled: true, failed: res.failed || [] };
      }

      // Loại người không đủ coin (nếu vẫn đủ người chơi)
      if (res.removed && res.removed.length > 0) {
        const removedIds = new Set(res.removed.map((f) => f.discordId));
        lobby.players = lobby.players.filter((id) => !removedIds.has(id));
        for (const id of removedIds) delete lobby.playerNames[id];
      }

      lobby.status = 'playing';
      return { ok: true, session, removed: res.removed || [] };
    } catch (err) {
      console.error('[CardGames] lobby start error:', err.message);
      // Hoàn tiền & dọn dẹp
      try {
        await refundBets(lobby.guildId, lobby.players, lobby.bet);
      } catch (refundErr) {
        console.error('[CardGames] refund after start error:', refundErr.message);
      }
      lobby.status = 'open';
      lobby.session = null;
      sessionsById.delete(session.id);
      session.ended = true;
      throw err;
    }
  },

  // Cập nhật lại tin nhắn phòng (sau khi thêm/bớt người)
  async refreshLobbyMessage(lobby) {
    if (!lobby || !lobby.message) return;
    const rule = getGame(lobby.gameType);
    try {
      await lobby.message.edit({
        embeds: [lobbyEmbed(lobby, rule)],
        components: lobbyButtons(lobby.id),
      });
    } catch (err) {
      console.error('[CardGames] refresh lobby message:', err.message);
    }
  },

  destroy(lobby) {
    lobbies.delete(this.key(lobby.guildId, lobby.channelId));
    byId.delete(lobby.id);
  },
};

module.exports = { LobbyManager, lobbies, byId, sessionsById };
