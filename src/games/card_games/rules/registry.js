// ═══════════════════════════════════════════
// RULE — Registry các game bài
// ═══════════════════════════════════════════
// Muốn thêm game mới: tạo file trong rules/ và đăng ký vào GAME_MODULES.

const tienlenmiennam = require('./tienlenmiennam');
const tienlen = require('./tienlen');
const samloc = require('./samloc');

const GAME_MODULES = [tienlenmiennam, tienlen, samloc];

const RULES_BY_ID = new Map(GAME_MODULES.map((m) => [m.id, m.buildRule()]));

function getGame(gameType) {
  return RULES_BY_ID.get(gameType) || null;
}

function getAllGames() {
  return [...RULES_BY_ID.values()];
}

function isRegistered(gameType) {
  return RULES_BY_ID.has(gameType);
}

/**
 * Tự tính giới hạn người chơi tối đa theo luật:
 *  floor(số lá bài / số lá mỗi người)
 * Ví dụ: Tiến Lên 52/13 = 4 người · Sâm Lốc 52/10 = 5 người.
 */
function calculateMaxPlayers(gameType) {
  const rule = getGame(gameType);
  if (!rule) return null;
  return Math.floor((rule.deckCount * 52) / rule.cardsPerPlayer);
}

// Danh sách game cho slash command choices
function getGameChoices() {
  return getAllGames().map((g) => ({
    name: `${g.emoji} ${g.name}`,
    value: g.id,
  }));
}

module.exports = {
  getGame,
  getAllGames,
  isRegistered,
  calculateMaxPlayers,
  getGameChoices,
  GAME_MODULES,
};
