// ═══════════════════════════════════════════
// CARD ENGINE — Bộ bài: xáo & chia
// ═══════════════════════════════════════════

const crypto = require('crypto');
const { ALL_CARDS } = require('./card');

// Tạo bộ bài (hỗ trợ nhiều bộ nếu cần mở rộng game khác)
function createDeck(deckCount = 1) {
  const deck = [];
  for (let i = 0; i < deckCount; i++) {
    for (const card of ALL_CARDS) {
      deck.push({ ...card, deck: i });
    }
  }
  return deck;
}

// Xáo bài bằng Fisher–Yates + crypto (chống đoán bài)
function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Chia bài đều cho playerCount người, mỗi người cardsPerPlayer lá.
// Trả về { hands: [[card...], ...], remaining: [...] }
function deal(deck, playerCount, cardsPerPlayer) {
  const shuffled = shuffle(deck);
  const needed = playerCount * cardsPerPlayer;
  if (needed > shuffled.length) {
    throw new Error(
      `Không đủ bài: cần ${needed} lá nhưng chỉ có ${shuffled.length} lá`
    );
  }
  const hands = [];
  for (let p = 0; p < playerCount; p++) {
    const hand = [];
    for (let i = 0; i < cardsPerPlayer; i++) {
      hand.push(shuffled[p * cardsPerPlayer + i]);
    }
    hands.push(hand);
  }
  return { hands, remaining: shuffled.slice(needed) };
}

module.exports = { createDeck, shuffle, deal };
