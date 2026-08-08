const { EventEmitter } = require('events');
const { SessionModel, BetModel, ConfigModel, UserModel } = require('../../database/models');
const { rollDiceWithWeight, calculateResult, isJackpot, resetHistory } = require('./engine');
const { processRewards } = require('./reward');
const config = require('../../config');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatCoins, formatDice, formatProgressBar, formatTime, getResultEmoji, getResultText } = require('../../utils/formatter');

class GameSession extends EventEmitter {
  constructor(guildId, channelId) {
    super();
    this.guildId = guildId;
    this.channelId = channelId;
    this.sessionId = null;
    this.isActive = false;
    this.isStopped = false;
    this.isPaused = false;
    this.emptyRoundCount = 0;
    this.timeLeft = config.game.sessionDuration;
    this.timer = null;
    this.updateTimer = null;
    this.restartTimer = null;
    this.message = null;
    this.bets = { tai: 0, xiu: 0 };
    this.bettors = new Map();
    this._client = null;
  }

  async start(client) {
    this._client = client;
    this.sessionId = await SessionModel.create(this.guildId);
    if (!this.sessionId) {
      console.error('Failed to create session - no ID returned');
      return;
    }
    this.isActive = true;
    this.isStopped = false;
    this.isPaused = false;
    this.timeLeft = config.game.sessionDuration;
    this.bets = { tai: 0, xiu: 0 };
    this.bettors.clear();
    resetHistory(this.guildId);

    const channel = client.channels.cache.get(this.channelId);
    if (!channel) return;

    this.message = await channel.send({ embeds: [this.createEmbed()] });

    this._startTime = Date.now();
    this._tickInterval = setInterval(() => {
      if (this.isStopped || this.isPaused) {
        clearInterval(this._tickInterval);
        return;
      }
      const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
      this.timeLeft = Math.max(0, config.game.sessionDuration - elapsed);
      if (this.message) {
        this.message.edit({ embeds: [this.createEmbed()] }).catch(() => {});
      }
      if (this.timeLeft <= 0) {
        clearInterval(this._tickInterval);
        this.end(client);
      }
    }, 1000);
  }

  createEmbed() {
    const totalBets = this.bets.tai + this.bets.xiu;
    let taiBar, xiuBar;
    
    if (totalBets === 0) {
      taiBar = '░░░░░░░░░░';
      xiuBar = '░░░░░░░░░░';
    } else {
      taiBar = formatProgressBar(this.bets.tai, totalBets, 10);
      xiuBar = formatProgressBar(this.bets.xiu, totalBets, 10);
    }

    const embed = new EmbedBuilder()
      .setTitle('🎲 TÀI XỈU')
      .setColor(config.colors.primary);

    if (this.isPaused) {
      embed.setDescription(
        `**Phiên #${this.sessionId}**\n\n` +
        `⏸️ **TẠM DỪNG** - Không ai đặt cược qua ${config.game.maxEmptyRounds} phiên\n` +
        `Dùng \`/tieptuc\` để tiếp tục`
      );
    } else {
      embed.setDescription(`**Phiên #${this.sessionId}**\n⏱️ Còn **${formatTime(this.timeLeft)}**`);
    }

    embed.addFields(
      {
        name: '📈 TÀI',
        value: `${taiBar} **${formatCoins(this.bets.tai)}** 🪙`,
        inline: true,
      },
      {
        name: '📉 XỈU',
        value: `${xiuBar} **${formatCoins(this.bets.xiu)}** 🪙`,
        inline: true,
      }
    );

    if (!this.isPaused) {
      embed.setFooter({ text: 'Dùng /bet tai hoặc /bet xiu để đặt cược' });
    }

    embed.setTimestamp();
    return embed;
  }

  createResultEmbed(d1, d2, d3, result, jackpot, bets) {
    const jackpotWin = isJackpot(d1, d2, d3);
    
    const embed = new EmbedBuilder()
      .setTitle('🎲 KẾT QUẢ TÀI XỈU')
      .setDescription(`**Phiên #${this.sessionId}**`)
      .addFields(
        { name: '🎲 Xúc xắc', value: formatDice(d1, d2, d3), inline: true },
        { name: '📊 Tổng', value: `${d1 + d2 + d3}`, inline: true },
        {
          name: '🏆 Kết quả',
          value: `${getResultEmoji(result)} **${getResultText(result)}**`,
          inline: true,
        }
      )
      .setColor(result === 'tai' ? 0x00ff00 : 0xff0000);

    if (jackpotWin) {
      embed.addFields({
        name: '💎 NỔ HŨ!',
        value: `✨ ${formatDice(d1, d2, d3)} ✨\nThưởng đặc biệt +40%!`,
        inline: false,
      });
    }

    if (bets.length > 0) {
      const winners = bets.filter((b) => b.won);
      const losers = bets.filter((b) => !b.won);

      embed.addFields({
        name: `🏆 Người thắng (${winners.length})`,
        value: this.formatBettorList(winners, true),
        inline: false,
      });
      embed.addFields({
        name: `💔 Người thua (${losers.length})`,
        value: this.formatBettorList(losers, false),
        inline: false,
      });
    } else {
      embed.addFields({
        name: '🏆 Người thắng',
        value: 'Không có',
        inline: false,
      });
      embed.addFields({
        name: '💔 Người thua',
        value: 'Không có',
        inline: false,
      });
    }

    embed.setTimestamp();
    return embed;
  }

