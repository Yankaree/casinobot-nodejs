// ═══════════════════════════════════════════
// REWARDS — Thanh toán tiền thưởng & lưu lịch sử
// ═══════════════════════════════════════════
// Chỉ lưu vào DB: lịch sử ván + giao dịch coin. Gameplay không lưu.
//
// Hai chế độ thanh toán:
//   1. Theo hạng (rules.payout.rankMultipliers — Tiến Lên Miền Nam / Tiến Lên):
//        hạng 1: +1x cược · hạng 2: +0.5x · hạng 3: -0.5x · chót: -1x (mất hết)
//        Người về chót luôn mất hết cược dù ván có ít người chơi.
//   2. Nhất ăn cả (mặc định — Sâm Lốc, ăn trắng, báo Sâm): người thắng nhận toàn pot (+ thối).

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
 * Hệ số trả thưởng theo hạng (thuần — không đụng DB, dễ test).
 * ranking:  [{ discordId, rank }] — rank 1 = nhất
 * playerCount: số người chơi trong ván
 * bet:      mức cược
 * multipliers: [1, 0.5, -0.5, -1] cho hạng 1..4
 * Trả về [{ discordId, rank, multiplier, delta, payout }]:
 *   delta  = lãi/lỗ ròng (âm = thua, dương = lãi)
 *   payout = số coin cộng lại khi thanh toán (cược đã khóa từ đầu)
 *            = bet + delta
 */
function computeTieredDeltas(ranking, playerCount, bet, multipliers) {
  const list = multipliers || [1, 0.5, -0.5, -1];
  return ranking.map((r) => {
    const rank = r.rank || playerCount;
    // Người về chót luôn mất hết cược (kể cả khi ván ít người)
    let multiplier = -1;
    if (rank === 1) multiplier = 1;
    else if (rank === playerCount) multiplier = -1;
    else multiplier = list[rank - 1] ?? -1;

    const delta = Math.round(bet * multiplier);
    return {
      discordId: r.discordId,
      rank,
      multiplier,
      delta,
      payout: bet + delta,
    };
  });
}

// Thanh toán theo hạng (Tiến Lên Miền Nam / Tiến Lên)
async function settleTiered({ guildId, sessionId, gameId, players, ranking, bet, rules }) {
  const payouts = [];
  const deltas = computeTieredDeltas(
    ranking,
    players.length,
    bet,
    rules.payout.rankMultipliers
  );

  for (const d of deltas) {
    const player = players.find((p) => p.discordId === d.discordId);
    if (!player) continue;

    if (d.delta > 0) {
      // Nhất (+1x) / Nhì (+0.5x): được cộng lại cược + lãi
      await UserModel.addCoins(guildId, d.discordId, d.payout);
      await UserModel.addWin(guildId, d.discordId);
      await TransactionModel.record({
        guildId,
        discordId: d.discordId,
        amount: d.delta,
        type: 'win',
        game: `card_${gameId}`,
      });
      payouts.push({
        discordId: d.discordId,
        delta: d.delta,
        label: `+${formatCoins(d.delta)} 🪙`,
      });
    } else if (d.delta < 0) {
      // Ba (-0.5x): trả lại nửa cược · Bét (-1x): mất hết
      if (d.payout > 0) {
        await UserModel.addCoins(guildId, d.discordId, d.payout);
      }
      await UserModel.addLose(guildId, d.discordId);
      await TransactionModel.record({
        guildId,
        discordId: d.discordId,
        amount: -d.delta,
        type: 'lose',
        game: `card_${gameId}`,
      });
      payouts.push({
        discordId: d.discordId,
        delta: d.delta,
        label: `-${formatCoins(-d.delta)} 🪙`,
      });
    }
  }

  await saveHistory({ guildId, gameId, sessionId, players, ranking, pot: bet * players.length });
  const winnerGain = deltas.find((d) => d.delta > 0 && d.rank === 1)?.delta || 0;
  return { winnerGain, payouts, thoiByPlayer: new Map() };
}

// Nhất ăn cả: người thắng nhận toàn bộ pot (+ tiền thối)
async function settleWinnerTakesAll({ guildId, sessionId, gameId, players, ranking, winnerId, pot, bet, rules }) {
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

  await saveHistory({ guildId, gameId, sessionId, players, ranking, pot });
  return { winnerGain, payouts, thoiByPlayer };
}

async function saveHistory({ guildId, gameId, sessionId, players, ranking, pot }) {
  try {
    await CardGameHistoryModel.create({
      guildId,
      game: gameId,
      sessionId,
      players: JSON.stringify(players.map((p) => p.discordId)),
      winnerId: ranking[0]?.discordId || null,
      result: JSON.stringify(ranking.map((r) => ({ discordId: r.discordId, rank: r.rank }))),
      totalBet: pot,
    });
  } catch (err) {
    console.error('[CardGames] save history error:', err.message);
  }
}

/**
 * Thanh toán cuối ván.
 * players: Player[] (có .hand cuối cùng để tính thối)
 * ranking: [{ discordId, rank }] — rank 1 = nhất
 * pot:     tổng cược đã khóa
 * reason:  'normal' | 'white-win' | 'bao-sam-success' | 'bao-sam-fail'
 * Trả về { winnerGain, payouts: [{discordId, delta, label}], thoiByPlayer }
 */
async function settleGame({ guildId, sessionId, gameId, players, ranking, winnerId, pot, bet, rules, reason }) {
  const payoutCfg = rules && rules.payout;
  const hasTiered = payoutCfg && Array.isArray(payoutCfg.rankMultipliers);
  const ranksDistinct =
    ranking.length === players.length &&
    new Set(ranking.map((r) => r.rank)).size === ranking.length;

  // Trả theo hạng chỉ áp dụng cho ván chơi tới cùng (đủ hạng 1..N).
  // Ăn trắng / kết thúc sớm → nhất vẫn ăn cả pot.
  if (hasTiered && ranksDistinct && reason === 'normal') {
    return settleTiered({ guildId, sessionId, gameId, players, ranking, bet, rules });
  }
  return settleWinnerTakesAll({ guildId, sessionId, gameId, players, ranking, winnerId, pot, bet, rules });
}

module.exports = { settleGame, computeThoi, computeTieredDeltas };
