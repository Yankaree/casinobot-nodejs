// ═══════════════════════════════════════════
// RULE — Thắng đặc biệt (Ăn trắng) sau khi chia bài
// ═══════════════════════════════════════════
// Hoàn toàn cấu hình qua rules.whiteWin của từng game.

const { groupByRank, hasContiguousValues } = require('../engine/hand');
const { analyze } = require('../engine/validator');
const { valueToLabel } = require('../engine/card');

const PRIORITIES = {
  fourTwos: 1,
  perfect: 2,
  dragon: 3,
  sixPairs: 4,
  fivePairsStraight: 5,
  fivePairs: 6,
  sameColor: 7,
};

/**
 * Kiểm tra ăn trắng cho một người chơi.
 * Trả về { type, priority, label } | null
 */
function checkWhiteWin(hand, rules, playerId, leaderId) {
  const w = rules.whiteWin;
  if (!w) return null;

  const results = [];
  const groups = groupByRank(hand);
  const values = [...groups.keys()].sort((a, b) => a - b);
  const size = hand.length;
  const isLeader = playerId === leaderId;

  // 4 con 2
  if (w.fourTwos && (groups.get(15) || []).length === 4) {
    results.push({ type: 'fourTwos', priority: PRIORITIES.fourTwos, label: 'Tứ quý 2' });
  }

  // Bộ bài hoàn hảo: toàn bộ bài đánh được trong 1 lần (cần quyền đi trước)
  if (w.wholeHandOneCombo && (isLeader || !w.perfectHandRequiresLead)) {
    const combo = analyze(hand, rules);
    if (combo.ok) {
      results.push({ type: 'perfect', priority: PRIORITIES.perfect, label: `Bộ bài hoàn hảo (${combo.label})` });
    }
  }

  // Sảnh rồng: dãy 3 → dragonEndValue (TLMN: 3→A, Sâm: 3→Q)
  if (w.dragonStraight) {
    const end = w.dragonEndValue || 14;
    if (hasContiguousValues(values, 3, end) && size >= end - 3 + 1) {
      results.push({ type: 'dragon', priority: PRIORITIES.dragon, label: `Sảnh rồng 3 → ${valueToLabel(end)}` });
    }
  }

  // 6 đôi (TLMN: 13 lá = 6 đôi + 1 rác)
  if (w.sixPairs && size === 13 && [...groups.values()].filter((g) => g.length === 2).length === 6) {
    results.push({ type: 'sixPairs', priority: PRIORITIES.sixPairs, label: '6 đôi' });
  }

  // 5 đôi thông: 5 đôi liên tiếp
  if (w.fivePairsStraight) {
    const pairValues = [...groups.entries()]
      .filter(([, g]) => g.length >= 2)
      .map(([v]) => v)
      .sort((a, b) => a - b);
    for (let i = 0; i + 5 <= pairValues.length; i++) {
      const w5 = pairValues.slice(i, i + 5);
      if (w5[4] - w5[0] === 4) {
        results.push({ type: 'fivePairsStraight', priority: PRIORITIES.fivePairsStraight, label: '5 đôi thông' });
        break;
      }
    }
  }

  // 5 đôi (Sâm Lốc: 10 lá = 5 đôi)
  if (w.fivePairs && size === 10 && [...groups.values()].every((g) => g.length === 2)) {
    results.push({ type: 'fivePairs', priority: PRIORITIES.fivePairs, label: '5 đôi' });
  }

  // 10 lá cùng màu (Sâm Lốc)
  if (w.sameColor && size === 10) {
    const firstColor = hand[0].color;
    if (hand.every((c) => c.color === firstColor)) {
      results.push({ type: 'sameColor', priority: PRIORITIES.sameColor, label: '10 lá cùng màu' });
    }
  }

  results.sort((a, b) => a.priority - b.priority);
  return results[0] || null;
}

module.exports = { checkWhiteWin };