  formatBettorList(list, won) {
    if (!list.length) return 'Không có';
    const lines = list.map((b) =>
      won
        ? `<@${b.discord_id}> +${formatCoins(b.payout)} 🪙`
        : `<@${b.discord_id}> -${formatCoins(b.amount)} 🪙`
    );
    let text = lines.join('\n');
    if (text.length > 1000) {
      text = `${lines.slice(0, 15).join('\n')}\n... và ${lines.length - 15} người khác`;
    }
    return text;
  }

  async addBet(userId, choice, amount) {
    if (!this.isActive) return { success: false, message: 'Phiên đã đóng!' };
    if (this.isStopped) return { success: false, message: 'Game đã dừng!' };
    if (this.isPaused) return { success: false, message: '⏸️ Game đang tạm dừng! Chờ admin `/tieptuc`' };
    if (amount < 1000) return { success: false, message: 'Mức cược tối thiểu là **1,000** 🪙!' };

    if (this.bettors.has(userId)) {
      return { success: false, message: 'Bạn đã đặt cược rồi!' };
    }

    const balance = await UserModel.getBalance(userId);
    if (balance < amount) {
      return { success: false, message: `Không đủ coin! Số dư: ${formatCoins(balance)} 🪙` };
    }

    await UserModel.removeCoins(userId, amount);
    this.bets[choice] += amount;
    this.bettors.set(userId, { choice, amount });

    const user = await UserModel.getOrCreate(userId);
    await BetModel.create(this.sessionId, user.id, choice, amount);

    return { success: true };
  }

  async end(client) {
    if (!this.isActive) return;
    if (this.isStopped) return;

    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this.isActive = false;

    const totalBets = this.bets.tai + this.bets.xiu;
    const channel = client.channels.cache.get(this.channelId);

    if (totalBets === 0) {
      this.emptyRoundCount++;

      if (channel) {
        await channel.send({ embeds: [
          new EmbedBuilder()
            .setTitle('🎲 TÀI XỈU')
            .setDescription(`**Phiên #${this.sessionId}**\n\nKhông ai đặt cược. Bắt đầu phiên mới...`)
            .setColor(config.colors.info)
        ] });
      }

      if (this.emptyRoundCount >= config.game.maxEmptyRounds) {
        this.isPaused = true;
        if (channel) {
          await channel.send({ embeds: [
            new EmbedBuilder()
              .setTitle('🎲 TÀI XỈU - TẠM DỪNG')
              .setDescription(
                `**Đã ${config.game.maxEmptyRounds} phiên liên tiếp không ai đặt cược!**\n\n` +
                `⏸️ Game đang tạm dừng. Dùng \`/tieptuc\` để tiếp tục!`
              )
              .setColor(config.colors.info)
          ] });
        }
        this.emit('ended', this.sessionId);
        return;
      }

      this.emit('ended', this.sessionId);
      this.restartTimer = setTimeout(() => {
        if (!this.isStopped) {
          this.start(client);
        }
      }, 3000);
      return;
    }

    this.emptyRoundCount = 0;

    if (channel) {
      const rollingEmbed = new EmbedBuilder()
        .setTitle('🎲 TÀI XỈU')
        .setDescription(`**Phiên #${this.sessionId}**\n\n🎲 Đang lắc xúc xắc...`)
        .setColor(config.colors.primary);
      await channel.send({ embeds: [rollingEmbed] });
    }

    await new Promise(r => setTimeout(r, 2000));

    if (this.isStopped) return;

    const { d1, d2, d3 } = rollDiceWithWeight(this.guildId);
    const result = calculateResult(d1, d2, d3);
    const jackpot = isJackpot(d1, d2, d3);

    await SessionModel.finish(this.sessionId, d1, d2, d3, result, totalBets);

    const bets = await BetModel.getSessionBets(this.sessionId);
    await processRewards(this.guildId, this.sessionId, result, jackpot, bets);

    const updatedBets = await BetModel.getSessionBets(this.sessionId);

    if (channel) {
      await channel.send({ embeds: [this.createResultEmbed(d1, d2, d3, result, jackpot, updatedBets)] });
    }

    this.emit('ended', this.sessionId);

    this.restartTimer = setTimeout(() => {
      if (!this.isStopped) {
        this.start(client);
      }
    }, 5000);
  }

  pause() {
    if (this.isStopped || !this.isActive) return false;
    this.isPaused = true;
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    if (this.message) {
      this.message.edit({ embeds: [this.createEmbed()] }).catch(() => {});
    }
    return true;
  }

  resume(client) {
    if (!this.isPaused) return false;
    this.isPaused = false;
    this.emptyRoundCount = 0;
    this.sessionId = null;
    this.start(client);
    return true;
  }

  stop() {
    this.isStopped = true;
    this.isActive = false;
    this.isPaused = false;
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    resetHistory(this.guildId);
  }
}

module.exports = GameSession;
