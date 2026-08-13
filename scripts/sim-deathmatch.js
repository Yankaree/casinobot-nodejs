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
  console.log('\n3. Event system (15% có event)');
  // rollEvent: 85% null
  const hits = [];
  for (let i = 0; i < 20000; i++) {
    hits.push(rollEvent() ? 1 : 0);
  }
  const rate = hits.reduce((a, b) => a + b, 0) / hits.length;
  assert.ok(rate > 0.12 && rate < 0.18, `tỉ lệ event phải ~0.15, thực tế ${rate.toFixed(3)}`);
  ok(`tỉ lệ event ≈ ${(rate * 100).toFixed(1)}% (0.12-0.18)`);

  // help: kẻ yếu nhất +100% (min 5,000)
  const h = makeSession();
  h.players.get('p2').battleCoin = 2000;
  const evt = EVENT_POOL.find((e) => e.id === 'help');
  applyEvent(h, evt);
  assert.strictEqual(h.players.get('p2').battleCoin, 2000 + 5000, 'help: +5000 (tối thiểu)');
  assert.strictEqual(h.players.get('p1').battleCoin, 100000, 'người khác không đổi');
  ok('event 🎁 Trợ giúp kẻ yếu: +100% (min 5,000)');

  // tax: mọi ACTIVE -1%
  const t = makeSession();
  const evtTax = EVENT_POOL.find((e) => e.id === 'tax');
  applyEvent(t, evtTax);
  for (const p of t.players.values()) {
    assert.strictEqual(p.battleCoin, 100000 - Math.floor(100000 * 0.01));
  }
  ok('event 💰 Thuế chiến trường: mọi ACTIVE -1%');

  // lucky: một người +50% (min 2,000)
  const l = makeSession();
  const evtLucky = EVENT_POOL.find((e) => e.id === 'lucky');
  applyEvent(l, evtLucky);
  const lucky = [...l.players.values()].find((p) => p.battleCoin !== 100000);
  assert.ok(lucky, 'phải có đúng 1 người được tăng');
  assert.strictEqual(lucky.battleCoin, 100000 + 50000);
  ok('event 🍀 Vận may: 1 người ngẫu nhiên +50%');

  // chaos: một người -5%
  const c = makeSession();
  const evtChaos = EVENT_POOL.find((e) => e.id === 'chaos');
  applyEvent(c, evtChaos);
  const hit = [...c.players.values()].find((p) => p.battleCoin !== 100000);
  assert.ok(hit, 'phải có đúng 1 người bị giảm');
  assert.strictEqual(hit.battleCoin, 100000 - Math.floor(100000 * 0.05));
  ok('event 💥 Bão chiến trường: 1 người ngẫu nhiên -5%');

  // tax đánh sập người yếu → SPECTATOR (1000 - 1% = 990 < 1000)
  const s = makeSession(1000);
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

