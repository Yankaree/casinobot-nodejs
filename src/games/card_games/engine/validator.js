// ═══════════════════════════════════════════
// CARD ENGINE — Phân tích & kiểm tra bộ bài
// ═══════════════════════════════════════════
// Toàn bộ validation chạy ở server (anti-cheat):
// client chỉ gửi id lá bài, không tự quyết định nước đi.

const { resolveCards, valueToLabel } = require('./card');
const { sortHand, groupByRank, isConsecutive } = require('./hand');
const { compareCombos, cardsColor } = require('./comparator');

const COMBO_TYPES = {
  single: 'single',
  pair: 'pair',
  triple: 'triple',
  quad: 'quad',
  straight: 'straight',
  threePairs: 'threePairs',
  fourPairs: 'fourPairs',
};

function comboLabel(combo) {
  switch (combo.type) {
    case 'single':
      return `Lá ${valueToLabel(combo.mainRank)}`;
    case 'pair':
      return `Đôi ${valueToLabel(combo.mainRank)}`;
    case 'triple':
      return `Sám ${valueToLabel(combo.mainRank)}`;
    case 'quad':
      return `Tứ quý ${valueToLabel(combo.mainRank)}`;
    case 'straight': {
      const values = combo.cards.map((c) => c.value);
      return `Sảnh ${valueToLabel(Math.min(...values))} → ${valueToLabel(combo.mainRank)} (${combo.length} lá)`;
    }
    case 'threePairs': {
      const values = combo.cards.map((c) => c.value);
      return `Ba đôi thông ${valueToLabel(Math.min(...values))} → ${valueToLabel(combo.mainRank)}`;
    }
    case 'fourPairs': {
      const values = combo.cards.map((c) => c.value);
      return `Bốn đôi thông ${valueToLabel(Math.min(...values))} → ${valueToLabel(combo.mainRank)}`;
    }
    default:
      return 'Bộ bài';
  }
}

/**
 * Phân tích một nhóm lá bài thành bộ hợp lệ.
 * Trả về { ok: true, type, mainRank, length, cards, suit?, color?, label }
 * hoặc { ok: false, reason }.
 */
function analyze(cards, rules) {
  const comboRules = (rules && rules.combo) || {};

  if (!cards || cards.length === 0) {
    return { ok: false, reason: 'Chưa chọn lá bài nào!' };
  }

  const ids = cards.map((c) => c.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: 'Lá bài bị trùng lặp!' };
  }

  const sorted = sortHand(cards);
  const size = sorted.length;
  const values = sorted.map((c) => c.value);
  const groups = groupByRank(sorted);
  const distinctValues = [...groups.keys()].sort((a, b) => a - b);

  const base = { cards: sorted };

  // Bài rác
  if (size === 1) {
    const card = sorted[0];
    return {
      ...base,
      ok: true,
      type: COMBO_TYPES.single,
      mainRank: card.value,
      length: 1,
      suit: card.suitId,
      color: card.color,
      label: comboLabel({ type: COMBO_TYPES.single, mainRank: card.value, cards: sorted }),
    };
  }

  // Đôi / Sám cô / Tứ quý (cùng giá trị)
  if (distinctValues.length === 1) {
    const v = distinctValues[0];
    const map = {
      2: COMBO_TYPES.pair,
      3: COMBO_TYPES.triple,
      4: COMBO_TYPES.quad,
    };
    const type = map[size];
    if (type && comboRules[type] !== false) {
      const color = size === 2 ? cardsColor(sorted) : undefined;
      return {
        ...base,
        ok: true,
        type,
        mainRank: v,
        length: size,
        color,
        label: comboLabel({ type, mainRank: v, cards: sorted }),
      };
    }
    return { ok: false, reason: `Bộ bài không hợp lệ (${size} lá cùng giá trị)` };
  }

  // Ba đôi thông / Bốn đôi thông (đôi liên tiếp)
  if ((size === 6 || size === 8) && comboRules[size === 6 ? 'threePairs' : 'fourPairs']) {
    const pairCounts = [...groups.values()].map((g) => g.length);
    const allPairs = pairCounts.every((n) => n === 2);
    if (allPairs && isConsecutive(distinctValues)) {
      const type = size === 6 ? COMBO_TYPES.threePairs : COMBO_TYPES.fourPairs;
      return {
        ...base,
        ok: true,
        type,
        mainRank: Math.max(...distinctValues),
        length: size,
        label: comboLabel({ type, mainRank: Math.max(...distinctValues), cards: sorted }),
      };
    }
  }

  // Sảnh
  if (comboRules.straight) {
    const minLen = comboRules.straight.minLength || 3;
    const allowTwo = !!comboRules.straight.allowTwo;
    if (size >= minLen && isConsecutive(distinctValues) && (allowTwo || !values.includes(15))) {
      const suit = sorted.every((c) => c.suitId === sorted[0].suitId)
        ? sorted[0].suitId
        : null;
      return {
        ...base,
        ok: true,
        type: COMBO_TYPES.straight,
        mainRank: Math.max(...distinctValues),
        length: size,
        suit,
        label: comboLabel({ type: COMBO_TYPES.straight, mainRank: Math.max(...distinctValues), cards: sorted }),
      };
    }
  }

  return { ok: false, reason: 'Bộ bài không hợp lệ!' };
}

/**
 * Kiểm tra một nước đánh hợp lệ (anti-cheat — chạy 100% ở server).
 * hand:  mảng lá bài đang cầm của người chơi
 * cardIds: id lá bài muốn đánh
 * table: { combo, playerId } | null
 * rules: config game
 */
