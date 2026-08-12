// ═══════════════════════════════════════════
// RULE — Sâm Lốc
// ═══════════════════════════════════════════
// Luật nằm trong config. Riêng cách tính "thối" (đền khi còn bài) ở đây.

const { CARD_GAME_CONFIG } = require('../config');
const { groupByRank } = require('../engine/hand');

function buildRule() {
  return CARD_GAME_CONFIG.games.samloc;
}

/**
 * Tính tiền thối khi ván kết thúc.
 * hand:  bài còn lại của người thua
 * bet:   mức cược
 * thoi:  { perCard, two, quad } — hệ số từ config
 */
function calculateThoi(hand, bet, thoi) {
  const thoiCfg = thoi || { perCard: 0, two: 0, quad: 0 };
  const groups = groupByRank(hand);
  let units = 0;
  for (const [value, cards] of groups) {
    if (value === 15) {
      units += cards.length * thoiCfg.two; // con 2
    } else if (cards.length === 4) {
      units += thoiCfg.quad; // tứ quý
    } else {
      units += cards.length * thoiCfg.perCard;
    }
  }
  return units * bet;
}

module.exports = {
  id: 'samloc',
  name: 'Sâm Lốc',
  buildRule,
  calculateThoi,
};
