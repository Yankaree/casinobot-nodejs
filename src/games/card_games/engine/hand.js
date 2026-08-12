// ═══════════════════════════════════════════
// CARD ENGINE — Tiện ích cho bộ bài trên tay
// ═══════════════════════════════════════════

const { compareCards, valueToLabel } = require('./card');

// Sắp xếp tay bài: tăng dần theo giá trị, cùng giá trị thì theo chất
function sortHand(cards) {
  return [...cards].sort(compareCards);
}

// Gom bài theo giá trị → Map<value, [cards]>
function groupByRank(cards) {
  const map = new Map();
  for (const card of cards) {
    if (!map.has(card.value)) map.set(card.value, []);
    map.get(card.value).push(card);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.suitOrder - b.suitOrder);
  }
  return map;
}

// Kiểm tra danh sách giá trị có liên tiếp (+1) hay không
function isConsecutive(values) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length !== values.length) return false; // trùng giá trị
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

function hasContiguousValues(values, from, to) {
  const set = new Set(values);
  for (let v = from; v <= to; v++) {
    if (!set.has(v)) return false;
  }
  return true;
}

// Tìm dãy liên tiếp dài nhất (theo giá trị) trong tập giá trị
function maxStraightLength(values) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const v of sorted) {
    run = prev !== null && v === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = v;
  }
  return best;
}

function handLabel(cards) {
  return sortHand(cards)
    .map((c) => c.label)
    .join(' ');
}

function handCountsLabel(counts) {
  // counts: [{label, count}] → "Người A (13 lá) · Người B (10 lá)"
  return counts.map((c) => `${c.label} (**${c.count}** lá)`).join('\n');
}

function rankLabel(value) {
  return valueToLabel(value);
}

module.exports = {
  sortHand,
  groupByRank,
  isConsecutive,
  hasContiguousValues,
  maxStraightLength,
  handLabel,
  handCountsLabel,
};
