// ─────────────────────────────────────────────
// EVENT SYSTEM — Tài Xỉu Deathmatch
// Chạy trước khi mở cược mỗi round: 85% không có event,
// 15% có event (hiếm hơn, để trận đấu chủ yếu theo kỹ năng).
// Event chỉ tác động lên Battle Coin trong trận (RAM), mục tiêu:
// cân bằng người dẫn đầu, giúp kẻ yếu quay lại, tạo biến động.
// Hiệu ứng bất lợi được nerf mạnh, hiệu ứng có lợi được buff.
// ─────────────────────────────────────────────

const config = require('../../../config');

function activePlayers(session) {
  return [...session.players.values()].filter((p) => p.status === 'ACTIVE');
}

function randomPlayer(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Kiểm tra & chuyển người chơi dưới ngưỡng thành SPECTATOR
function demoteSpectators(session) {
  const demoted = [];
  for (const p of session.players.values()) {
    if (p.status === 'ACTIVE' && p.battleCoin < config.deathmatch.minBattleCoin) {
      p.status = 'SPECTATOR';
      demoted.push(p);
    }
  }
  return demoted;
}

// 🎁 Trợ giúp kẻ yếu — người ít Battle Coin nhất +100% (tối thiểu 5,000)
function applyHelpWeakest(session) {
  const actives = activePlayers(session);
  if (actives.length === 0) return [];
  const weakest = actives.reduce((a, b) => (a.battleCoin < b.battleCoin ? a : b));
  const bonus = Math.max(Math.floor(weakest.battleCoin * config.deathmatch.helpPercent), 5000);
  weakest.battleCoin += bonus;
  return [{ user: weakest, bonus }];
}

// 💰 Thuế chiến trường — mọi người đang ACTIVE mất 1% Battle Coin
function applyTax(session) {
  const actives = activePlayers(session);
  const taxed = [];
  for (const p of actives) {
    const cut = Math.floor(p.battleCoin * config.deathmatch.taxPercent);
    if (cut > 0) {
      p.battleCoin -= cut;
      taxed.push({ user: p, cut });
    }
  }
  demoteSpectators(session);
  return taxed;
}

// 🍀 Vận may — một người đang ACTIVE ngẫu nhiên +50% (tối thiểu 2,000)
function applyLucky(session) {
  const actives = activePlayers(session);
  if (actives.length === 0) return [];
  const p = randomPlayer(actives);
  const bonus = Math.max(Math.floor(p.battleCoin * config.deathmatch.luckyPercent), 2000);
  p.battleCoin += bonus;
  return [{ user: p, bonus }];
}

// 💥 Bão chiến trường — một người đang ACTIVE ngẫu nhiên -5%
function applyChaos(session) {
  const actives = activePlayers(session);
  if (actives.length === 0) return [];
  const p = randomPlayer(actives);
  const cut = Math.floor(p.battleCoin * config.deathmatch.hitPercent);
  p.battleCoin -= cut;
  const demoted = demoteSpectators(session);
  return [{ user: p, cut }, ...demoted.map((d) => ({ user: d, cut: 0, demoted: true }))];
}

const EVENT_POOL = [
  {
    id: 'help',
    name: 'Trợ giúp kẻ yếu',
    emoji: '🎁',
    desc: 'Người có ít Battle Coin nhất được tăng vốn!',
    apply: applyHelpWeakest,
  },
  {
    id: 'tax',
    name: 'Thuế chiến trường',
    emoji: '💰',
    desc: 'Mọi chiến binh đang ACTIVE phải nộp 1% Battle Coin!',
    apply: applyTax,
  },
  {
    id: 'lucky',
    name: 'Vận may',
    emoji: '🍀',
    desc: 'Một chiến binh may mắn được tăng 50% Battle Coin!',
    apply: applyLucky,
  },
  {
    id: 'chaos',
    name: 'Bão chiến trường',
    emoji: '💥',
    desc: 'Một chiến binh ngẫu nhiên mất 5% Battle Coin!',
    apply: applyChaos,
  },
];

/**
 * Quyết định round này có event hay không.
 * @returns {object|null} event def hoặc null (85% null, 15% có event)
 */
function rollEvent() {
  if (Math.random() >= config.deathmatch.eventChance) return null;
  return EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
}

/**
 * Áp dụng event lên session, trả về object mô tả để hiển thị.
 */
function applyEvent(session, eventDef) {
  const affected = eventDef.apply(session);
  const lines = affected
    .filter((a) => a.cut !== 0 || a.bonus !== 0 || a.demoted)
    .map((a) => {
      if (a.demoted) return `👁️ <@${a.user.userId}> → **SPECTATOR** (hết Battle Coin)`;
      if (a.bonus) return `<@${a.user.userId}> **+${a.bonus.toLocaleString('vi-VN')}** Battle Coin`;
      return `<@${a.user.userId}> **-${a.cut.toLocaleString('vi-VN')}** Battle Coin`;
    });

  return {
    ...eventDef,
    lines: lines.length > 0 ? lines : ['(Không ai bị ảnh hưởng)'],
  };
}

module.exports = { rollEvent, applyEvent, demoteSpectators, EVENT_POOL };
