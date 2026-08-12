// ═══════════════════════════════════════════
// RULE — Tiến Lên Miền Nam
// ═══════════════════════════════════════════
// Toàn bộ luật nằm trong config (../config.js), không hard-code ở đây.

const { CARD_GAME_CONFIG } = require('../config');

function buildRule() {
  return CARD_GAME_CONFIG.games.tienlenmiennam;
}

module.exports = {
  id: 'tienlenmiennam',
  name: 'Tiến Lên Miền Nam',
  buildRule,
};
