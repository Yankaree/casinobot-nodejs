const crypto = require('crypto');

const GLOBAL_KEY = 'global';

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

function getStreakInfo() {
  const history = getHistory();
  if (history.length === 0) return { length: 0, type: null };

  const last = history[history.length - 1];
  let length = 1;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i] === last) length++;
    else break;
  }
  return { length, type: last };
}

function gaussianRandom(mean = 0.5, stddev = 0.15) {
  const u1 = secureRandomFloat();
  const u2 = secureRandomFloat();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

function getMomentumFactor(streakLength) {
  if (streakLength <= 1) return 0.50;
  if (streakLength === 2) return 0.52;
  if (streakLength === 3) return 0.55;
  if (streakLength === 4) return 0.48;
  if (streakLength === 5) return 0.42;
  return 0.35;
}

function getRhythmFactor() {
  const history = getHistory();
  if (history.length < 3) return 0;

  const recent = history.slice(-10);
  let shortStreaks = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] === recent[i - 1]) shortStreaks++;
  }
  const streakRatio = shortStreaks / (recent.length - 1);

  if (streakRatio > 0.5) return 0.03;
  if (streakRatio > 0.35) return 0.01;
  return 0;
}

function rollDice() {
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

function rollDiceWithWeight() {
  const jackpotRoll = secureRandom(200);
  if (jackpotRoll === 0) {
    const triple = secureRandom(2) === 1 ? 1 : 6;
    addResult('tai');
    return { d1: triple, d2: triple, d3: triple };
  }

  const { length: streakLength, type: streakType } = getStreakInfo();

  if (streakType && streakLength >= 2) {
    const momentum = getMomentumFactor(streakLength);
    const rhythm = getRhythmFactor();
    const keepStreakChance = momentum + rhythm;
    const flipChance = 1 - keepStreakChance;
    const noise = gaussianRandom(0, 0.05);
    const adjustedFlipChance = Math.max(0.15, Math.min(0.85, flipChance + noise));

    if (secureRandomFloat() < adjustedFlipChance) {
      const targetResult = streakType === 'tai' ? 'xiu' : 'tai';
      return rollForTarget(targetResult);
    }
  }

  const bias = gaussianRandom(0.5, 0.03);
  const targetResult = bias >= 0.5 ? 'tai' : 'xiu';
  return rollForTarget(targetResult);
}

function rollForTarget(targetResult) {
  let attempts = 0;
  while (attempts < 200) {
    const d1 = secureRandom(6);
    const d2 = secureRandom(6);
    const d3 = secureRandom(6);
    const result = calculateResult(d1, d2, d3);

    if (result === targetResult) {
      addResult(result);
      return { d1, d2, d3 };
    }
    attempts++;
  }

  let d1, d2, d3;
  if (targetResult === 'xiu') {
    d1 = 1; d2 = 1; d3 = 2;
  } else {
    d1 = 6; d2 = 6; d3 = 5;
  }
  addResult(targetResult);
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
