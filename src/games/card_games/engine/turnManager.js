// ═══════════════════════════════════════════
// CARD ENGINE — Quản lý lượt chơi
// ═══════════════════════════════════════════

class TurnManager {
  /**
   * players: Player[] (engine/player.js)
   */
  constructor(players) {
    this.players = players;
    this.index = 0;
  }

  getCurrent() {
    return this.players[this.index] || null;
  }

  indexOf(discordId) {
    return this.players.findIndex((p) => p.discordId === discordId);
  }

  setCurrent(index) {
    if (index >= 0 && index < this.players.length) this.index = index;
  }

  // Lượt kế tiếp, bỏ qua người đã về (finished)
  next() {
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (this.index + step) % n;
      if (!this.players[idx].finished) {
        this.index = idx;
        return this.players[idx];
      }
    }
    return null;
  }

  // Số người chưa về
  activeCount() {
    return this.players.filter((p) => !p.finished).length;
  }

  activePlayers() {
    return this.players.filter((p) => !p.finished);
  }
}

module.exports = { TurnManager };
