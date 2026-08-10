const crypto = require('crypto');

const GLOBAL_KEY = 'global';

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

// ─────────────────────────────────────────────
// HISTORY - Chỉ dùng để hiển thị, KHÔNG dùng để bias
// ─────────────────────────────────────────────
const resultHistory = new Map();
const MAX_HISTORY = 50;

function addResult(result) {
  if (!resultHistory.has(GLOBAL_KEY)) {
    resultHistory.set(GLOBAL_KEY, []);
  }
  const history = resultHistory.get(GLOBAL_KEY);
  history.push(result);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

function getHistory() {
  return resultHistory.get(GLOBAL_KEY) || [];
}

// ─────────────────────────────────────────────
// QUAY XÚC XẮC - PURE RANDOM NHƯ NGOÀI ĐỜI
// ─────────────────────────────────────────────
function rollDice() {
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
function rollDiceWithWeight() {
  // Jackpot chance: ~0.5% triple 1 hoặc triple 6
  const jackpotRoll = secureRandom(200);
  if (jackpotRoll === 0) {
    const triple = secureRandom(2) === 1 ? 1 : 6;
    addResult('tai');
    return { d1: triple, d2: triple, d3: triple };
  }

  // Pure random - roll 3 xúc xắc independent
  const d1 = secureRandom(6);
  const d2 = secureRandom(6);
  const d3 = secureRandom(6);

  const result = calculateResult(d1, d2, d3);
  addResult(result);

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

function resetHistory() {
  resultHistory.delete(GLOBAL_KEY);
}

module.exports = { rollDice, rollDiceWithWeight, calculateResult, isJackpot, getDiceTotal, resetHistory };