// ── 6. Auto kết quả: đủ cược → ra ngay, hết timer → chốt ──
async function testAutoResult() {
  console.log('\n6. Auto kết quả (hết phiên / toàn bộ cược)');

  // (a) Tất cả ACTIVE cược → kết quả ra NGAY, không chờ hết timer round
  config.deathmatch.roundDuration = 10; // round dài — nếu không auto sẽ mất 10s
  config.deathmatch.rollDelayMs = 2000; // rolling chỉ được bỏ qua ở path instant
  config.deathmatch.allBetDelayMs = 300;
  config.deathmatch.nextRoundDelayMs = 100000;
  config.deathmatch.eventChance = 0;

  const messagesA = [];
  const channelA = {
    send: async (payload) => {
      messagesA.push({ t: Date.now(), payload });
      return { edit: async () => {} };
    },
  };
  const clientA = { channels: { cache: new Map([['c1', channelA]]) } };

  const roomA = new DeathmatchLobby({ guildId: 'g1', channelId: 'c1', hostId: 'p1', initialCoin: 100000, minutes: 10, maxPlayers: 8 });
  const playersA = new Map([
    ['p1', { userId: 'p1', username: 'A' }],
    ['p2', { userId: 'p2', username: 'B' }],
    ['p3', { userId: 'p3', username: 'C' }],
  ]);
  const sessionA = new DeathmatchSession(roomA, playersA);
  sessionA.matchDurationMs = 60000;
  await sessionA.start(clientA);
  await new Promise((r) => setTimeout(r, 500));

  await sessionA.addBet('p1', 'tai', 10000);
  await sessionA.addBet('p2', 'xiu', 5000);
  const lastBetAt = Date.now();
  await sessionA.addBet('p3', 'tai', 20000); // cược cuối → đủ cược

  await new Promise((r) => setTimeout(r, 1500));

  const resultsA = messagesA.filter((m) => m.payload.embeds && m.payload.embeds[0].data.title && m.payload.embeds[0].data.title.includes('KẾT QUẢ'));
  assert.ok(resultsA.length >= 1, 'đủ cược → phải có embed kết quả');
  const waitA = resultsA[0].t - lastBetAt;
  assert.ok(waitA < 2500, `kết quả phải ra ngay sau cược cuối (thực tế ${waitA}ms)`);
  const rollingA = messagesA.filter((m) => m.payload.embeds && m.payload.embeds[0].data.description && String(m.payload.embeds[0].data.description).includes('Đang quay'));
  assert.strictEqual(rollingA.length, 0, 'đủ cược → BỎ QUA rolling, ra kết quả thẳng');
  ok(`tất cả ACTIVE cược → kết quả sau ~${waitA}ms (timer round 10s bị bỏ qua, không có 'Đang quay...')`);
  sessionA.stop();

  // (b) Chỉ một phần cược → phải chờ hết timer round mới có kết quả
  config.deathmatch.roundDuration = 2;
  config.deathmatch.rollDelayMs = 200;
  config.deathmatch.allBetDelayMs = 100000; // vô hiệu path early-end
  config.deathmatch.nextRoundDelayMs = 100000;

  const messagesB = [];
  const channelB = {
    send: async (payload) => {
      messagesB.push({ t: Date.now(), payload });
      return { edit: async () => {} };
    },
  };
  const clientB = { channels: { cache: new Map([['c1', channelB]]) } };

  const roomB = new DeathmatchLobby({ guildId: 'g1', channelId: 'c1', hostId: 'p1', initialCoin: 100000, minutes: 10, maxPlayers: 8 });
  const playersB = new Map([
    ['p1', { userId: 'p1', username: 'A' }],
    ['p2', { userId: 'p2', username: 'B' }],
    ['p3', { userId: 'p3', username: 'C' }],
  ]);
  const sessionB = new DeathmatchSession(roomB, playersB);
  sessionB.matchDurationMs = 60000;
  await sessionB.start(clientB);
  await new Promise((r) => setTimeout(r, 400));
  const roundStartB = sessionB.roundStartedAt;

  await sessionB.addBet('p1', 'tai', 10000);
  await sessionB.addBet('p2', 'xiu', 5000);
  // p3 KHÔNG cược → round phải chờ hết timer (2s)

  await new Promise((r) => setTimeout(r, 3500));

  const resultsB = messagesB.filter((m) => m.payload.embeds && m.payload.embeds[0].data.title && m.payload.embeds[0].data.title.includes('KẾT QUẢ'));
  assert.strictEqual(resultsB.length, 1, 'chỉ round 1 có kết quả');
  const waitB = resultsB[0].t - roundStartB;
  assert.ok(waitB >= 1500, `cược 1 phần → KHÔNG lật sớm, phải chờ hết timer (thực tế ${waitB}ms)`);
  assert.ok(waitB < 6000, `có kết quả sau khi hết timer round (thực tế ${waitB}ms)`);
  ok(`cược 1 phần → kết quả sau ~${waitB}ms (đúng timer round 2s)`);
  sessionB.stop();
}

// ── 7. Tự chỉnh Battle Coin ──
async function testSetCoin() {
  console.log('\n7. Tự chỉnh Battle Coin (setcoin)');
  const s = makeSession();
  const p2 = s.players.get('p2');
  p2.battleCoin = 500;
  p2.status = 'SPECTATOR';

  // SPECTATOR nạp lại → ACTIVE, đặt cược được
  let res = s.setBattleCoin('p2', 50000);
  assert.strictEqual(res.success, true);
  assert.strictEqual(p2.battleCoin, 50000);
  assert.strictEqual(p2.status, 'ACTIVE');
  s.isActive = true; // session đơn vị chưa start — mở cửa cược để test addBet
  const betRes = await s.addBet('p2', 'tai', 1000);
  assert.ok(betRes.success, 'sau khi tái nhập phải cược được');
  ok('SPECTATOR nạp BC >= 1,000 → ACTIVE và đặt cược được ngay');

  // set dưới ngưỡng → SPECTATOR
  res = s.setBattleCoin('p2', 900);
  assert.strictEqual(res.success, true);
  assert.strictEqual(p2.status, 'SPECTATOR');
  ok('set BC < 1,000 → SPECTATOR');

  // người ngoài trận / số âm → từ chối
  res = s.setBattleCoin('p99', 5000);
  assert.strictEqual(res.success, false);
  res = s.setBattleCoin('p2', -5);
  assert.strictEqual(res.success, false);
  ok('người không trong trận / số âm → từ chối');
}

(async () => {
  // Tránh timer kết thúc sớm của session đơn vị bắn sau khi test xong (session chưa start → _client null)
  config.deathmatch.allBetDelayMs = 100000;
  await testSettlement();
  await testSpectator();
  testEvents();
  testRanking();
  await testFullMatch();
  await testAutoResult();
  await testSetCoin();
  console.log(`\n✅ SIM DEATHMATCH: ${passed} assertions PASS`);
  process.exit(0);
})().catch((err) => {
  console.error('\n❌ SIM FAILED:', err);
  process.exit(1);
});
