// ═══════════════════════════════════════════
// CARD ENGINE — Trạng thái người chơi
// ═══════════════════════════════════════════

class Player {
  constructor(discordId, displayName) {
    this.discordId = discordId;
    this.displayName = displayName || discordId;
    this.hand = []; // [card...] — chỉ tồn tại trong RAM
    this.finished = false;
    this.rank = null; // 1 = nhất
    this.controlMessage = null; // tin nhắn DM điều khiển lượt
    this.joinedAt = Date.now();
  }

  cardCount() {
    return this.hand.length;
  }

  hasCard(cardId) {
    return this.hand.some((c) => c.id === cardId);
  }

  removeCards(cardIds) {
    const removeSet = new Set(cardIds);
    this.hand = this.hand.filter((c) => !removeSet.has(c.id));
  }

  toJSON() {
    return {
      discordId: this.discordId,
      displayName: this.displayName,
      cardCount: this.cardCount(),
      finished: this.finished,
      rank: this.rank,
    };
  }
}

module.exports = { Player };
