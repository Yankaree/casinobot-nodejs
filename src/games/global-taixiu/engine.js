const crypto = require('crypto');

const GLOBAL_KEY = 'global';

// ─────────────────────────────────────────────
// RANDOM TRỰC TIẾP TÀI/XỈU
// Không dùng xúc xắc anymore - random trực tiếp kết quả
// ─────────────────────────────────────────────

function secureRandom(max) {
  return crypto.randomInt(0, max);
}

// ─────────────────────────────────────────────
// HISTORY - Chỉ dùng để hiển thị
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
// QUAY TRỰC TIẾP TÀI/XỈU
// 50/50 pure random - mỗi bên 50%
// ─────────────────────────────────────────────
function rollResult() {
  const result = secureRandom(2) === 0 ? 'tai' : 'xiu';
  addResult(result);
  return result;
}

function resetHistory() {
  resultHistory.delete(GLOBAL_KEY);
}

module.exports = { rollResult, resetHistory };
