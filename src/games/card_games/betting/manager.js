// ═══════════════════════════════════════════
// BETTING — Khóa & hoàn tiền cược
// ═══════════════════════════════════════════
// Dùng chung hệ thống coin hiện có của bot (UserModel).
// Coin bị trừ ngay khi ván bắt đầu (khóa vào pot), trả thưởng khi kết thúc.

const { UserModel } = require('../../../database/models');

/**
 * Khóa cược cho danh sách người chơi.
 * Trả về { ok, locked: [discordId...], failed: [{ discordId, reason }] }
 * Nếu có người không đủ coin → hoàn tiền những người đã khóa.
 */
async function lockBets(guildId, players, bet) {
  const locked = [];
  const failed = [];

  for (const discordId of players) {
    try {
      const balance = await UserModel.getBalance(guildId, discordId);
      if (balance < bet) {
        failed.push({ discordId, reason: `Số dư **${balance.toLocaleString('vi-VN')}** 🪙 không đủ mức cược **${bet.toLocaleString('vi-VN')}** 🪙` });
        continue;
      }
      await UserModel.removeCoins(guildId, discordId, bet);
      locked.push(discordId);
    } catch (err) {
      console.error(`[CardGames] lockBets failed for ${discordId}:`, err.message);
      failed.push({ discordId, reason: 'Lỗi hệ thống khi khóa cược' });
    }
  }

  if (failed.length > 0 && locked.length > 0) {
    await refundBets(guildId, locked, bet);
  }

  return { ok: failed.length === 0, locked, failed };
}

// Hoàn tiền cược (khi hủy ván hoặc có lỗi)
async function refundBets(guildId, playerIds, bet) {
  const results = [];
  for (const discordId of playerIds) {
    try {
      await UserModel.addCoins(guildId, discordId, bet);
      results.push({ discordId, ok: true });
    } catch (err) {
      console.error(`[CardGames] refundBets failed for ${discordId}:`, err.message);
      results.push({ discordId, ok: false });
    }
  }
  return results;
}

module.exports = { lockBets, refundBets };
