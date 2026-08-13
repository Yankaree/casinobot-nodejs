// ─────────────────────────────────────────────
// TÀI XỈU DEATHMATCH — lớp mở rộng của GameSession Tài Xỉu
//
// TXGameCore (games/taixiu/session.js)
//   ├── Normal Tai Xiu     (không đổi, dùng coin chính + DB)
//   └── Deathmatch Tai Xiu (này — Battle Coin, RAM-only, lobby riêng)
//
// Tái sử dụng core Tài Xỉu:
//   - rollResult()          (games/taixiu/engine.js — key tách biệt dm:guild)
//   - Luồng round: mở cược → chọn Tài/Xỉu → nhập tiền → đóng → quay → thanh toán
//   - UI nút / modal / xác nhận (utils/betConfirm.js)
//   - formatter (formatCoins, formatTime, getResultEmoji/Text)
//
// Khác biệt: currency = Battle Coin (chỉ trong trận), player state
// (ACTIVE/SPECTATOR), event, final round theo timer trận, ranking cuối.
// Không chạm DB wallet — session xóa sạch khi trận kết thúc.
// ─────────────────────────────────────────────

const GameSession = require('../session');
const config = require('../../../config');
const { rollResult } = require('../engine');
const { demoteSpectators, rollEvent, applyEvent } = require('./events');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  formatCoins,
  formatTime,
  getResultEmoji,
  getResultText,
} = require('../../../utils/formatter');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class DeathmatchSession extends GameSession {
  constructor(room, players) {
    // room: DeathmatchLobby (đã lock) — guildId, channelId, hostId, initialCoin, minutes, roomId
    super(room.guildId, room.channelId);
    this.roomId = room.roomId;
    this.hostId = room.hostId;
    this.matchDurationMs = room.minutes * 60_000;
    this.matchStartedAt = Date.now();
    this.matchState = 'RUNNING'; // RUNNING | FINAL_ROUND | FINISHED
    this.roundNumber = 0;
    this.timeLeft = config.deathmatch.roundDuration;
    this.players = new Map(); // userId -> { userId, username, battleCoin, wins, losses, status }
    for (const p of players.values()) {
      this.players.set(p.userId, {
        userId: p.userId,
        username: p.username,
        battleCoin: room.initialCoin,
        wins: 0,
        losses: 0,
        status: 'ACTIVE',
      });
    }
    this.bettors = new Map(); // userId -> { choice, amount, username }
    this.bets = { tai: [], xiu: [] }; // mảng cược từng người để hiển thị công khai
    this.currentEvent = null;
    this.finalRanking = null;
    this._finalAnnounced = false;
    this._roundEnding = false;
  }

  // ─────────────────────────────────────────────
  // TRẠNG THÁI
  // ─────────────────────────────────────────────
  activePlayers() {
    return [...this.players.values()].filter((p) => p.status === 'ACTIVE');
  }

  matchTimeLeft() {
    return Math.max(0, this.matchDurationMs - (Date.now() - this.matchStartedAt));
  }

  async channelSend(payload) {
    const channel = this._client?.channels?.cache?.get(this.channelId);
    if (!channel) return null;
    try {
      return await channel.send(payload);
    } catch (err) {
      console.error('[TXDeath] channelSend:', err.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  // START / ROUND LOOP (reuse flow Tài Xỉu: mở cược → chọn → nhập → đóng → quay)
  // ─────────────────────────────────────────────
  async start(client) {
    this._client = client;
    this.isActive = true;
    this.isStopped = false;
    await this.startRound(client);
  }

  async startRound(client) {
    if (this.isStopped || this.matchState === 'FINISHED') return;

    // 1. Hết giờ trận → chuyển RUNNING → FINAL_ROUND (không hủy round đang chạy)
    if (this.matchState !== 'FINAL_ROUND' && this.matchTimeLeft() <= 0) {
      this.matchState = 'FINAL_ROUND';
      await this.channelSend({
        embeds: [
          new EmbedBuilder()
            .setTitle('🔥 FINAL ROUND')
            .setDescription(
              '⏱️ **Hết giờ trận đấu!**\n\n' +
              'Round hiện tại sẽ chạy đến hết rồi tính thứ hạng chung cuộc.\n' +
              'Cược đi — đây là round **cuối cùng**!'
            )
            .setColor(0xff0000),
        ],
      });
    }

    // 2. Không đủ 2 người ACTIVE → kết thúc trận
    if (this.activePlayers().length < 2) {
      await this.finishMatch(client);
      return;
    }

    // 3. Khởi tạo round mới
    this.roundNumber++;
    this.bettors.clear();
    this.bets = { tai: [], xiu: [] };
    this.currentEvent = null;
    this._roundEnding = false;
    this._finalAnnounced = this.matchState === 'FINAL_ROUND';
    this.roundStartedAt = Date.now();
    this.timeLeft = config.deathmatch.roundDuration;

    // 4. Event system — chạy trước khi mở cược
    const evt = rollEvent();
    if (evt) {
      this.currentEvent = applyEvent(this, evt);
      await this.channelSend({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${this.currentEvent.emoji} EVENT: ${this.currentEvent.name}`)
            .setDescription(`${this.currentEvent.desc}\n\n${this.currentEvent.lines.join('\n')}`)
            .setColor(config.colors.info),
        ],
      });
      // Event có thể khiến người chơi rơi xuống SPECTATOR
      if (this.activePlayers().length < 2) {
        await this.finishMatch(client);
        return;
      }
    }

    // 5. Gửi message round + nút bấm
    const channel = client.channels.cache.get(this.channelId);
    if (channel) {
      this.message = await channel
        .send({ embeds: [this.createEmbed()], components: this.createButtons() })
        .catch((err) => {
          console.error('[TXDeath] send round:', err.message);
          return null;
        });
    }

    // 6. Timer round (1 giây / tick, giống Tài Xỉu thường)
    if (this._tickInterval) clearInterval(this._tickInterval);
    this._tickInterval = setInterval(() => {
      if (this.isStopped || !this.isActive) {
        clearInterval(this._tickInterval);
        this._tickInterval = null;
        return;
      }
      const elapsed = Math.floor((Date.now() - this.roundStartedAt) / 1000);
      this.timeLeft = Math.max(0, config.deathmatch.roundDuration - elapsed);

      // Trận hết giờ giữa chừng round → đây là round cuối (không hủy round)
      if (this.matchState !== 'FINAL_ROUND' && this.matchTimeLeft() <= 0) {
        this.matchState = 'FINAL_ROUND';
        if (!this._finalAnnounced) {
          this._finalAnnounced = true;
          this.channelSend({
            embeds: [
              new EmbedBuilder()
                .setTitle('🔥 FINAL ROUND')
                .setDescription('⏱️ **Hết giờ trận đấu!** Round hiện tại là round cuối — sau đó tính thứ hạng chung cuộc!')
                .setColor(0xff0000),
            ],
          }).catch(() => {});
        }
      }

      if (this.message) {
        this.message
          .edit({ embeds: [this.createEmbed()], components: this.createButtons() })
          .catch(() => {});
      }
      if (this.timeLeft <= 0) {
        clearInterval(this._tickInterval);
        this._tickInterval = null;
        this.end(client).catch((err) => console.error('[TXDeath] Round end error:', err));
      }
    }, 1000);
  }

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────
  createButtons() {
    if (!this.isActive || this.isStopped) return [];

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`txdeath_bet_tai_${this.roundNumber}`)
        .setLabel('🔴 TÀI')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`txdeath_bet_xiu_${this.roundNumber}`)
        .setLabel('🔵 XỈU')
        .setStyle(ButtonStyle.Primary)
    );
    return [row];
  }

  standingsLines() {
    const sorted = [...this.players.values()].sort((a, b) => b.battleCoin - a.battleCoin);
    return sorted.map((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤';
      const tag = p.status === 'SPECTATOR' ? ' 👁️' : '';
      return `${medal} <@${p.userId}> — **${formatCoins(p.battleCoin)}** BC${tag}`;
    });
  }

  betLines(choice) {
    const arr = this.bets[choice] || [];
    if (arr.length === 0) return 'Chưa có cược';
    return arr.map((b) => `<@${b.userId}> — **${formatCoins(b.amount)}** BC`).join('\n');
  }

  createEmbed() {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ TÀI XỈU DEATHMATCH')
      .setColor(config.colors.primary);

    const descLines = [
      `🏟️ **Phòng ${this.roomId}** · Round **${this.roundNumber}**`,
      `⏱️ Trận còn **${formatTime(Math.ceil(this.matchTimeLeft() / 1000))}**`,
      `⏱️ Cược còn **${formatTime(this.timeLeft)}**`,
    ];
    if (this.matchState === 'FINAL_ROUND') {
      descLines.push('🔥 **ROUND CUỐI CÙNG!**');
    }
    if (this.currentEvent) {
      descLines.push(`${this.currentEvent.emoji} Event: **${this.currentEvent.name}**`);
    }
    embed.setDescription(descLines.join('\n'));

    embed.addFields(
      {
        name: '🪙 Battle Coin',
        value: this.standingsLines().join('\n'),
        inline: false,
      },
      {
        name: '📈 TÀI',
        value: this.betLines('tai'),
        inline: true,
      },
      {
        name: '📉 XỈU',
        value: this.betLines('xiu'),
        inline: true,
      }
    );

    embed.setFooter({ text: 'Đặt cược bằng Battle Coin — bấm nút bên dưới' });
    embed.setTimestamp();
    return embed;
  }

  createResultEmbed(result, summary, eliminated) {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ KẾT QUẢ TÀI XỈU DEATHMATCH')
      .setDescription(
        `**Phòng ${this.roomId}** · Round **${this.roundNumber}**\n\n` +
        `${getResultEmoji(result)} **${getResultText(result)}**`
      )
      .setColor(result === 'tai' ? 0xff0000 : 0x0000ff);

    const winners = summary.winners.length > 0
      ? summary.winners.map((b) => `<@${b.userId}> +${formatCoins(b.profit)} BC`).join('\n')
      : 'Không có';
    const losers = summary.losers.length > 0
      ? summary.losers.map((b) => `<@${b.userId}> -${formatCoins(b.amount)} BC`).join('\n')
      : 'Không có';

    embed.addFields(
      { name: `🏆 Thắng (${summary.winners.length})`, value: winners, inline: true },
      { name: `💔 Thua (${summary.losers.length})`, value: losers, inline: true }
    );

    if (eliminated.length > 0) {
      embed.addFields({
        name: '👁️ Bị loại khỏi vòng cược',
        value: eliminated
          .map((p) => `<@${p.userId}> còn **${formatCoins(p.battleCoin)}** BC → **SPECTATOR**`)
          .join('\n'),
        inline: false,
      });
    }
    embed.setTimestamp();
    return embed;
  }

  // ─────────────────────────────────────────────
  // ĐẶT CƯỢC (Battle Coin, RAM — không chạm UserModel)
  // ─────────────────────────────────────────────
  async addBet(userId, choice, amount) {
    if (!this.isActive) return { success: false, message: 'Round đã đóng!' };
    if (this.isStopped) return { success: false, message: 'Trận đã kết thúc!' };

    const player = this.players.get(userId);
    if (!player) return { success: false, message: 'Bạn không tham gia trận này!' };
    if (player.status !== 'ACTIVE') {
      return { success: false, message: '👁️ Bạn là **SPECTATOR** — không thể đặt cược!' };
    }
    if (amount < config.deathmatch.minBet) {
      return { success: false, message: `Mức cược tối thiểu là **${formatCoins(config.deathmatch.minBet)}** BC!` };
    }
    if (this.bettors.has(userId)) {
      return { success: false, message: 'Bạn đã đặt cược round này rồi!' };
    }
    if (player.battleCoin < amount) {
      return {
        success: false,
        message: `Không đủ Battle Coin! Còn: **${formatCoins(player.battleCoin)}** BC`,
      };
    }

    player.battleCoin -= amount;
    this.bettors.set(userId, { userId, username: player.username, choice, amount });
    this.bets[choice].push({ userId, username: player.username, amount });

    // Tất cả người ACTIVE đã cược → kết thúc round ngay (giống điều kiện đóng cược Tài Xỉu)
    const actives = this.activePlayers();
    if (actives.length > 0 && actives.every((p) => this.bettors.has(p.userId))) {
      if (this._tickInterval) {
        clearInterval(this._tickInterval);
        this._tickInterval = null;
      }
      setTimeout(() => {
        if (!this.isStopped && this.isActive) {
          this.end(this._client).catch((err) => console.error('[TXDeath] Early end error:', err));
        }
      }, config.deathmatch.allBetDelayMs);
    }

    return { success: true, balance: player.battleCoin, choice, amount };
  }

  // ─────────────────────────────────────────────
  // KẾT THÚC ROUND
  // ─────────────────────────────────────────────
  async end(client) {
    if (!this.isActive || this.isStopped || this._roundEnding) return;
    this._roundEnding = true;

    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this.isActive = false;

    if (this.message) {
      this.message.edit({ components: [] }).catch(() => {});
    }

    const totalBets = this.bettors.size;

    // Round không ai cược → round mới (không tạm dừng như Tài Xỉu thường)
    if (totalBets === 0) {
      // Round cuối không ai cược → kết thúc trận luôn (tránh vòng lặp round rỗng)
      if (this.matchState === 'FINAL_ROUND' || this.activePlayers().length < 2) {
        await this.finishMatch(client);
        return;
      }
      await this.channelSend({
        embeds: [
          new EmbedBuilder()
            .setTitle('⚔️ TÀI XỈU DEATHMATCH')
            .setDescription(`**Phòng ${this.roomId}** · Round **${this.roundNumber}**\n\nKhông ai đặt cược. Round mới...`)
            .setColor(config.colors.info),
        ],
      });
      this._roundEnding = false;
      this.restartTimer = setTimeout(() => {
        if (!this.isStopped) {
          this.isActive = true;
          this.startRound(client).catch((err) => console.error('[TXDeath] Next round error:', err));
        }
      }, config.deathmatch.noBetDelayMs);
      return;
    }

    await this.channelSend({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚔️ TÀI XỈU DEATHMATCH')
          .setDescription(`**Phòng ${this.roomId}** · Round **${this.roundNumber}**\n\n🎲 Đang quay...`)
          .setColor(config.colors.primary),
      ],
    });

    await sleep(config.deathmatch.rollDelayMs);
    if (this.isStopped) return;

    // Random kết quả — reuse engine Tài Xỉu, key riêng để không trộn lịch sử
    const result = rollResult(`dm:${this.guildId}`);

    const summary = this.settleRound(result);
    const eliminated = demoteSpectators(this);

    await this.channelSend({
      embeds: [this.createResultEmbed(result, summary, eliminated)],
    });

    // Round cuối / hết người chơi → tính thứ hạng chung cuộc
    if (this.matchState === 'FINAL_ROUND' || this.activePlayers().length < 2) {
      await this.finishMatch(client);
      return;
    }

    this._roundEnding = false;
    this.restartTimer = setTimeout(() => {
      if (!this.isStopped) {
        this.isActive = true;
        this.startRound(client).catch((err) => console.error('[TXDeath] Next round error:', err));
      }
    }, config.deathmatch.nextRoundDelayMs);
  }

  /**
   * Thanh toán zero-sum: người thắng nhận lại vốn + chia phần tiền của người thua
   * theo tỉ lệ cược (pari-mutuel). Người thua mất số đã cược.
   */
  settleRound(result) {
    const all = [...this.bettors.values()];
    const winners = all.filter((b) => b.choice === result);
    const losers = all.filter((b) => b.choice !== result);

    const loserTotal = losers.reduce((s, b) => s + b.amount, 0);
    const winnerTotal = winners.reduce((s, b) => s + b.amount, 0);

    for (const b of winners) {
      const share = winnerTotal > 0 ? Math.floor((loserTotal * b.amount) / winnerTotal) : 0;
      const p = this.players.get(b.userId);
      p.battleCoin += b.amount + share; // vốn + lãi
      p.wins++;
      b.profit = share;
    }

    for (const b of losers) {
      // Tiền đã bị trừ lúc đặt cược (addBet) — người thua không được nhận lại gì
      const p = this.players.get(b.userId);
      p.losses++;
      b.profit = -b.amount;
    }

    return { winners, losers, loserTotal, winnerTotal };
  }

  // ─────────────────────────────────────────────
  // KẾT THÚC TRẬN — RANKING
  // ─────────────────────────────────────────────
  computeRanking() {
    return [...this.players.values()]
      .sort((a, b) => b.battleCoin - a.battleCoin || b.wins - a.wins)
      .map((p, i) => ({
        rank: i + 1,
        userId: p.userId,
        username: p.username,
        battleCoin: p.battleCoin,
        wins: p.wins,
        losses: p.losses,
        status: p.status,
      }));
  }

  async finishMatch(client) {
    if (this.matchState === 'FINISHED') return;
    this.matchState = 'FINISHED';
    this.isActive = false;
    this.isStopped = true;

    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    this.finalRanking = this.computeRanking();

    const medals = ['🥇', '🥈', '🥉'];
    const lines = this.finalRanking.map(
      (r, i) =>
        `${medals[i] || '🏅'} <@${r.userId}> — **${formatCoins(r.battleCoin)}** BC · ` +
        `(${r.wins} thắng / ${r.losses} thua)${r.status === 'SPECTATOR' ? ' 👁️' : ''}`
    );

    const embed = new EmbedBuilder()
      .setTitle('🏆 KẾT THÚC TRẬN — TÀI XỈU DEATHMATCH')
      .setDescription(`**Phòng ${this.roomId}** — thứ hạng chung cuộc\n\n${lines.join('\n')}`)
      .setColor(config.colors.success)
      .setTimestamp();

    await this.channelSend({ embeds: [embed] });

    // Giải phóng RAM: lệnh txdeath lắng nghe 'finished' để xóa session khỏi Map
    this.emit('finished', this);
  }

  /**
   * Kết thúc trận sớm (chủ phòng /txdeath end).
   * Nếu đang có round chạy → để round chạy hết rồi tính ranking (giống FINAL_ROUND).
   */
  async endMatchEarly(client) {
    if (this.matchState === 'FINISHED') return { message: 'Trận đã kết thúc!' };
    this.matchState = 'FINAL_ROUND';
    if (this.isActive) {
      return {
        message: '⏱️ Đã chuyển sang **FINAL ROUND** — round hiện tại chạy hết rồi tính thứ hạng chung cuộc!',
      };
    }
    await this.finishMatch(client);
    return { message: '✅ Đã kết thúc trận đấu!' };
  }

  // ─────────────────────────────────────────────
  // LEADERBOARD / INFO (RAM — không dùng leaderboard Tài Xỉu thường)
  // ─────────────────────────────────────────────
  getLeaderboardEmbed() {
    const sorted = [...this.players.values()].sort(
      (a, b) => b.battleCoin - a.battleCoin || b.wins - a.wins
    );
    const medals = ['🥇', '🥈', '🥉'];
    const state =
      this.matchState === 'FINISHED'
        ? '✅ Trận đã kết thúc'
        : this.matchState === 'FINAL_ROUND'
          ? '🔥 FINAL ROUND'
          : `Round ${this.roundNumber}`;

    const lines = sorted.map(
      (p, i) =>
        `${medals[i] || '🏅'} <@${p.userId}> — **${formatCoins(p.battleCoin)}** BC · ` +
        `${p.wins} thắng / ${p.losses} thua${p.status === 'SPECTATOR' ? ' 👁️' : ''}`
    );

    return new EmbedBuilder()
      .setTitle('⚔️ BẢNG XẾP HẠNG — TÀI XỈU DEATHMATCH')
      .setDescription(`**Phòng ${this.roomId}** · ${state}\n\n${lines.join('\n') || 'Chưa có người chơi'}`)
      .setColor(config.colors.info)
      .setTimestamp();
  }

  getInfoEmbed() {
    const state =
      this.matchState === 'FINISHED'
        ? '✅ Đã kết thúc'
        : this.matchState === 'FINAL_ROUND'
          ? '🔥 FINAL ROUND'
          : '⚔️ Đang diễn ra';

    const embed = new EmbedBuilder()
      .setTitle('⚔️ TÀI XỈU DEATHMATCH')
      .setColor(config.colors.primary)
      .setDescription(
        `🏟️ **Phòng:** ${this.roomId}\n` +
        `👑 **Chủ phòng:** <@${this.hostId}>\n` +
        `📊 **Trạng thái:** ${state}\n` +
        `⏱️ Trận còn **${formatTime(Math.ceil(this.matchTimeLeft() / 1000))}**\n` +
        `👥 **Người chơi:** ${this.players.size}`
      );

    if (this.players.size > 0) {
      embed.addFields({
        name: '🪙 Battle Coin',
        value: this.standingsLines().join('\n'),
        inline: false,
      });
    }
    embed.setTimestamp();
    return embed;
  }

  stop() {
    // KHÔNG gọi super.stop() — nó reset lịch sử Tài Xỉu thường của guild
    this.isStopped = true;
    this.isActive = false;
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }
}

module.exports = DeathmatchSession;