function validatePlay(hand, cardIds, table, rules) {
  if (!cardIds || cardIds.length === 0) {
    return { ok: false, error: 'Chưa chọn lá bài nào!' };
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return { ok: false, error: 'Lá bài bị trùng lặp!' };
  }
  const cards = resolveCards(cardIds);
  if (cards.length !== cardIds.length) {
    return { ok: false, error: 'Có lá bài không hợp lệ!' };
  }
  for (const card of cards) {
    if (!hand.some((h) => h.id === card.id)) {
      return { ok: false, error: 'Bạn không còn lá bài này trên tay!' };
    }
  }

  const combo = analyze(cards, rules);
  if (!combo.ok) {
    return { ok: false, error: combo.reason };
  }

  if (table) {
    if (!compareCombos(combo, table.combo, rules)) {
      return { ok: false, error: `Bộ bài **${combo.label}** không chặt được **${table.combo.label}**!` };
    }
  }

  return { ok: true, combo };
}

// Người chơi có được bỏ lượt không? (đang dẫn đầu thì phải đánh)
function canPass(playerId, table) {
  return !!table && table.playerId !== playerId;
}

/**
 * Tìm nước đánh nhỏ nhất hợp lệ (dùng khi hết giờ tự đánh / test).
 * Trả về mảng card ids hoặc null.
 */
function findSmallestPlay(hand, table, rules) {
  const comboRules = (rules && rules.combo) || {};
  const sorted = sortHand(hand);
  const groups = groupByRank(hand);
  const values = [...groups.keys()].sort((a, b) => a - b);

  // Dẫn đầu: đánh lá nhỏ nhất
  if (!table) {
    return sorted.length > 0 ? [sorted[0].id] : null;
  }

  const t = table.combo;

  // Bài rác: thử từng lá từ nhỏ đến lớn (tự xử lý luật cùng chất miền Bắc)
  for (const card of sorted) {
    const combo = analyze([card], rules);
    if (combo.ok && compareCombos(combo, t, rules)) return [card.id];
  }

  // Đôi (miền Bắc: phải cùng màu)
  for (const v of values) {
    const g = groups.get(v);
    if (g.length < 2) continue;
    const pairs = [];
    if (comboRules.pairColorLocked) {
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) {
          if (g[i].color === g[j].color) pairs.push([g[i], g[j]]);
        }
      }
    } else {
      pairs.push([g[0], g[1]]);
    }
    for (const pair of pairs) {
      const combo = analyze(pair, rules);
      if (combo.ok && compareCombos(combo, t, rules)) return pair.map((c) => c.id);
    }
  }

  // Sám cô
  for (const v of values) {
    const g = groups.get(v);
    if (g.length >= 3) {
      const three = g.slice(0, 3);
      const combo = analyze(three, rules);
      if (combo.ok && compareCombos(combo, t, rules)) return three.map((c) => c.id);
    }
  }

  // Tứ quý
  for (const v of values) {
    const g = groups.get(v);
    if (g.length === 4) {
      const combo = analyze(g, rules);
      if (combo.ok && compareCombos(combo, t, rules)) return g.map((c) => c.id);
    }
  }

  // Sảnh
  if (comboRules.straight) {
    const minLen = comboRules.straight.minLength || 3;
    const allowTwo = !!comboRules.straight.allowTwo;
    const straightCards = generateStraightCandidates(hand, minLen, allowTwo, comboRules);
    for (const cards of straightCards) {
      const combo = analyze(cards, rules);
      if (combo.ok && compareCombos(combo, t, rules)) return cards.map((c) => c.id);
    }
  }

  // Ba đôi thông / Bốn đôi thông
  for (const [type, windowSize] of [
    ['threePairs', 3],
    ['fourPairs', 4],
  ]) {
    if (!comboRules[type]) continue;
    const usableValues = values.filter((v) => (groups.get(v) || []).length >= 2);
    for (let i = 0; i + windowSize <= usableValues.length; i++) {
      const w = usableValues.slice(i, i + windowSize);
      if (w[windowSize - 1] - w[0] !== windowSize - 1) continue;
      const cards = w.flatMap((v) => groups.get(v).slice(0, 2));
      const combo = analyze(cards, rules);
      if (combo.ok && compareCombos(combo, t, rules)) return cards.map((c) => c.id);
    }
  }

  return null;
}

// Tạo các sảnh ứng viên (miền Bắc: sảnh phải đồng chất → tạo theo từng chất)
function generateStraightCandidates(hand, minLen, allowTwo, comboRules) {
  const result = [];
  const pushWindows = (byValue) => {
    const values = [...byValue.keys()].filter((v) => allowTwo || v !== 15).sort((a, b) => a - b);
    for (let len = minLen; len <= values.length; len++) {
      for (let i = 0; i + len <= values.length; i++) {
        const w = values.slice(i, i + len);
        if (w[len - 1] - w[0] !== len - 1) continue;
        const cards = w.map((v) => byValue.get(v)[0]);
        result.push(cards);
      }
    }
  };

  if (comboRules.straightSuitLocked) {
    const bySuit = new Map();
    for (const card of hand) {
      if (!bySuit.has(card.suitId)) bySuit.set(card.suitId, new Map());
      const suitMap = bySuit.get(card.suitId);
      if (!suitMap.has(card.value)) suitMap.set(card.value, []);
      suitMap.get(card.value).push(card);
    }
    for (const suitMap of bySuit.values()) pushWindows(suitMap);
  } else {
    const byValue = new Map();
    for (const card of hand) {
      if (!byValue.has(card.value)) byValue.set(card.value, []);
      byValue.get(card.value).push(card);
    }
    pushWindows(byValue);
  }
  return result;
}

module.exports = {
  COMBO_TYPES,
  analyze,
  validatePlay,
  canPass,
  findSmallestPlay,
  comboLabel,
};
