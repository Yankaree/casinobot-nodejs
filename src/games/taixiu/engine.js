const crypto = require('crypto');

// ─────────────────────────────────────────────
// RANDOM THỰC TẾ NHƯ NGOÀI ĐỜI
// ─────────────────────────────────────────────
// Mỗi lần xóc là INDEPENDENT - không bias từ ván trước
// Streak xảy ra ngẫu nhiên (law of large numbers)
// Jackpot cực hiếm (~0.5% = 1/200)
// ─────────────────────────────────────────────

function secureRandom(max) {
  return crypto.randomInt(1, max + 1);
}

function secureRandomFloat() {
  const bytes = crypto.randomBytes(8);
  const uint64 = bytes.readBigUInt64BE(0);
  return Number(uint64) / Number(2n ** 64n);
}

// ─────────────────────────────────────────────
// HISTORY - Chỉ dùng để hiển thị, KHÔNG dùng để bias
// ─────────────────────────────────────────────
const resultHistory = new Map();
const MAX_HISTORY = 50;

function addResult(guildId, result) {
  if (!resultHistory.has(guildId)) {
    resultHistory.set(guildId, []);
  }
  const history = resultHistory.get(guildId);
  history.push(result);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

function getHistory(guildId) {
  return resultHistory.get(guildId) || [];
}

// ─────────────────────────────────────────────
// QUAY XÚC XẮC - PURE RANDOM NHƯ NGOÀI ĐỜI
// ─────────────────────────────────────────────
function rollDice(guildId) {
  const dice = [
    secureRandom(6),
    secureRandom(6),
    secureRandom(6),
  ];
  return { d1: dice[0], d2: dice[1], d3: dice[2] };
}

function calculateResult(d1, d2, d3) {
  const total = d1 + d2 + d3;
  if (total >= 4 && total <= 10) return 'xiu';
  if (total >= 11 && total <= 17) return 'tai';
  return null;
}

// ─────────────────────────────────────────────
// RANDOM THỰC TẾ - KHÔNG BIAS
// Mỗi lần xóc独立, streak xảy ra tự nhiên
// ─────────────────────────────────────────────
function rollDiceWithWeight(guildId) {
  // Jackpot chance: ~0.5% triple 1 hoặc triple 6
  const jackpotRoll = secureRandom(200);
  if (jackpotRoll === 0) {
    const triple = secureRandom(2) === 1 ? 1 : 6;
    addResult(guildId, 'tai');
    return { d1: triple, d2: triple, d3: triple };
  }

  // Pure random - roll 3 xúc xắc independent
  const d1 = secureRandom(6);
  const d2 = secureRandom(6);
  const d3 = secureRandom(6);

  const result = calculateResult(d1, d2, d3);
  addResult(guildId, result);

  return { d1, d2, d3 };
}

function isJackpot(d1, d2, d3) {
  return (
    (d1 === 1 && d2 === 1 && d3 === 1) ||
    (d1 === 6 && d2 === 6 && d3 === 6)
  );
}

function getDiceTotal(d1, d2, d3) {
  return d1 + d2 + d3;
}

function resetHistory(guildId) {
  resultHistory.delete(guildId);
}

module.exports = { rollDice, rollDiceWithWeight, calculateResult, isJackpot, getDiceTotal, resetHistory };
