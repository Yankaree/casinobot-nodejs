// ═══════════════════════════════════════════
// JACKPOT SCHEDULER — Tự động reset hũ mỗi 7:00 (GMT+7) hằng ngày
// ═══════════════════════════════════════════
// Dùng setTimeout tính tới 7:00 sáng (giờ GMT+7) kế tiếp, sau khi reset
// xong lại hẹn giờ cho ngày hôm sau. Nếu reset thất bại (mất kết nối DB)
// sẽ thử lại sau 60 giây.

const config = require('../config');
const { JackpotModel } = require('../database/models');

const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7
const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;

// Số ms còn lại tới lần reset kế tiếp (7:00 GMT+7)
function msUntilNextReset(now = Date.now()) {
  const gmt7Now = new Date(now + GMT7_OFFSET_MS);
  const target = new Date(gmt7Now);
  target.setHours(config.jackpot.dailyResetHourGmt7, 0, 0, 0);
  let targetUtc = target.getTime() - GMT7_OFFSET_MS;
  if (targetUtc <= now) targetUtc += DAY_MS;
  return targetUtc - now;
}

let timer = null;

function schedule(delayMs) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const resetBalance = await JackpotModel.resetAllToDefault();
      console.log(
        `[Jackpot] ✅ Đã reset hũ hằng ngày về ${resetBalance.toLocaleString('vi-VN')} 🪙 lúc ` +
          new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
      );
      schedule(DAY_MS);
    } catch (err) {
      console.error('[Jackpot] Reset hũ thất bại, thử lại sau 60s:', err.message);
      schedule(RETRY_MS);
    }
  }, delayMs);
}

function startJackpotResetScheduler() {
  if (timer) return;
  const delay = msUntilNextReset();
  console.log(
    `[Jackpot] ⏰ Hẹn giờ reset hũ hằng ngày lúc ${String(config.jackpot.dailyResetHourGmt7).padStart(2, '0')}:00 (GMT+7) — lần đầu sau ${Math.round(delay / 60000)} phút`
  );
  schedule(delay);
}

module.exports = { startJackpotResetScheduler, msUntilNextReset };
