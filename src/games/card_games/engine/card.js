// ═══════════════════════════════════════════
// CARD ENGINE — Lá bài & bộ bài Tây 52 lá
// ═══════════════════════════════════════════

// Chất bài. Thứ tự để phân định khi 2 lá cùng giá trị:
// ♥ (4) > ♦ (3) > ♣ (2) > ♠ (1) — chuẩn Tiến Lên Miền Nam.
const SUITS = [
  { id: 's', symbol: '♠', name: 'Bích', color: 'black', order: 1 },
  { id: 'c', symbol: '♣', name: 'Tép', color: 'black', order: 2 },
  { id: 'd', symbol: '♦', name: 'Rô', color: 'red', order: 3 },
  { id: 'h', symbol: '♥', name: 'Cơ', color: 'red', order: 4 },
];

// Giá trị lá bài: 3 < 4 < ... < 10 < J < Q < K < A < 2
const RANKS = [
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6', value: 6 },
  { label: '7', value: 7 },
  { label: '8', value: 8 },
  { label: '9', value: 9 },
  { label: '10', value: 10 },
  { label: 'J', value: 11 },
  { label: 'Q', value: 12 },
  { label: 'K', value: 13 },
  { label: 'A', value: 14 },
  { label: '2', value: 15 },
];

const ALL_CARDS = [];
const CARD_MAP = new Map();

for (const suit of SUITS) {
  for (const rank of RANKS) {
    const card = {
      id: `${suit.id}${rank.label}`, // vd: 'sA', 'h10', 'd2'
      suitId: suit.id,
      symbol: suit.symbol,
      suitName: suit.name,
      color: suit.color,
      suitOrder: suit.order,
      rankLabel: rank.label,
      value: rank.value, // 3..15
    };
    card.label = `${suit.symbol}${rank.label}`;
    ALL_CARDS.push(card);
    CARD_MAP.set(card.id, card);
  }
}

function getCard(id) {
  return CARD_MAP.get(id) || null;
}

function resolveCards(ids) {
  const cards = [];
  for (const id of ids) {
    const card = getCard(id);
    if (card) cards.push(card);
  }
  return cards;
}

function compareCards(a, b) {
  if (a.value !== b.value) return a.value - b.value;
  return a.suitOrder - b.suitOrder;
}

function valueToLabel(value) {
  const rank = RANKS.find((r) => r.value === value);
  return rank ? rank.label : String(value);
}

module.exports = {
  SUITS,
  RANKS,
  ALL_CARDS,
  CARD_MAP,
  getCard,
  resolveCards,
  compareCards,
  valueToLabel,
};
