// ═══════════════════════════════════════════
// UI — Tin nhắn riêng tư (DM)
// ═══════════════════════════════════════════
// Bài của từng người chỉ gửi qua DM — không bao giờ hiện ra channel.

const { EmbedBuilder } = require('discord.js');
const config = require('../../../config');
const { handLabel } = require('../engine/hand');

// Gửi DM; trả về message object hoặc null nếu thất bại (DM bị tắt...)
async function sendDM(client, userId, payload) {
  try {
    const user = await client.users.fetch(userId);
    return await user.send(payload);
  } catch (err) {
    console.warn(`[CardGames] DM tới ${userId} thất bại: ${err.message}`);
    return null;
  }
}

// Embed bài riêng tư
function handEmbed(session, player) {
  const sorted = [...player.hand].sort((a, b) => a.value - b.value || a.suitOrder - b.suitOrder);
  const embed = new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle(`🃏 Bài của bạn — ${session.rules.name}`)
    .setDescription(`\`${handLabel(sorted)}\``)
    .setFooter({ text: `Phiên: ${session.id} · Không ai khác có thể thấy bài này` });

  return embed;
}

module.exports = { sendDM, handEmbed };
