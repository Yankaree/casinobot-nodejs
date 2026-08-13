// ─────────────────────────────────────────────
// SIM — Tài Xỉu Deathmatch (headless, không cần Discord/DB)
// Chạy: node scripts/sim-deathmatch.js
// Kiểm tra: thanh toán zero-sum, chia theo tỉ lệ, SPECTATOR,
// event, ranking cuối, luồng trận đầy đủ (FINAL ROUND).
// ─────────────────────────────────────────────

const assert = require('assert');
const config = require('../src/config');
const { DeathmatchLobby } = require('../src/games/taixiu/deathmatch/lobby');
const DeathmatchSession = require('../src/games/taixiu/deathmatch/session');
const { rollEvent, applyEvent, demoteSpectators, EVENT_POOL } = require('../src/games/taixiu/deathmatch/events');

let passed = 0;
function ok(name) {
  passed++;
  console.log(`  ✅ ${name}`);
}

function makeSession(initialCoin = 100000) {
  const room = new DeathmatchLobby({
    guildId: 'g1',
    channelId: 'c1',
    hostId: 'p1',
    initialCoin,
    minutes: 10,
    maxPlayers: 8,
  });
  const players = new Map([
    ['p1', { userId: 'p1', username: 'A' }],
    ['p2', { userId: 'p2', username: 'B' }],
    ['p3', { userId: 'p3', username: 'C' }],
  ]);
  return new DeathmatchSession(room, players);
}

async function placeBet(session, userId, choice, amount) {
  session.isActive = true;
  const res = await session.addBet(userId, choice, amount);
  assert.strictEqual(res.success, true, `bet ${userId} phải thành công`);
  return res;
}

// ── 1. Thanh toán zero-sum + chia theo tỉ lệ ──
async function testSettlement() {
  console.log('\n1. Thanh toán zero-sum (pari-mutuel)');
  const s = makeSession();
  // Tổng Battle Coin trong trận KHÔNG BAO GIỜ đổi — cược chỉ được giữ rồi trả lại người thắng
  const before = [...s.players.values()].reduce((sum, p) => sum + p.battleCoin, 0);
  await placeBet(s, 'p1', 'tai', 10000);
  await placeBet(s, 'p2', 'xiu', 5000);
  await placeBet(s, 'p3', 'tai', 20000);

  const summary = s.settleRound('tai');

  // p2 (thua) đã bị trừ 5000 lúc đặt — tổng Battle Coin không đổi
  const after = [...s.players.values()].reduce((sum, p) => sum + p.battleCoin, 0);
  assert.ok(Math.abs(before - after) <= 1, `tổng BC phải bảo toàn (±1 làm tròn): ${before} -> ${after}`);

  const p1 = s.players.get('p1');
  const p3 = s.players.get('p3');
  const p2 = s.players.get('p2');

  // loserTotal=5000, winnerTotal=30000 → p1 share=1666, p3 share=3333
  assert.strictEqual(p1.battleCoin, 100000 - 10000 + 10000 + 1666);
  assert.strictEqual(p3.battleCoin, 100000 - 20000 + 20000 + 3333);
  assert.strictEqual(p2.battleCoin, 100000 - 5000);
  assert.strictEqual(p1.wins, 1);
  assert.strictEqual(p2.losses, 1);
  assert.strictEqual(summary.loserTotal, 5000);
  ok('người thắng nhận vốn + phần chia, người thua mất đúng số cược, tổng BC bảo toàn');

  // Cùng cửa: không ai thua → không mất gì
  const s2 = makeSession();
  const before2 = [...s2.players.values()].reduce((sum, p) => sum + p.battleCoin, 0);
  await placeBet(s2, 'p1', 'tai', 10000);
  await placeBet(s2, 'p2', 'tai', 5000);
  s2.settleRound('tai');
  const after2 = [...s2.players.values()].reduce((sum, p) => sum + p.battleCoin, 0);
  assert.strictEqual(before2, after2, 'cùng cửa → không ai mất');
  assert.strictEqual(s2.players.get('p1').battleCoin, 100000 - 10000 + 10000);
  ok('tất cả cùng cửa → ai cũng lấy lại vốn, không mất gì');
}

