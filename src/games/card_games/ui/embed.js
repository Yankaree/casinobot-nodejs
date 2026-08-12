// ═══════════════════════════════════════════
// UI — Embed builder (lobby / bàn chơi / kết quả)
// ═══════════════════════════════════════════

const { EmbedBuilder } = require('discord.js');
const config = require('../../../config');
const { formatCoins } = require('../../../utils/formatter');
const { handLabel } = require('../engine/hand');
const { calculateMaxPlayers } = require('../rules/registry');

const COLORS = config.colors;

// ── Lobby ──
function lobbyEmbed(lobby, rule) {
  const maxPlayers = calculateMaxPlayers(lobby.gameType);
  const playerLines = lobby.players.map((id, i) => {
    const name = lobby.playerNames[id] || id;
    const hostMark = id === lobby.hostId ? ' 👑' : '';
    return `${i + 1}. <@${id}>${hostMark}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${rule.emoji} Phòng chơi ${rule.name}`)
    .setDescription(rule.description)
    .addFields(
      {
        name: '👥 Người chơi',
        value: playerLines.length > 0 ? playerLines.join('\n') : '_Chưa có ai — bấm **Tham gia** để vào phòng!_',
        inline: false,
      },
      { name: '💰 Mức cược', value: `**${formatCoins(lobby.bet)}** 🪙 / người`, inline: true },
      { name: '🎯 Số người', value: `${lobby.players.length} / ${maxPlayers}`, inline: true },
      { name: '🎮 Game', value: rule.name, inline: true }
    )
    .setFooter({ text: `Lobby: ${lobby.id} · Chủ phòng mở /card start` });

  return embed;
}

// ── Bàn chơi (public — không bao giờ hiện bài của ai) ──
function tableEmbed(session) {
  const rule = session.rules;
  const current = session.turnManager.getCurrent();
  const playerLines = session.players.map((p) => {
    const turnMark = current && p.discordId === current.discordId ? '▶️ ' : '';
    const finishedMark = p.finished ? ` 🏁 (hạng ${p.rank})` : '';
    return `${turnMark}<@${p.discordId}> — **${p.cardCount()}** lá${finishedMark}`;
  });

  let tableLine = '_Chưa có ai đánh — người đầu tiên dẫn bài._';
  if (session.table) {
    const player = session.players.find((p) => p.discordId === session.table.playerId);
    tableLine = `**${player ? player.displayName : '?'}** đánh: **${session.table.combo.label}**\n\`${handLabel(session.table.combo.cards)}\``;
  }

  const historyLines = session.playHistory.length > 0
    ? session.playHistory
        .slice(-(session.turnHistoryLimit || 4))
        .map((h) => `• **${h.playerName}**: ${h.comboLabel}`)
        .join('\n')
    : '_Chưa có nước đi nào._';

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${rule.emoji} ${rule.name} — Ván đang chơi`)
    .setDescription(
      `🃏 Lượt của: **${current ? `<@${current.discordId}>` : '?'}**\n` +
      `💰 Pot: **${formatCoins(session.pot)}** 🪙 (mức cược ${formatCoins(session.bet)} 🪙/người)`
    )
    .addFields(
      { name: '🎯 Bài đang trên bàn', value: tableLine, inline: false },
      { name: '👥 Người chơi', value: playerLines.join('\n'), inline: false },
      { name: '📜 Nước đi gần đây', value: historyLines, inline: false }
    )
    .setFooter({ text: `Phiên: ${session.id} · Hết giờ sẽ tự động bỏ lượt` });

  return embed;
}

// ── Kết quả ──
function resultEmbed(session, { reason, ranking, payouts, extraLabel }) {
  const rule = session.rules;
  const medals = ['🥇', '🥈', '🥉'];
  const rankLines = ranking
    .sort((a, b) => a.rank - b.rank)
    .map((r) => {
      const player = session.players.find((p) => p.discordId === r.discordId);
      const medal = medals[r.rank - 1] || `${r.rank}.`;
      return `${medal} **${player ? player.displayName : r.discordId}**`;
    })
    .join('\n');

  const payoutLines = payouts
    .map((p) => {
      const player = session.players.find((x) => x.discordId === p.discordId);
      return `<@${p.discordId}>: ${p.label}`;
    })
    .join('\n');

  const reasonText = {
    normal: 'Ván kết thúc — có người về nhất!',
    'white-win': '⚡ Thắng đặc biệt (Ăn trắng)!',
    'bao-sam-success': '🔔 Báo Sâm thành công — không ai bắt được!',
    'bao-sam-fail': '⚔️ Báo Sâm thất bại — đã bị bắt!',
  }[reason] || 'Ván kết thúc!';

  const description = extraLabel
    ? `${reasonText}\n✨ **${extraLabel}**`
    : reasonText;

  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`🏆 Kết quả ${rule.name}`)
    .setDescription(description)
    .addFields(
      { name: '📊 Xếp hạng', value: rankLines, inline: false },
      { name: '💰 Thanh toán', value: payoutLines || '_Không có_', inline: false }
    )
    .setFooter({ text: `Phiên: ${session.id} · Cảm ơn đã chơi! 🎉` });

  return embed;
}

module.exports = { lobbyEmbed, tableEmbed, resultEmbed };
