const crypto = require('crypto');

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
// QUAY TRỰC TIẾP TÀI/XỈU
// 50/50 pure random - mỗi bên 50%
// ─────────────────────────────────────────────
function rollResult(guildId) {
  const result = secureRandom(2) === 0 ? 'tai' : 'xiu';
  addResult(guildId, result);
  return result;
}

function resetHistory(guildId) {
  resultHistory.delete(guildId);
}

module.exports = { rollResult, resetHistory };
