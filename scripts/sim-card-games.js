// ═══════════════════════════════════════════
// SIM — Kiểm tra headless card game engine & session
// Chạy: node scripts/sim-card-games.js
// (không cần Discord / DB — dùng stub client + stub bank)
// ═══════════════════════════════════════════

const assert = require('assert');
const { createDeck, deal } = require('../src/games/card_games/engine/deck');
const { analyze, validatePlay, canPass, findSmallestPlay } = require('../src/games/card_games/engine/validator');
const { compareCombos } = require('../src/games/card_games/engine/comparator');
const { resolveCards } = require('../src/games/card_games/engine/card');
const { sortHand } = require('../src/games/card_games/engine/hand');
const { calculateMaxPlayers, getGame } = require('../src/games/card_games/rules/registry');
const { checkWhiteWin } = require('../src/games/card_games/rules/whiteWin');
const { calculateThoi } = require('../src/games/card_games/rules/samloc');
const { CARD_GAME_CONFIG } = require('../src/games/card_games/config');
const betting = require('../src/games/card_games/betting/manager');
const payout = require('../src/games/card_games/rewards/payout');
const { CardSession } = require('../src/games/card_games/session');

let passed = 0;
function ok(name) {
  passed++;
  console.log(`  ✅ ${name}`);
}

// Cửa sổ ngắn để test nhanh (không ảnh hưởng logic)
CARD_GAME_CONFIG.baoSamWindowMs = 300;
CARD_GAME_CONFIG.catchSamWindowMs = 300;
CARD_GAME_CONFIG.turnTimeoutMs = 30_000;

// ── Stub Discord ──
class StubMessage {
  constructor(payload = {}) {
    this.content = payload.content || '';
    this.embeds = payload.embeds || [];
    this.components = payload.components || [];
    this.edits = 0;
  }
  async edit(payload) {
    Object.assign(this, payload);
    this.edits++;
    return this;
  }
}
class StubChannel {
  constructor(id) {
    this.id = id;
    this.messages = [];
  }
  async send(payload) {
    const m = new StubMessage(payload);
    this.messages.push(m);
    return m;
  }
}
class StubUser {
  constructor(id, name) {
    this.id = id;
    this.username = name;
    this.sent = [];
  }
  async send(payload) {
    const m = new StubMessage(payload);
    this.sent.push(m);
    return m;
  }
}
class StubClient {
  constructor() {
    this.channels = { cache: new Map() };
    this.users = { fetch: async (id) => this.userMap.get(id) };
    this.userMap = new Map();
  }
}

// ── Stub bank ──
const balances = new Map();
const settleLog = [];
betting.lockBets = async (guildId, players, bet) => {
  for (const p of players) balances.set(p, (balances.get(p) ?? 100_000) - bet);
  return { ok: true, locked: players, failed: [] };
};
betting.refundBets = async (guildId, players, bet) => {
  for (const p of players) balances.set(p, (balances.get(p) ?? 0) + bet);
  return [];
};
payout.settleGame = async (args) => {
  settleLog.push({ gameId: args.gameId, winnerId: args.winnerId, pot: args.pot, ranking: args.ranking });
  const payouts = [];
  for (const p of args.players) {
    if (p.discordId === args.winnerId) {
      payouts.push({ discordId: p.discordId, delta: args.pot, label: `+${args.pot} 🪙` });
      balances.set(p.discordId, (balances.get(p.discordId) ?? 0) + args.pot);
    } else {
      payouts.push({ discordId: p.discordId, delta: -args.bet, label: `-${args.bet} 🪙` });
    }
  }
  return { winnerGain: args.pot, payouts, thoiByPlayer: new Map() };
};

function buildClient(playerCount) {
  const client = new StubClient();
  const channel = new StubChannel('ch-test');
  client.channels.cache.set('ch-test', channel);
  for (let i = 1; i <= playerCount; i++) {
    const id = `U${i}`;
    client.userMap.set(id, new StubUser(id, `Người ${i}`));
  }
  return { client, channel };
}

function buildLobby(gameType, playerCount) {
  const players = Array.from({ length: playerCount }, (_, i) => `U${i + 1}`);
  return {
    id: 'lobby-test',
    guildId: 'G1',
    channelId: 'ch-test',
    gameType,
    bet: 10_000,
    hostId: players[0],
    playerNames: Object.fromEntries(players.map((p, i) => [p, `Người ${i + 1}`])),
    players,
    message: new StubMessage(),
    session: null,
  };
}

