const crypto = require('crypto');

const ANIMALS = [
  { name: 'bau', emoji: '🥣', label: 'Bầu' },
  { name: 'cua', emoji: '🦀', label: 'Cua' },
  { name: 'tom', emoji: '🦐', label: 'Tôm' },
  { name: 'ca', emoji: '🐟', label: 'Cá' },
  { name: 'ga', emoji: '🐓', label: 'Gà' },
  { name: 'nai', emoji: '🦌', label: 'Nai' },
];

const ANIMAL_MAP = {};
ANIMALS.forEach((a) => { ANIMAL_MAP[a.name] = a; });

function secureRandom(max) {
  return crypto.randomInt(0, max);
}

function rollOne() {
  return ANIMALS[secureRandom(ANIMALS.length)];
}

function rollDice() {
  return [rollOne(), rollOne(), rollOne()];
}

function isTriple(results) {
  return results[0].name === results[1].name && results[1].name === results[2].name;
}

function getTripleAnimal(results) {
  if (!isTriple(results)) return null;
  return results[0].name;
}

function countAnimal(results, animalName) {
  return results.filter((r) => r.name === animalName).length;
}

function getAnimal(name) {
  return ANIMAL_MAP[name] || null;
}

function formatResults(results) {
  return results.map((r) => `${r.emoji} ${r.label}`).join(' ');
}

module.exports = {
  ANIMALS,
  ANIMAL_MAP,
  rollDice,
  isTriple,
  getTripleAnimal,
  countAnimal,
  getAnimal,
  formatResults,
};
