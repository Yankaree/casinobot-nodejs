const { TransactionModel } = require('../database/models');
const leaderboardCache = require('./leaderboardCache');
const config = require('../config');

const GAME_LABELS = {
  taixiu: 'Tài Xỉu',
  baucua: 'Bầu Cua',
  globaltaixiu: 'Tài Xỉu Global',
  work: 'Đi làm',
  admin: 'Quản trị',
  transfer: 'Chuyển coin',
};

const MEDALS = ['🥇', '🥈', '🥉'];

const cooldowns = new Map();

function isRateLimited(userId) {
  const last = cooldowns.get(userId) || 0;
  return Date.now() - last < config.leaderboard.cooldownMs;
}

function setCooldown(userId) {
  cooldowns.set(userId, Date.now());
}

async function getServerTop(guildId) {
  const cached = leaderboardCache.get('serverTop', guildId);
  if (cached) return cached;
  const top = await TransactionModel.getServerTop(guildId, config.leaderboard.topCount);
  leaderboardCache.set('serverTop', guildId, top);
  return top;
}

async function getGlobalTop() {
  const cached = leaderboardCache.get('globalTop');
  if (cached) return cached;
  const top = await TransactionModel.getGlobalTop(config.leaderboard.topCount);
  leaderboardCache.set('globalTop', null, top);
  return top;
}

function getGameLabel(game) {
  return GAME_LABELS[game] || game || 'Không rõ';
}

function formatRankLines(top) {
  if (!top.length) return 'Chưa có người chơi nào.';
  return top
    .map((entry, index) => {
      const medal = MEDALS[index] || `${index + 1}.`;
      const coins = entry.coin ?? entry.net ?? 0;
      return `${medal} <@${entry.discord_id}> — 💰 **${coins.toLocaleString('vi-VN')}** 🪙`;
    })
    .join('\n');
}

module.exports = {
  GAME_LABELS,
  MEDALS,
  isRateLimited,
  setCooldown,
  getServerTop,
  getGlobalTop,
  getGameLabel,
  formatRankLines,
};