// ── 2. SPECTATOR khi Battle Coin < 1000 ──
async function testSpectator() {
  console.log('\n2. ACTIVE → SPECTATOR khi hết Battle Coin');
  const s = makeSession(1500);
  const p1 = s.players.get('p1');
  p1.battleCoin = 1500;
  await placeBet(s, 'p1', 'tai', 1500); // xuống 0
  s.settleRound('xiu'); // thua → 0

  const demoted = demoteSpectators(s);
  assert.strictEqual(demoted.length, 1);
  assert.strictEqual(p1.status, 'SPECTATOR');

  const res = await s.addBet('p1', 'tai', 1000);
  assert.strictEqual(res.success, false);
  assert.ok(res.message.includes('SPECTATOR'), 'SPECTATOR không được cược');
  ok('Battle Coin < 1000 → SPECTATOR, không cược được');

  // Người trên ngưỡng vẫn ACTIVE
  const s2 = makeSession();
  assert.strictEqual(demoteSpectators(s2).length, 0);
  assert.strictEqual(s2.players.get('p2').status, 'ACTIVE');
  ok('trên ngưỡng → vẫn ACTIVE');
}

// ── 3. Event system ──
function testEvents() {
  console.log('\n3. Event system (40% có event)');
  // rollEvent: 60% null
  const hits = [];
  for (let i = 0; i < 20000; i++) {
    hits.push(rollEvent() ? 1 : 0);
  }
  const rate = hits.reduce((a, b) => a + b, 0) / hits.length;
  assert.ok(rate > 0.35 && rate < 0.45, `tỉ lệ event phải ~0.4, thực tế ${rate.toFixed(3)}`);
  ok(`tỉ lệ event ≈ ${(rate * 100).toFixed(1)}% (0.35-0.45)`);

  // help: kẻ yếu nhất +50% (min 5,000)
  const h = makeSession();
  h.players.get('p2').battleCoin = 2000;
  const evt = EVENT_POOL.find((e) => e.id === 'help');
  applyEvent(h, evt);
  assert.strictEqual(h.players.get('p2').battleCoin, 2000 + 5000, 'help: +5000 (tối thiểu)');
  assert.strictEqual(h.players.get('p1').battleCoin, 100000, 'người khác không đổi');
  ok('event 🎁 Trợ giúp kẻ yếu: +50% (min 5,000)');

  // tax: mọi ACTIVE -5%
  const t = makeSession();
  const evtTax = EVENT_POOL.find((e) => e.id === 'tax');
  applyEvent(t, evtTax);
  for (const p of t.players.values()) {
    assert.strictEqual(p.battleCoin, 100000 - Math.floor(100000 * 0.05));
  }
  ok('event 💰 Thuế chiến trường: mọi ACTIVE -5%');

  // lucky: một người +20% (min 2,000)
  const l = makeSession();
  const evtLucky = EVENT_POOL.find((e) => e.id === 'lucky');
  applyEvent(l, evtLucky);
  const lucky = [...l.players.values()].find((p) => p.battleCoin !== 100000);
  assert.ok(lucky, 'phải có đúng 1 người được tăng');
  assert.strictEqual(lucky.battleCoin, 100000 + 20000);
  ok('event 🍀 Vận may: 1 người ngẫu nhiên +20%');

  // chaos: một người -30%
  const c = makeSession();
  const evtChaos = EVENT_POOL.find((e) => e.id === 'chaos');
  applyEvent(c, evtChaos);
  const hit = [...c.players.values()].find((p) => p.battleCoin !== 100000);
  assert.ok(hit, 'phải có đúng 1 người bị giảm');
  assert.strictEqual(hit.battleCoin, 100000 - Math.floor(100000 * 0.3));
  ok('event 💥 Bão chiến trường: 1 người ngẫu nhiên -30%');

  // tax đánh sập người yếu → SPECTATOR (1050 - 5% = 998 < 1000)
  const s = makeSession(1050);
  const evtTax2 = EVENT_POOL.find((e) => e.id === 'tax');
  const applied = applyEvent(s, evtTax2);
  assert.strictEqual(s.players.get('p1').status, 'SPECTATOR');
  assert.ok(applied.lines.length > 0);
  ok('event có thể đẩy người yếu xuống SPECTATOR');
}

// ── 4. Ranking cuối trận ──
function testRanking() {
  console.log('\n4. Ranking cuối trận');
  const s = makeSession();
  s.players.get('p1').battleCoin = 5000;
  s.players.get('p2').battleCoin = 90000;
  s.players.get('p3').battleCoin = 30000;
  s.players.get('p2').status = 'SPECTATOR';
  s.matchState = 'FINAL_ROUND';

  const ranking = s.computeRanking();
  assert.strictEqual(ranking[0].userId, 'p2');
  assert.strictEqual(ranking[1].userId, 'p3');
  assert.strictEqual(ranking[2].userId, 'p1');
  assert.strictEqual(ranking[0].rank, 1);
  assert.strictEqual(ranking[0].status, 'SPECTATOR');
  ok('xếp hạng theo Battle Coin giảm dần, giữ trạng thái');

  const lb = s.getLeaderboardEmbed();
  assert.ok(lb.data.title.includes('BẢNG XẾP HẠNG'));
  ok('getLeaderboardEmbed tạo embed leaderboard riêng (không dùng của Tài Xỉu thường)');
}

