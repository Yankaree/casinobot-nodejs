const { EmbedBuilder } = require('discord.js');
const config = require('../../../config');
const { formatCoins } = require('../../../utils/formatter');

// ─────────────────────────────────────────────
// LOBBY — Tài Xỉu Deathmatch
// Phòng chờ chỉ lưu RAM, mỗi guild tối đa 1 lobby.
// Khi /txdeath start → lobby bị khóa, clone player list
// vào DeathmatchSession (battle coin được cấp lúc đó).
// ─────────────────────────────────────────────

const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomId() {
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return `DM-${id}`;
}

class DeathmatchLobby {
  constructor({ guildId, channelId, hostId, initialCoin, minutes, maxPlayers }) {
    this.roomId = generateRoomId();
    this.guildId = guildId;
    this.channelId = channelId;
    this.hostId = hostId;
    this.initialCoin = initialCoin;
    this.minutes = minutes;
    this.maxPlayers = maxPlayers;
    this.status = 'open'; // open | locked | closed
    this.players = new Map(); // userId -> { username }
  }

  addPlayer(userId, username) {
    if (this.status !== 'open') return false;
    if (this.players.has(userId)) return false;
    if (this.isFull()) return false;
    this.players.set(userId, { userId, username });
    return true;
  }

  removePlayer(userId) {
    return this.players.delete(userId);
  }

  isFull() {
    return this.players.size >= this.maxPlayers;
  }

  playerCount() {
    return this.players.size;
  }

  lock() {
    this.status = 'locked';
  }

  close() {
    this.status = 'closed';
    this.players.clear();
  }

  toEmbed() {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ TÀI XỈU DEATHMATCH — PHÒNG CHỜ')
      .setColor(config.colors.primary)
      .setDescription(
        `🏟️ **Phòng:** ${this.roomId}\n` +
        `👑 **Chủ phòng:** <@${this.hostId}>\n` +
        `💰 **Vốn mỗi người:** ${formatCoins(this.initialCoin)} Battle Coin\n` +
        `⏱️ **Thời gian trận:** ${this.minutes} phút\n` +
        `👥 **Người chơi:** ${this.playerCount()}/${this.maxPlayers}`
      );

    if (this.players.size > 0) {
      const list = [...this.players.values()]
        .map((p) => (p.userId === this.hostId ? `👑 <@${p.userId}>` : `👤 <@${p.userId}>`))
        .join('\n');
      embed.addFields({ name: 'Danh sách người chơi', value: list, inline: false });
    } else {
      embed.addFields({ name: 'Danh sách người chơi', value: 'Chưa có ai — `/txdeath join` để vào phòng!', inline: false });
    }

    embed.setFooter({ text: 'Chủ phòng dùng /txdeath start khi đủ người' });
    embed.setTimestamp();
    return embed;
  }
}

module.exports = { DeathmatchLobby, generateRoomId };
