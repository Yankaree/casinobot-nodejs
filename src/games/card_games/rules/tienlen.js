// ═══════════════════════════════════════════
// RULE — Tiến Lên (miền Bắc)
// ═══════════════════════════════════════════
// Biến thể của Tiến Lên với ràng buộc cùng chất/màu khi chặt bài.
// Luật nằm trong config, không hard-code ở đây.

const { CARD_GAME_CONFIG } = require('../config');

function buildRule() {
  return CARD_GAME_CONFIG.games.tienlen;
}

module.exports = {
  id: 'tienlen',
  name: 'Tiến Lên',
  buildRule,
};