// ── 1. Engine unit checks ──
console.log('\n📦 Engine checks');
{
  const deck = createDeck();
  assert.strictEqual(deck.length, 52, '52 lá');
  ok('createDeck = 52 lá');

  const { hands } = deal(deck, 4, 13);
  assert.strictEqual(hands.length, 4);
  assert.ok(hands.every((h) => h.length === 13), 'mỗi người 13 lá');
  ok('deal 4 × 13 lá');

  const rules = getGame('tienlenmiennam');

  // Combos
  const single = analyze(resolveCards(['s3']), rules);
  assert.strictEqual(single.type, 'single');
  const pair = analyze(resolveCards(['s5', 'h5']), rules);
  assert.strictEqual(pair.type, 'pair');
  const triple = analyze(resolveCards(['s7', 'h7', 'c7']), rules);
  assert.strictEqual(triple.type, 'triple');
  const quad = analyze(resolveCards(['sA', 'hA', 'cA', 'dA']), rules);
  assert.strictEqual(quad.type, 'quad');
  const straight = analyze(resolveCards(['s5', 'h6', 'c7', 'd8', 's9']), rules);
  assert.strictEqual(straight.type, 'straight');
  const straightWithTwo = analyze(resolveCards(['s3', 'h4', 'c5', 'd6', 'h2']), rules);
  assert.strictEqual(straightWithTwo.ok, false);
  const threePairs = analyze(resolveCards(['s3', 'h3', 's4', 'h4', 's5', 'h5']), rules);
  assert.strictEqual(threePairs.type, 'threePairs');
  const fourPairs = analyze(resolveCards(['s3', 'h3', 's4', 'h4', 's5', 'h5', 's6', 'h6']), rules);
  assert.strictEqual(fourPairs.type, 'fourPairs');
  const invalid = analyze(resolveCards(['s3', 'h4']), rules);
  assert.strictEqual(invalid.ok, false);
  ok('analyze: single/pair/triple/quad/straight/3-4 đôi thông/invalid');

  // Comparator (table truyền thẳng combo, không bọc {combo})
  assert.strictEqual(compareCombos(pair, analyze(resolveCards(['s4', 'h4']), rules), rules), true);
  assert.strictEqual(compareCombos(pair, analyze(resolveCards(['s6', 'h6']), rules), rules), false);
  const singleTwo = analyze(resolveCards(['s2']), rules);
  assert.strictEqual(compareCombos(quad, singleTwo, rules), true, 'tứ quý chặt 2');
  const tp = analyze(resolveCards(['s3', 'h3', 's4', 'h4', 's5', 'h5']), rules);
  assert.strictEqual(compareCombos(tp, singleTwo, rules), true, 'ba đôi thông chặt 2');
  const longStraight = analyze(resolveCards(['s3', 'h4', 'c5', 'd6', 's7', 'h8', 'c9']), rules);
  const shortStraight = analyze(resolveCards(['s3', 'h4', 'c5']), rules);
  assert.strictEqual(compareCombos(longStraight, shortStraight, rules), false, 'sảnh khác độ dài không chặt');
  ok('comparator: đôi/sảnh/tứ quý chặt 2');

  // calculateMaxPlayers
  assert.strictEqual(calculateMaxPlayers('tienlenmiennam'), 4);
  assert.strictEqual(calculateMaxPlayers('tienlen'), 4);
  assert.strictEqual(calculateMaxPlayers('samloc'), 5);
  ok('calculateMaxPlayers: TL 4 · Sâm 5');

  // Ăn trắng
  const fourTwosHand = resolveCards(['s2', 'h2', 'c2', 'd2', 's5', 'h6', 'c7', 'd8', 's9', 'h10', 'cJ', 'dQ', 'sK']);
  const ww = checkWhiteWin(fourTwosHand, rules, 'U1', 'U1');
  assert.strictEqual(ww.type, 'fourTwos');
  ok('ăn trắng: tứ quý 2');

  const samRules = getGame('samloc');
  const perfect = resolveCards(['s3', 'h4', 'c5', 'd6', 's7', 'h8', 'c9', 'd10', 'sJ', 'hQ']);
  const ww2 = checkWhiteWin(perfect, samRules, 'U1', 'U1');
  assert.ok(ww2, 'bộ bài hoàn hảo (sảnh 10 lá)');
  assert.strictEqual(ww2.type, 'perfect');
  const ww3 = checkWhiteWin(perfect, samRules, 'U2', 'U1');
  assert.strictEqual(ww3.type, 'dragon', 'không đi trước: vẫn ăn trắng bằng sảnh rồng (đúng luật)');
  ok('ăn trắng: sảnh rồng không cần đi trước');

  // Chỉ kiểm tra riêng luật "bộ bài hoàn hảo cần quyền đi trước"
  const customRules = {
    ...samRules,
    whiteWin: { fourTwos: false, dragonStraight: false, wholeHandOneCombo: true, perfectHandRequiresLead: true },
  };
  assert.strictEqual(checkWhiteWin(perfect, customRules, 'U2', 'U1'), null, 'không đi trước → không ăn trắng');
  assert.strictEqual(checkWhiteWin(perfect, customRules, 'U1', 'U1').type, 'perfect', 'đi trước → ăn trắng');
  ok('ăn trắng: bộ bài hoàn hảo cần quyền đi trước');

  // findSmallestPlay
  const hand = sortHand(resolveCards(['s3', 's4', 'h5', 'c7', 'd9', 'hJ', 'sK', 'hA', 'c2']));
  const play = findSmallestPlay(hand, null, rules);
  assert.deepStrictEqual(play, ['s3']);
  ok('findSmallestPlay: dẫn đầu đánh lá nhỏ nhất');

  // Thối (Sâm Lốc): 2 = 1x, tứ quý = 4x
  const thoiHand = resolveCards(['s2', 'h2', 's5', 'h5', 'c5', 'd5']);
  const thoi = calculateThoi(thoiHand, 10_000, samRules.thoi);
  assert.strictEqual(thoi, (2 * 1 + 4) * 10_000, 'thối: 2 con 2 + 1 tứ quý');
  ok('thối Sâm Lốc: con 2 = 1x, tứ quý = 4x');
}

