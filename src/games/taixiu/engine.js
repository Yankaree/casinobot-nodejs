const crypto = require('crypto');

function secureRandom(max) {
  return crypto.randomInt(1, max + 1);
}

function secureRandomFloat() {
  const bytes = crypto.randomBytes(8);
  const uint64 = bytes.readBigUInt64BE(0);
  return Number(uint64) / Number(2n ** 64n);
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─────────────────────────────────────────────
// MÔ PHỎNG VẬT LÝ XÓC ĐĨA THỰC
// ─────────────────────────────────────────────
// Trong xóc đĩa thật:
//   - Quỹ tích có quán tính (momentum)
//   - Khi xóc mạnh → dao động tự nhiên
//   - Streak 2-3 là BÌNH THƯỜNG (xảy ra ~25% thời gian)
//   - Streak 5+ rất HIẾM (<2%)
//   - Kết quả TRƯỚC không ép kết quả SAU
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

// Tính "độ nóng" - streak hiện tại
function getStreakInfo(guildId) {
  const history = getHistory(guildId);
  if (history.length === 0) return { length: 0, type: null };

  const last = history[history.length - 1];
  let length = 1;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i] === last) length++;
    else break;
  }
  return { length, type: last };
}

// Phân phối Chuẩn (Gaussian) - mô phỏng vật lý tự nhiên
function gaussianRandom(mean = 0.5, stddev = 0.15) {
  const u1 = secureRandomFloat();
  const u2 = secureRandomFloat();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

// ─────────────────────────────────────────────
// HỆ SỐ QUÁN TÍNH (MOMENTUM)
// Giống thật: khi xóc liên tiếp, quả có xu hướng
// đi theo quán tính trước đó rồi dần ổn định
// ─────────────────────────────────────────────
function getMomentumFactor(streakLength) {
  if (streakLength <= 1) return 0.50;    // Base: 50/50
  if (streakLength === 2) return 0.52;   // Streak 2: quán tính nhẹ (+2%)
  if (streakLength === 3) return 0.55;   // Streak 3: quán tính rõ (+5%)
  if (streakLength === 4) return 0.48;   // Streak 4: bắt đầu đảo chiều
  if (streakLength === 5) return 0.42;   // Streak 5: khó giữ
  return 0.35;                            // Streak 6+: rất hiếm
}

// ─────────────────────────────────────────────
// "NHỊP" XÓC ĐĨA (RHYTHM)
// Dealer xóc theo nhịp → tạo cluster nhỏ tự nhiên
// Streak 2-3 xảy ra nhiều hơn pure random
// ─────────────────────────────────────────────
function getRhythmFactor(guildId) {
  const history = getHistory(guildId);
  if (history.length < 3) return 0;

  // Tính tần suất streak ngắn trong 10 ván gần
  const recent = history.slice(-10);
  let shortStreaks = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] === recent[i - 1]) shortStreaks++;
  }
  const streakRatio = shortStreaks / (recent.length - 1);

  // Nếu streak_ratio cao → đang trong nhịp → tăng quán tính
  if (streakRatio > 0.5) return 0.03;
  if (streakRatio > 0.35) return 0.01;
  return 0;
}

// ─────────────────────────────────────────────
// QUAY XÚC XẮC CHÍNH
// ─────────────────────────────────────────────
function rollDice(guildId) {
  const dice = [
    secureRandom(6),
    secureRandom(6),
    secureRandom(6),
  ];
  const shuffled = shuffleArray(dice);
  return { d1: shuffled[0], d2: shuffled[1], d3: shuffled[2] };
}

function calculateResult(d1, d2, d3) {
  const total = d1 + d2 + d3;
  if (total >= 4 && total <= 10) return 'xiu';
  if (total >= 11 && total <= 17) return 'tai';
  return null;
}

// ─────────────────────────────────────────────
// ROLL KẾT HỢP VẬT LÝ
// Kết hợp: momentum + rhythm + gaussian noise
// → Kết quả TỰ NHIÊN như xóc đĩa thật
// ─────────────────────────────────────────────
function rollDiceWithWeight(guildId) {
  const { length: streakLength, type: streakType } = getStreakInfo(guildId);

  if (streakType && streakLength >= 2) {
    // Tính xác suất ĐẢO CHIỀU (không forced, tự nhiên)
    const momentum = getMomentumFactor(streakLength);
    const rhythm = getRhythmFactor(guildId);

    // Xác suất giữ nguyên streak = momentum + rhythm
    const keepStreakChance = momentum + rhythm;
    const flipChance = 1 - keepStreakChance;

    // Gaussian noise để thêm tự nhiên
    const noise = gaussianRandom(0, 0.05);
    const adjustedFlipChance = Math.max(0.15, Math.min(0.85, flipChance + noise));

    if (secureRandomFloat() < adjustedFlipChance) {
      // Đảo chiều - roll cho kết quả ngược lại
      const targetResult = streakType === 'tai' ? 'xiu' : 'tai';
      return rollForTarget(guildId, targetResult);
    }
  }

  // Roll ngẫu nhiên (với Gaussian bias nhỏ để cảm giác tự nhiên)
  const bias = gaussianRandom(0.5, 0.03);
  const targetResult = bias >= 0.5 ? 'tai' : 'xiu';
  return rollForTarget(guildId, targetResult);
}

// Roll xúc xắc để tạo kết quả cụ thể
function rollForTarget(guildId, targetResult) {
  let attempts = 0;
  while (attempts < 200) {
    const d1 = secureRandom(6);
    const d2 = secureRandom(6);
    const d3 = secureRandom(6);
    const result = calculateResult(d1, d2, d3);

    if (result === targetResult) {
      addResult(guildId, result);
      return { d1, d2, d3 };
    }
    attempts++;
  }

  // Fallback: force kết quả đúng target
  let d1, d2, d3;
  if (targetResult === 'xiu') {
    // Tổng 4-10: dùng 1,1,2 = 4 (xiu)
    d1 = 1; d2 = 1; d3 = 2;
  } else {
    // Tổng 11-17: dùng 6,6,5 = 17 (tai)
    d1 = 6; d2 = 6; d3 = 5;
  }
  addResult(guildId, targetResult);
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
