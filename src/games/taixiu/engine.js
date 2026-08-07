const crypto = require('crypto');

function secureRandom(max) {
  return crypto.randomInt(1, max + 1);
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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

function isJackpot(d1, d2, d3) {
  return (
    (d1 === 1 && d2 === 1 && d3 === 1) ||
    (d1 === 6 && d2 === 6 && d3 === 6)
  );
}

function getDiceTotal(d1, d2, d3) {
  return d1 + d2 + d3;
}

module.exports = { rollDice, calculateResult, isJackpot, getDiceTotal };