// ── 2. Anti-cheat checks ──
console.log('\n🛡️  Anti-cheat checks');
{
  const rules = getGame('tienlenmiennam');
  const hand = resolveCards(['s3', 'h5', 'c7']);
  const r1 = validatePlay(hand, ['s9'], null, rules);
  assert.strictEqual(r1.ok, false, 'đánh lá không có trên tay');
  const r2 = validatePlay(hand, ['s3', 's3'], null, rules);
  assert.strictEqual(r2.ok, false, 'lá trùng');
  const r3 = validatePlay(hand, ['s3'], { combo: analyze(resolveCards(['s5']), rules), playerId: 'x' }, rules);
  assert.strictEqual(r3.ok, false, '3 không chặt 5');
  const r4 = validatePlay(resolveCards(['s4', 'h4', 'c4']), ['s4', 'h4', 'c4'], { combo: analyze(resolveCards(['s6']), rules), playerId: 'x' }, rules);
  assert.strictEqual(r4.ok, false, 'sám không chặt được bài lẻ');
  ok('validatePlay chặn: lá không có / trùng / không chặt được');
}

// ── 3. Chơi full game headless ──
async function playFullGame(gameType, playerCount, opts = {}) {
  const { client } = buildClient(playerCount);
  const lobby = buildLobby(gameType, playerCount);
  const session = new CardSession(lobby);
  session.channelMessage = lobby.message;
  lobby.session = session;

  const res = await session.start(client);
  assert.ok(res.ok, `start ${gameType} ok`);
  assert.strictEqual(session.pot, 10_000 * playerCount, 'pot đúng');

  // Nếu có giai đoạn báo Sâm: ai đó báo và có người bắt / không bắt
  if (session.phase === 'bao-sam') {
    const declare = { user: { id: lobby.players[0] }, reply: async () => {} };
    await session.handleBaoSam(declare);
    if (opts.catchSam) {
      const catcher = { user: { id: lobby.players[1] }, reply: async () => {} };
      await session.handleCatchSam(catcher);
    } else {
      // chờ timer báo sâm thành công
      await new Promise((r) => setTimeout(r, CARD_GAME_CONFIG.catchSamWindowMs + 150));
    }
  }

  // Vòng lặp tự đánh
  let guard = 0;
  while (session.isLive() && guard++ < 1_000) {
    if (session.phase !== 'play') {
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }
    const cur = session.turnManager.getCurrent();
    if (!cur) break;
    const canPassNow = canPass(cur.discordId, session.table);
    if (opts.timeoutTest) {
      // không làm gì → để timer tự xử lý
      await new Promise((r) => setTimeout(r, CARD_GAME_CONFIG.turnTimeoutMs + 100));
      continue;
    }
    if (session.table && canPassNow && Math.random() < 0.2) {
      await session.submitPass(cur.discordId);
    } else {
      const play = findSmallestPlay(cur.hand, session.table, session.rules);
      if (play) await session.submitPlay(cur.discordId, play);
      else await session.submitPass(cur.discordId);
    }
  }

  assert.ok(guard < 1_000, 'không bị vòng lặp vô hạn');
  return session;
}

