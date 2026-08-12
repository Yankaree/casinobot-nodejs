// ═══════════════════════════════════════════
// REWARDS — Thanh toán tiền thưởng & lưu lịch sử
// ═══════════════════════════════════════════
// Chỉ lưu vào DB: lịch sử ván + giao dịch coin. Gameplay không lưu.

const { UserModel, TransactionModel, CardGameHistoryModel } = require('../../../database/models');
const { groupByRank } = require('../engine/hand');
const { formatCoins } = require('../../../utils/formatter');

// Tính tiền "thối" theo rules.thoi (Sâm Lốc: 2 = 1x, tứ quý = 4x)
function computeThoi(hand, bet, thoiCfg) {
  const cfg = thoiCfg || { perCard: 0, two: 0, quad: 0 };
  const groups = groupByRank(hand);
  let units = 0;
  for (const [value, cards] of groups) {
    if (value === 15) {
      units += cards.length * cfg.two;
    } else if (cards.length === 4) {
      units += cfg.quad;
    } else {
      units += cards.length * cfg.perCard;
    }
  }
  return units * bet;
}

/**
 * Thanh toán cuối ván.
 * players: Player[] (có .hand cuối cùng để tính thối)
 * ranking: [{ discordId, rank }] — rank 1 = nhất
 * pot:     tổng cược đã khóa
 * Trả về { winnerGain, payouts: [{discordId, delta, label}] }
 */
async function settleGame({ guildId, sessionId, gameId, players, ranking, winnerId, pot, bet, rules }) {
  const payouts = [];
  const thoiByPlayer = new Map();

  // Tính thối cho tất cả người không về nhất
  for (const p of players) {
    if (p.discordId === winnerId) continue;
    const thoi = computeThoi(p.hand, bet, rules.thoi);
    if (thoi > 0) thoiByPlayer.set(p.discordId, thoi);
  }
  const thoiSum = [...thoiByPlayer.values()].reduce((a, b) => a + b, 0);
  const winnerGain = pot + thoiSum;

  try {
    // Người thắng nhận toàn bộ pot (+ tiền thối)
    await UserModel.addCoins(guildId, winnerId, winnerGain);
    await UserModel.addWin(guildId, winnerId);
    await TransactionModel.record({
      guildId,
      discordId: winnerId,
      amount: winnerGain,
      type: 'win',
      game: `card_${gameId}`,
    });
    payouts.push({ discordId: winnerId, delta: winnerGain, label: `+${formatCoins(winnerGain)} 🪙` });

    // Người thua: cược đã khóa từ đầu (không trừ thêm), ghi nhận thua + thối
    for (const p of players) {
      if (p.discordId === winnerId) continue;
      await UserModel.addLose(guildId, p.discordId);
      await TransactionModel.record({
        guildId,
        discordId: p.discordId,
        amount: bet,
        type: 'lose',
        game: `card_${gameId}`,
      });
      payouts.push({ discordId: p.discordId, delta: -bet, label: `-${formatCoins(bet)} 🪙` });

      const thoi = thoiByPlayer.get(p.discordId) || 0;
      if (thoi > 0) {
        await UserModel.removeCoins(guildId, p.discordId, thoi);
        await TransactionModel.record({
          guildId,
          discordId: p.discordId,
          amount: thoi,
          type: 'lose',
          game: `card_${gameId}`,
        });
        payouts.push({ discordId: p.discordId, delta: -thoi, label: `-${formatCoins(thoi)} 🪙 (thối)` });
      }
    }
  } catch (err) {
    console.error('[CardGames] settleGame error:', err.message);
  }

  // Lưu lịch sử ván
  try {
    await CardGameHistoryModel.create({
      guildId,
      game: gameId,
      sessionId,
      players: JSON.stringify(players.map((p) => p.discordId)),
      winnerId,
      result: JSON.stringify(ranking.map((r) => ({ discordId: r.discordId, rank: r.rank }))),
      totalBet: pot,
    });
  } catch (err) {
    console.error('[CardGames] save history error:', err.message);
  }

  return { winnerGain, payouts, thoiByPlayer };
}

module.exports = { settleGame, computeThoi };
