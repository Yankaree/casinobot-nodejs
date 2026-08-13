// ═══════════════════════════════════════════
// CARD GAMES — Phiên chơi (chạy hoàn toàn trong RAM)
// ═══════════════════════════════════════════
// - Server validate toàn bộ nước đi (anti-cheat).
// - Bài mỗi người chỉ gửi qua DM, không bao giờ hiện ra channel.
// - Hết giờ: tự bỏ lượt (hoặc tự đánh bài nhỏ nhất nếu đang dẫn đầu).

const { ActionRowBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { Player } = require('./engine/player');
const { TurnManager } = require('./engine/turnManager');
const { createDeck, deal } = require('./engine/deck');
const { sortHand } = require('./engine/hand');
const { resolveCards } = require('./engine/card');
const { validatePlay, canPass, findSmallestPlay } = require('./engine/validator');
const { checkWhiteWin } = require('./rules/whiteWin');
const { getGame } = require('./rules/registry');
const { CARD_GAME_CONFIG } = require('./config');
const betting = require('./betting/manager');
const payout = require('./rewards/payout');
const { tableEmbed, resultEmbed } = require('./ui/embed');
const { baoSamButtons, catchSamButtons, handSelect, confirmRows, passRow } = require('./ui/components');
const { sendDM, handEmbed } = require('./ui/dm');
const { formatCoins } = require('../../utils/formatter');

class CardSession {
  constructor(lobby) {
    this.id = `CG-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.lobbyId = lobby.id;
    this.guildId = lobby.guildId;
    this.channelId = lobby.channelId;
    this.gameId = lobby.gameType;
    this.rules = getGame(lobby.gameType);
    this.bet = lobby.bet;
    this.pot = 0;
    this.state = 'starting'; // starting | play | ended
    this.phase = null; // play | bao-sam | null
    this.players = lobby.players.map(
      (id) => new Player(id, lobby.playerNames[id] || id)
    );
    this.table = null; // { combo, playerId }
    this.lastPlayedIndex = -1;
    this.playHistory = [];
    this.ranking = [];
    this.turnManager = new TurnManager(this.players);
    this.turnTimer = null;
    this.samTimer = null;
    this.samDeclaredId = null;
    this.firstPlayerId = null;
    this.channelMessage = null;
    this.client = null;
    this.ended = false;
    this.onEnd = null; // lobby manager set callback
    this.turnHistoryLimit = CARD_GAME_CONFIG.maxTurnHistory;
  }

  isLive() {
    return !this.ended && this.state === 'play';
  }

  // ═══════════════════════════
  // BẮT ĐẦU
  // ═══════════════════════════
  async start(client) {
    this.client = client;

    // 1. Khóa cược
    const lockResult = await betting.lockBets(
      this.guildId,
      this.players.map((p) => p.discordId),
      this.bet
    );
    if (!lockResult.ok) {
      const removedIds = new Set(lockResult.failed.map((f) => f.discordId));
      this.players = this.players.filter((p) => !removedIds.has(p.discordId));
      this.turnManager = new TurnManager(this.players);
      if (this.players.length < this.rules.minPlayers) {
        return { ok: false, canceled: true, failed: lockResult.failed };
      }
    }
    this.pot = this.bet * this.players.length;

    // 2. Xáo & chia bài
    const { hands } = deal(
      createDeck(this.rules.deckCount),
      this.players.length,
      this.rules.cardsPerPlayer
    );
    this.players.forEach((p, i) => {
      p.hand = sortHand(hands[i]);
    });

    // 3. Gửi bài riêng tư qua DM
    for (const p of this.players) {
      await sendDM(this.client, p.discordId, { embeds: [handEmbed(this, p)] });
    }

    // 4. Xác định người đi đầu (người cầm ♠3)
    let firstIdx = this.players.findIndex((p) => p.hand.some((c) => c.id === 's3'));
    if (firstIdx === -1) firstIdx = 0;
    this.turnManager.setCurrent(firstIdx);
    this.firstPlayerId = this.players[firstIdx].discordId;

    // 5. Kiểm tra Ăn trắng sau khi chia bài
    const whiteWin = this._findWhiteWin();
    if (whiteWin) {
      this.state = 'play';
      await this._endGame('white-win', whiteWin.player.discordId, whiteWin.label);
      return { ok: true, endedEarly: 'white-win' };
    }

    // 6. Báo Sâm (Sâm Lốc) hoặc vào thẳng lượt chơi
    this.state = 'play';
    if (this.rules.supportBaoSam) {
      this._startBaoSam();
    } else {
      await this._startPlay();
    }
    return { ok: true, removed: lockResult.failed || [] };
  }

  _findWhiteWin() {
    const candidates = [];
    for (const p of this.players) {
      const win = checkWhiteWin(p.hand, this.rules, p.discordId, this.firstPlayerId);
      if (win) candidates.push({ player: p, ...win });
    }
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates[0] || null;
  }

  // ═══════════════════════════
  // BÁO SÂM
  // ═══════════════════════════
  async _startBaoSam() {
    this.phase = 'bao-sam';
    const msg = `🔔 **BÁO SÂM** — ${Math.round(CARD_GAME_CONFIG.baoSamWindowMs / 1000)} giây\n` +
      `Nếu bạn nghĩ mình thắng ngay, bấm **Báo Sâm**. Không ai bắt → bạn ăn trọn **${formatCoins(this.pot)}** 🪙!`;

    const embed = new EmbedBuilder()
      .setColor(config.colors.danger)
      .setTitle('🔔 Báo Sâm')
      .setDescription(msg);

    try {
      await this._sendChannelMessage({ embeds: [embed], components: baoSamButtons(this.id) });
    } catch (err) {
      console.error('[CardGames] _startBaoSam:', err.message);
    }

    this.samTimer = setTimeout(() => {
      // Hết cửa sổ báo Sâm, không ai báo → vào lượt chơi
      if (this.phase === 'bao-sam' && !this.samDeclaredId && !this.ended) {
        this._startPlay();
      }
    }, CARD_GAME_CONFIG.baoSamWindowMs);
  }

  async handleBaoSam(interaction) {
    if (this.ended || this.phase !== 'bao-sam') {
      return interaction.reply({ content: '❌ Không còn trong giai đoạn báo Sâm!', ephemeral: true });
    }
    if (this.samDeclaredId) {
      return interaction.reply({ content: '❌ Đã có người báo Sâm!', ephemeral: true });
    }
    const player = this.players.find((p) => p.discordId === interaction.user.id);
    if (!player) {
      return interaction.reply({ content: '❌ Bạn không trong ván này!', ephemeral: true });
    }

    this.samDeclaredId = interaction.user.id;
    this._clearSamTimer();

    const msg =
      `🔔 **${player.displayName}** báo Sâm!\n` +
      `Nếu không ai **Bắt Sâm** trong ${Math.round(CARD_GAME_CONFIG.catchSamWindowMs / 1000)} giây, họ thắng ngay!`;

    try {
      await this._sendChannelMessage({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.danger)
          .setTitle('⚔️ Báo Sâm thành công?')
          .setDescription(msg)],
        components: catchSamButtons(this.id),
      });
    } catch (err) {
      console.error('[CardGames] handleBaoSam:', err.message);
    }

    this.samTimer = setTimeout(() => {
      // Không ai bắt → báo Sâm thành công
      if (this.phase === 'bao-sam' && this.samDeclaredId && !this.ended) {
        this._endGame('bao-sam-success', this.samDeclaredId);
      }
    }, CARD_GAME_CONFIG.catchSamWindowMs);
  }

  async handleCatchSam(interaction) {
    if (this.ended || this.phase !== 'bao-sam' || !this.samDeclaredId) {
      return interaction.reply({ content: '❌ Không có ai báo Sâm để bắt!', ephemeral: true });
    }
    if (interaction.user.id === this.samDeclaredId) {
      return interaction.reply({ content: '❌ Bạn không thể tự bắt Sâm của mình!', ephemeral: true });
    }
    const catcher = this.players.find((p) => p.discordId === interaction.user.id);
    if (!catcher) {
      return interaction.reply({ content: '❌ Bạn không trong ván này!', ephemeral: true });
    }

    this._clearSamTimer();
    await this._endGame('bao-sam-fail', interaction.user.id);
    return interaction.reply({ content: '⚔️ Bạn đã bắt Sâm thành công!', ephemeral: true });
  }

  // ═══════════════════════════
  // LƯỢT CHƠI
  // ═══════════════════════════
  async _startPlay() {
    if (this.ended) return;
    this.state = 'play';
    this.phase = 'play';
    await this._refreshChannel();
    await this._startTurn();
  }

  async _startTurn() {
    if (this.ended || this.phase !== 'play') return;
    const player = this.turnManager.getCurrent();
    if (!player) return;

    this._clearTurnTimer();

    // Tắt nút của lượt trước
    await this._disableOldControls(player);

    // Cập nhật bàn chơi công khai
    await this._refreshChannel();

    // Gửi điều khiển lượt qua DM (riêng tư)
    const passAllowed = canPass(player.discordId, this.table);
    const rows = [new ActionRowBuilder().addComponents(handSelect(this.id, player.hand))];
    if (passAllowed) rows.push(passRow(this.id));

    const tableInfo = this.table
      ? `Bàn đang có: **${this.table.combo.label}**`
      : 'Bạn được dẫn bài.';

    const msg = await sendDM(this.client, player.discordId, {
      content: `🃏 **Đến lượt bạn!**\n${tableInfo}\nChọn bài trong menu bên dưới rồi bấm **✅ Đánh bài**.`,
      embeds: [handEmbed(this, player)],
      components: rows,
    });
    player.controlMessage = msg;

    // Timer: hết giờ tự xử lý
    this.turnTimer = setTimeout(() => this._onTurnTimeout(), CARD_GAME_CONFIG.turnTimeoutMs);
  }

  async _disableOldControls(currentPlayer) {
    for (const p of this.players) {
      if (p.controlMessage && p.discordId !== currentPlayer.discordId) {
        try {
          // Ghi đè nội dung cũ (tránh hiển thị "bàn đang có: ..." của lượt trước
          // khiến người chơi tưởng bàn chưa cập nhật) và gỡ toàn bộ nút bấm.
          await p.controlMessage.edit({
            content: '⏳ **Đã đến lượt người khác** — nút điều khiển của bạn đã bị khóa.',
            embeds: p.controlMessage.embeds || [],
            components: [],
          });
        } catch {
          // DM đã bị xóa — bỏ qua
        }
        p.controlMessage = null;
      }
    }
  }

  _onTurnTimeout() {
    if (this.ended || this.phase !== 'play') return;
    this._clearTurnTimer();
    const player = this.turnManager.getCurrent();
    if (!player) return;

    if (canPass(player.discordId, this.table)) {
      this.submitPass(player.discordId);
    } else {
      const cards = findSmallestPlay(player.hand, this.table, this.rules);
      if (cards) this.submitPlay(player.discordId, cards);
      else this.submitPass(player.discordId);
    }
  }

  // ── Nước đánh (core — được gọi từ handler và timer) ──
  async submitPlay(playerId, cardIds) {
    if (this.ended || this.phase !== 'play' || this.state !== 'play') {
      return { ok: false, error: 'Ván đã kết thúc!' };
    }
    const player = this.players.find((p) => p.discordId === playerId);
    if (!player || player.finished) {
      return { ok: false, error: 'Bạn không còn trong ván này!' };
    }
    const current = this.turnManager.getCurrent();
    if (!current || current.discordId !== playerId) {
      return { ok: false, error: 'Chưa đến lượt bạn!' };
    }

    const res = validatePlay(player.hand, cardIds, this.table, this.rules);
    if (!res.ok) return res;

    this._clearTurnTimer();
    player.removeCards(cardIds);
    this.table = { combo: res.combo, playerId };
    this.lastPlayedIndex = this.turnManager.indexOf(playerId);
    this.playHistory.push({ playerName: player.displayName, comboLabel: res.combo.label });
    if (this.playHistory.length > this.turnHistoryLimit) this.playHistory.shift();

    // Người chơi hết bài → về nhất
    if (player.cardCount() === 0) {
      player.finished = true;
      player.rank = this.ranking.length + 1;
      this.ranking.push({ discordId: playerId, rank: player.rank });
      this.table = null;
      this.lastPlayedIndex = -1;

      const remaining = this.turnManager.activePlayers().filter((p) => !p.finished);
      if (remaining.length <= 1) {
        if (remaining.length === 1) {
          const last = remaining[0];
          last.finished = true;
          last.rank = this.ranking.length + 1;
          this.ranking.push({ discordId: last.discordId, rank: last.rank });
        }
        // Người về nhất (hạng 1) mới là người thắng — không phải người vừa đánh
        const winnerId = this.ranking[0].discordId;
        await this._endGame('normal', winnerId);
        return { ok: true, combo: res.combo };
      }
      this.turnManager.next();
      await this._startTurn();
      return { ok: true, combo: res.combo };
    }

    // Chưa hết bài → chuyển lượt
    this.turnManager.next();
    await this._startTurn();
    return { ok: true, combo: res.combo };
  }

  // ── Bỏ lượt (core) ──
  async submitPass(playerId) {
    if (this.ended || this.phase !== 'play' || this.state !== 'play') {
      return { ok: false, error: 'Ván đã kết thúc!' };
    }
    const player = this.players.find((p) => p.discordId === playerId);
    const current = this.turnManager.getCurrent();
    if (!player || !current || current.discordId !== playerId) {
      return { ok: false, error: 'Chưa đến lượt bạn!' };
    }
    if (!canPass(playerId, this.table)) {
      return { ok: false, error: 'Bạn đang dẫn đầu — không thể bỏ lượt!' };
    }

    this._clearTurnTimer();
    const next = this.turnManager.next();
    if (next && next.discordId === this.table.playerId) {
      // Tất cả đều bỏ lượt → người đánh cuối dẫn lại
      this.table = null;
      this.lastPlayedIndex = -1;
    }
    await this._startTurn();
    return { ok: true };
  }

  // ═══════════════════════════
  // DISCORD INTERACTION HANDLERS
  // ═══════════════════════════
  async handleSelect(interaction) {
    if (!this.isLive()) {
      return interaction.reply({ content: '❌ Ván đã kết thúc!', ephemeral: true });
    }
    const player = this.players.find((p) => p.discordId === interaction.user.id);
    const current = this.turnManager.getCurrent();
    if (!player || !current || current.discordId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Chưa đến lượt bạn!', ephemeral: true });
    }

    const cardIds = interaction.values;
    const cards = resolveCards(cardIds);
    if (cards.length !== cardIds.length) {
      return interaction.reply({ content: '❌ Lá bài không hợp lệ!', ephemeral: true });
    }
    for (const c of cards) {
      if (!player.hasCard(c.id)) {
        return interaction.reply({ content: '❌ Bạn không còn lá bài này trên tay!', ephemeral: true });
      }
    }

    const labels = cards.map((c) => c.label).join(' ');
    const passAllowed = canPass(player.discordId, this.table);
    try {
      await interaction.update({
        content: `📝 Đã chọn: \`${labels}\`\nBấm **✅ Đánh bài** để xác nhận.`,
        embeds: [handEmbed(this, player)],
        components: confirmRows(this.id, cardIds, passAllowed),
      });
    } catch (err) {
      console.error('[CardGames] handleSelect update:', err.message);
    }
  }

  async handlePlay(interaction, cardIds) {
    const res = await this.submitPlay(interaction.user.id, cardIds);
    const player = this.players.find((p) => p.discordId === interaction.user.id);

    if (!res.ok) {
      // Hiện lại menu chọn bài kèm lỗi
      const passAllowed = player ? canPass(player.discordId, this.table) : false;
      const rows = [];
      if (player && this.isLive() && this.turnManager.getCurrent()?.discordId === interaction.user.id) {
        rows.push(new ActionRowBuilder().addComponents(handSelect(this.id, player.hand)));
        if (passAllowed) rows.push(passRow(this.id));
      }
      try {
        await interaction.update({
          content: `❌ ${res.error}`,
          embeds: player && this.isLive() ? [handEmbed(this, player)] : [],
          components: rows,
        });
      } catch (err) {
        console.error('[CardGames] handlePlay error update:', err.message);
      }
      return;
    }

    try {
      await interaction.update({
        content: `✅ Đã đánh: **${res.combo.label}**`,
        embeds: [],
        components: [],
      });
    } catch (err) {
      console.error('[CardGames] handlePlay success update:', err.message);
    }
  }

  async handlePass(interaction) {
    const res = await this.submitPass(interaction.user.id);
    try {
      await interaction.update({
        content: res.ok ? '🙅 Bạn đã bỏ lượt.' : `❌ ${res.error}`,
        embeds: [],
        components: [],
      });
    } catch (err) {
      console.error('[CardGames] handlePass update:', err.message);
    }
  }

  async handleReselect(interaction) {
    if (!this.isLive()) {
      return interaction.reply({ content: '❌ Ván đã kết thúc!', ephemeral: true });
    }
    const player = this.players.find((p) => p.discordId === interaction.user.id);
    const current = this.turnManager.getCurrent();
    if (!player || !current || current.discordId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Chưa đến lượt bạn!', ephemeral: true });
    }
    const passAllowed = canPass(player.discordId, this.table);
    const rows = [new ActionRowBuilder().addComponents(handSelect(this.id, player.hand))];
    if (passAllowed) rows.push(passRow(this.id));
    try {
      await interaction.update({
        content: '🃏 Chọn lại bài:',
        embeds: [handEmbed(this, player)],
        components: rows,
      });
    } catch (err) {
      console.error('[CardGames] handleReselect update:', err.message);
    }
  }

  // ═══════════════════════════
  // KẾT THÚC
  // ═══════════════════════════
  async _endGame(reason, winnerId, extraLabel) {
    if (this.ended) return;
    this.ended = true;
    this.state = 'ended';
    this.phase = null;
    this._clearTurnTimer();
    this._clearSamTimer();

    // Xếp hạng cho các kết thúc sớm (ăn trắng / báo sâm)
    if (reason !== 'normal') {
      this.ranking = [];
      const winner = this.players.find((p) => p.discordId === winnerId);
      if (winner) winner.rank = 1;
      this.ranking.push({ discordId: winnerId, rank: 1 });
      for (const p of this.players) {
        if (p.discordId === winnerId) continue;
        this.ranking.push({ discordId: p.discordId, rank: 2 });
      }
    }

    const settlement = await payout.settleGame({
      guildId: this.guildId,
      sessionId: this.id,
      gameId: this.gameId,
      players: this.players,
      ranking: this.ranking,
      winnerId,
      pot: this.pot,
      bet: this.bet,
      rules: this.rules,
      reason,
    });

    const embed = resultEmbed(this, {
      reason,
      extraLabel,
      ranking: this.ranking,
      payouts: settlement.payouts,
    });

    // Cập nhật bàn chơi thành kết quả
    try {
      if (this.channelMessage) {
        await this.channelMessage.edit({ embeds: [embed], components: [] });
      } else {
        const channel = this.client?.channels?.cache?.get(this.channelId);
        if (channel) await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('[CardGames] end edit:', err.message);
    }

    // Tắt toàn bộ nút DM cũ
    for (const p of this.players) {
      if (p.controlMessage) {
        try {
          await p.controlMessage.edit({ components: [] });
        } catch {
          // bỏ qua
        }
        p.controlMessage = null;
      }
    }

    // Thông báo kết quả riêng cho từng người
    for (const p of this.players) {
      const payout = settlement.payouts.find((x) => x.discordId === p.discordId);
      await sendDM(this.client, p.discordId, {
        content: `🏁 Ván **${this.rules.name}** kết thúc!${payout ? ` ${payout.label}` : ''}`,
      });
    }

    if (this.onEnd) this.onEnd(this);
  }

  // ═══════════════════════════
  // HELPERS
  // ═══════════════════════════
  _clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  _clearSamTimer() {
    if (this.samTimer) {
      clearTimeout(this.samTimer);
      this.samTimer = null;
    }
  }

  async _refreshChannel() {
    try {
      await this._sendChannelMessage({ embeds: [tableEmbed(this)], components: [] });
    } catch (err) {
      console.error('[CardGames] _refreshChannel:', err.message);
    }
  }

  // Gửi/cập nhật tin nhắn của ván trong channel
  async _sendChannelMessage(payload) {
    if (this.channelMessage) {
      await this.channelMessage.edit(payload);
      return this.channelMessage;
    }
    const channel = this.client?.channels?.cache?.get(this.channelId);
    if (!channel) throw new Error('Không tìm thấy kênh chơi!');
    this.channelMessage = await channel.send(payload);
    return this.channelMessage;
  }

  // Thông tin phòng (cho /card info)
  info() {
    return {
      id: this.id,
      game: this.rules.name,
      state: this.state,
      pot: this.pot,
      players: this.players.map((p) => p.toJSON()),
    };
  }
}

module.exports = { CardSession };
