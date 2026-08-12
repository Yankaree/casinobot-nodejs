// ═══════════════════════════════════════════
// CARD ENGINE — So sánh bộ bài (ai chặt được ai)
// ═══════════════════════════════════════════
// Mọi luật lấy từ rules (config), không hard-code.

function maxSuitOrder(cards) {
  return Math.max(...cards.map((c) => c.suitOrder));
}

// Màu của bộ bài: 'red' | 'black' | 'mixed'
function cardsColor(cards) {
  const first = cards[0].color;
  return cards.every((c) => c.color === first) ? first : 'mixed';
}

/**
 * combo:  { type, mainRank, length, cards, suit?, color? } — từ validator.analyze()
 * table:  combo đang nằm trên bàn
 * rules:  config của game (rules.chop / rules.combo)
 * Trả về true nếu combo chặt được table.
 */
function compareCombos(combo, table, rules) {
  const c = combo;
  const t = table;
  const comboRules = (rules && rules.combo) || {};
  const chop = (rules && rules.chop) || {};

  if (c.type === t.type) {
    // Sảnh chặn sảnh phải cùng số lá
    if (c.length !== t.length) return false;

    // Ràng buộc chất/màu (Tiến Lên miền Bắc)
    if (c.type === 'single' && comboRules.singleSuitLocked && c.mainRank !== 15) {
      if (c.suit !== t.suit) return false;
    }
    if (c.type === 'pair' && comboRules.pairColorLocked) {
      if (c.color !== t.color) return false;
    }
    if (c.type === 'straight' && comboRules.straightSuitLocked) {
      if (!c.suit || !t.suit || c.suit !== t.suit) return false;
    }

    if (c.mainRank !== t.mainRank) return c.mainRank > t.mainRank;

    // Cùng giá trị:
    if (c.type === 'single' && c.mainRank === 15) {
      // Hai con 2 chặt nhau
      if (chop.twoRule === 'suit-only') {
        return maxSuitOrder(c.cards) > maxSuitOrder(t.cards);
      }
      // Luật cùng màu: đỏ chặt đen & đỏ nhỏ hơn; đen chỉ chặt đen nhỏ hơn
      if (c.color === 'black' && t.color === 'red') return false;
      return maxSuitOrder(c.cards) > maxSuitOrder(t.cards);
    }

    return false; // bộ bài giống hệt → không chặt được
  }

  // ── Chặt chéo (tùy config từng game) ──
  // Tứ quý / đôi thông chặt con 2
  if (t.type === 'single' && t.mainRank === 15) {
    if (c.type === 'quad' && chop.quadBeatsTwo) return true;
    if (c.type === 'threePairs' && chop.threePairsBeatsTwo) return true;
    if (c.type === 'fourPairs' && chop.fourPairsBeatsTwo) return true;
    return false;
  }
  // Tứ quý chặt đôi 2 (tùy game)
  if (t.type === 'pair' && t.mainRank === 15 && c.type === 'quad' && chop.quadBeatsPairTwo) {
    return true;
  }
  // Bốn đôi thông chặt tứ quý
  if (t.type === 'quad' && c.type === 'fourPairs' && chop.fourPairsBeatsQuad) {
    return true;
  }
  // Bốn đôi thông chặt ba đôi thông
  if (t.type === 'threePairs' && c.type === 'fourPairs' && chop.fourPairsBeatsThreePairs) {
    return true;
  }

  return false;
}

module.exports = { compareCombos, cardsColor };
