// ═══════════════════════════════════════════
// CARD GAMES — Cấu hình chung & luật từng game
// ═══════════════════════════════════════════
// Không hard-code luật trong engine/rules — mọi tham số nằm ở đây.

const CARD_GAME_CONFIG = {
  // ── Chung ──
  turnTimeoutMs: 30_000, // 30 giây mỗi lượt
  baoSamWindowMs: 10_000, // cửa sổ báo Sâm
  catchSamWindowMs: 10_000, // cửa sổ bắt Sâm
  defaultBet: 10_000, // mức cược mặc định
  minBet: 1_000,
  maxTurnHistory: 4, // số nước đi hiển thị trên bàn

  games: {
    // ═══ TIẾN LÊN MIỀN NAM ═══
    tienlenmiennam: {
      id: 'tienlenmiennam',
      name: 'Tiến Lên Miền Nam',
      emoji: '🃏',
      description: '13 lá/người. Ai hết bài trước thắng.',
      cardsPerPlayer: 13,
      minPlayers: 2,
      deckCount: 1,
      supportBaoSam: false,
      firstPlayer: 'three-spade', // người cầm ♠3 đi trước

      combo: {
        single: true,
        pair: true,
        triple: true,
        quad: true,
        straight: { minLength: 3, allowTwo: false }, // sảnh không chứa 2
        threePairs: true, // ba đôi thông
        fourPairs: true, // bốn đôi thông
        singleSuitLocked: false,
        pairColorLocked: false,
        straightSuitLocked: false,
      },

      chop: {
        twoRule: 'same-color', // 'same-color' | 'suit-only'
        quadBeatsTwo: true, // tứ quý chặt 2
        threePairsBeatsTwo: true, // ba đôi thông chặt 2
        fourPairsBeatsTwo: true, // bốn đôi thông chặt 2
        fourPairsBeatsQuad: true, // bốn đôi thông chặt tứ quý
        fourPairsBeatsThreePairs: true,
        quadBeatsPairTwo: false,
      },

      whiteWin: {
        fourTwos: true, // tứ quý 2 → ăn trắng
        dragonStraight: true, // sảnh rồng 3→A (12 lá)
        dragonEndValue: 14,
        sixPairs: true, // 6 đôi + 1 rác
        fivePairsStraight: true, // 5 đôi thông
        wholeHandOneCombo: true, // bộ bài hoàn hảo (cần đi trước)
        perfectHandRequiresLead: true,
        fivePairs: false,
        sameColor: false,
      },

      thoi: { perCard: 0, two: 0, quad: 0 }, // Tiến Lên không tính thối
    },

    // ═══ TIẾN LÊN (miền Bắc) ═══
    tienlen: {
      id: 'tienlen',
      name: 'Tiến Lên',
      emoji: '🂡',
      description: 'Luật miền Bắc: chặt bài phải cùng chất/màu, không đôi thông.',
      cardsPerPlayer: 13,
      minPlayers: 2,
      deckCount: 1,
      supportBaoSam: false,
      firstPlayer: 'three-spade',

      combo: {
        single: true,
        pair: true,
        triple: true,
        quad: true,
        straight: { minLength: 3, allowTwo: false },
        threePairs: false, // miền Bắc không chơi đôi thông
        fourPairs: false,
        singleSuitLocked: true, // chặn bài lẻ phải cùng chất
        pairColorLocked: true, // chặn đôi phải cùng màu
        straightSuitLocked: true, // chặn sảnh phải đồng chất
      },

      chop: {
        twoRule: 'same-color',
        quadBeatsTwo: true,
        threePairsBeatsTwo: false,
        fourPairsBeatsTwo: false,
        fourPairsBeatsQuad: false,
        fourPairsBeatsThreePairs: false,
        quadBeatsPairTwo: false,
      },

      whiteWin: {
        fourTwos: true,
        dragonStraight: true,
        dragonEndValue: 14,
        sixPairs: true,
        fivePairsStraight: false,
        wholeHandOneCombo: true,
        perfectHandRequiresLead: true,
        fivePairs: false,
        sameColor: false,
      },

      thoi: { perCard: 0, two: 0, quad: 0 },
    },

    // ═══ SÂM LỐC ═══
    samloc: {
      id: 'samloc',
      name: 'Sâm Lốc',
      emoji: '🂠',
      description: '10 lá/người (tối đa 5 người). Có báo Sâm, bắt Sâm, thối.',
      cardsPerPlayer: 10,
      minPlayers: 2,
      deckCount: 1,
      supportBaoSam: true,
      firstPlayer: 'three-spade',

      combo: {
        single: true,
        pair: true,
        triple: true,
        quad: true,
        straight: { minLength: 3, allowTwo: false },
        threePairs: false, // Sâm không có đôi thông
        fourPairs: false,
        singleSuitLocked: false,
        pairColorLocked: false,
        straightSuitLocked: false,
      },

      chop: {
        twoRule: 'same-color',
        quadBeatsTwo: true, // tứ quý chặt 2
        threePairsBeatsTwo: false,
        fourPairsBeatsTwo: false,
        fourPairsBeatsQuad: false,
        fourPairsBeatsThreePairs: false,
        quadBeatsPairTwo: false,
      },

      whiteWin: {
        fourTwos: true,
        dragonStraight: true, // sảnh rồng 3→Q (10 lá)
        dragonEndValue: 12,
        sixPairs: false,
        fivePairsStraight: false,
        wholeHandOneCombo: true, // toàn bộ bài đánh 1 lần
        perfectHandRequiresLead: true,
        fivePairs: true, // 5 đôi
        sameColor: true, // 10 lá cùng màu
      },

      thoi: { perCard: 0, two: 1, quad: 4 }, // thối: con 2 = 1x cược, tứ quý = 4x
    },
  },
};

module.exports = { CARD_GAME_CONFIG };