// ── 5. Trận đầy đủ: round → FINAL ROUND → finish ──
async function testFullMatch() {
  console.log('\n5. Trận đầy đủ (round loop → FINAL ROUND → kết thúc)');

  // Rút ngắn timer để test nhanh; tắt event để kiểm tra bảo toàn BC thuần túy
  // (event cố ý TẠO/HỦY Battle Coin — cân bằng trận — đã test riêng ở nhóm 3)
  config.deathmatch.roundDuration = 2;
  config.deathmatch.rollDelayMs = 50;
  config.deathmatch.noBetDelayMs = 100;
  config.deathmatch.nextRoundDelayMs = 100;
  config.deathmatch.allBetDelayMs = 100;
  config.deathmatch.eventChance = 0;

  const messages = [];
  const channel = {
    send: async (payload) => {
      messages.push(payload);
      return { edit: async () => {} };
    },
  };
  const client = { channels: { cache: new Map([['c1', channel]]) } };

  const room = new DeathmatchLobby({
    guildId: 'g1',
    channelId: 'c1',
    hostId: 'p1',
    initialCoin: 100000,
    minutes: 10,
    maxPlayers: 8,
  });
  const players = new Map([
    ['p1', { userId: 'p1', username: 'A' }],
    ['p2', { userId: 'p2', username: 'B' }],
    ['p3', { userId: 'p3', username: 'C' }],
  ]);
  const session = new DeathmatchSession(room, players);
  session.matchDurationMs = 2000; // trận 2 giây → chuyển FINAL_ROUND nhanh

  let finishedCount = 0;
  session.on('finished', () => finishedCount++);

  await session.start(client);

  // Round 1: ai cũng cược → kết thúc sớm
  await new Promise((r) => setTimeout(r, 700));
  await session.addBet('p1', 'tai', 10000);
  await session.addBet('p2', 'xiu', 5000);
  await session.addBet('p3', 'tai', 20000);

  // Chờ trận chạy qua nhiều round, hết giờ trận → FINAL ROUND → finish
  await new Promise((r) => setTimeout(r, 4500));

  assert.strictEqual(session.matchState, 'FINISHED', 'trận phải kết thúc');
  assert.strictEqual(finishedCount, 1, 'sự kiện finished chỉ bắn 1 lần');
  assert.ok(session.finalRanking.length === 3);
  assert.strictEqual(session.finalRanking[0].rank, 1);

  const finalTitles = messages.filter(
    (m) => m.embeds && m.embeds[0] && m.embeds[0].data && m.embeds[0].data.title
  );
  const hasFinal = finalTitles.some((m) => m.embeds[0].data.title.includes('FINAL ROUND'));
  const hasEnd = finalTitles.some((m) => m.embeds[0].data.title.includes('KẾT THÚC TRẬN'));
  assert.ok(hasFinal, 'phải có thông báo FINAL ROUND');
  assert.ok(hasEnd, 'phải có embed kết thúc trận');
  assert.strictEqual(session.activePlayers().length, 3, 'tất cả vẫn ACTIVE (chưa ai vỡ nợ)');

  // Tổng Battle Coin bảo toàn sau cả trận
  const total = session.finalRanking.reduce((sum, r) => sum + r.battleCoin, 0);
  assert.ok(Math.abs(total - 300000) <= 20, `tổng BC sau trận ≈ ${total}`);

  ok(`trận chạy ${session.roundNumber} round, FINAL ROUND + ranking, tổng BC bảo toàn (${total.toLocaleString('vi-VN')})`);
  session.stop();
}

(async () => {
  // Tránh timer kết thúc sớm của session đơn vị bắn sau khi test xong (session chưa start → _client null)
  config.deathmatch.allBetDelayMs = 100000;
  await testSettlement();
  await testSpectator();
  testEvents();
  testRanking();
  await testFullMatch();
  console.log(`\n✅ SIM DEATHMATCH: ${passed} assertions PASS`);
  process.exit(0);
})().catch((err) => {
  console.error('\n❌ SIM FAILED:', err);
  process.exit(1);
});