console.log('\n🎮 Full game simulations');
(async () => {
  // Tiến Lên Miền Nam — 4 người
  {
    const s = await playFullGame('tienlenmiennam', 4);
    assert.strictEqual(s.ended, true, 'ván kết thúc');
    assert.strictEqual(s.ranking.length, 4, 'đủ 4 hạng');
    assert.strictEqual(s.ranking[0].rank, 1);
    const lastSettle = settleLog[settleLog.length - 1];
    assert.strictEqual(lastSettle.pot, 40_000, 'pot 40k');
    assert.strictEqual(lastSettle.winnerId, s.ranking[0].discordId);
    assert.strictEqual(balances.get(lastSettle.winnerId), 100_000 - 10_000 + 40_000, 'winner +pot, mất cược');
    ok('Tiến Lên Miền Nam 4 người chơi tới cùng, thanh toán đúng');
  }

  // Tiến Lên (miền Bắc) — 3 người, luật cùng chất
  {
    const s = await playFullGame('tienlen', 3);
    assert.strictEqual(s.ended, true);
    assert.strictEqual(s.ranking.length, 3);
    ok('Tiến Lên miền Bắc 3 người (ràng buộc cùng chất) chơi tới cùng');
  }

  // Sâm Lốc — 5 người, có báo sâm + bắt sâm → báo thất bại
  {
    const before = settleLog.length;
    const s = await playFullGame('samloc', 5, { catchSam: true });
    assert.strictEqual(s.ended, true);
    const lastSettle = settleLog[settleLog.length - 1];
    assert.strictEqual(lastSettle.winnerId, 'U2', 'người bắt Sâm thắng');
    assert.ok(settleLog.length > before);
    ok('Sâm Lốc: báo Sâm bị bắt → người bắt nhận pot');
  }

  // Sâm Lốc — 4 người, báo sâm thành công (không ai bắt)
  {
    const s = await playFullGame('samloc', 4, { catchSam: false });
    assert.strictEqual(s.ended, true);
    const lastSettle = settleLog[settleLog.length - 1];
    assert.strictEqual(lastSettle.winnerId, 'U1', 'người báo Sâm thắng');
    ok('Sâm Lốc: báo Sâm thành công (không ai bắt)');
  }

  // Sâm Lốc — 4 người, không ai báo sâm → chơi bình thường
  {
    CARD_GAME_CONFIG.baoSamWindowMs = 100;
    const s = await playFullGame('samloc', 4);
    assert.strictEqual(s.ended, true);
    assert.strictEqual(s.ranking.length, 4);
    ok('Sâm Lốc: không ai báo sâm → chơi tới cùng');
  }

  // Hết giờ tự xử lý (auto pass / auto play)
  {
    CARD_GAME_CONFIG.turnTimeoutMs = 100;
    const s = await playFullGame('tienlenmiennam', 4, { timeoutTest: true });
    assert.strictEqual(s.ended, true);
    ok('Hết giờ: tự bỏ lượt / tự đánh → ván vẫn kết thúc');
  }

  console.log(`\n🎉 Tất cả ${passed} kiểm tra đều PASS`);
  process.exit(0);
})().catch((err) => {
  console.error('\n💥 SIM FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
