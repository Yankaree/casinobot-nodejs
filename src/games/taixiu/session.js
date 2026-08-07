const { EventEmitter } = require('events');
const { SessionModel, BetModel, ConfigModel, UserModel } = require('../../database/models');
const { rollDice, calculateResult, isJackpot } = require('./engine');
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
    this.timeLeft = config.game.sessionDuration;
    this.timer = null;
    this.updateTimer = null;
    this.message = null;
    this.bets = { tai: 0, xiu: 0 };
    this.bettors = new Map();
  }

  async start(client) {
    this.sessionId = await SessionModel.create(this.guildId);
    this.isActive = true;
    this.timeLeft = config.game.sessionDuration;
    this.bets = { tai: 0, xiu: 0 };
    this.bettors.clear();

    const channel = client.channels.cache.get(this.channelId);
    if (!channel) return;

    this.message = await channel.send({ embeds: [this.createEmbed()] });

    const tick = () => {
      const jitter = 800 + Math.random() * 400;
      this.updateTimer = setTimeout(() => {
        this.timeLeft--;
        if (this.message) {
          this.message.edit({ embeds: [this.createEmbed()] }).catch(() => {});
        }
        if (this.timeLeft > 0) {
          tick();
        } else {
          this.end(client);
        }
      }, jitter);
    };
    tick();
  }

  createEmbed() {
    const taiBar = formatProgressBar(this.bets.tai, this.bets.tai + this.bets.xiu + 1, 10);
    const xiuBar = formatProgressBar(this.bets.xiu, this.bets.tai + this.bets.xiu + 1, 10);

    return new EmbedBuilder()
      .setTitle('🎲 TÀI XỈU')
      .setDescription(`**Phiên #${this.sessionId}**\n⏱️ Còn **${formatTime(this.timeLeft)}**`)
      .addFields(
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
      )
      .setColor(config.colors.primary)
      .setFooter({ text: 'Dùng /bet tai hoặc /bet xiu để đặt cược' })
      .setTimestamp();
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
      const winnerLines = bets
        .filter((b) => b.won)
        .map((b) => `<@${b.discord_id}> +${formatCoins(b.payout)} 🪙`);
      const loserLines = bets
        .filter((b) => !b.won)
        .map((b) => `<@${b.discord_id}> -${formatCoins(b.amount)} 🪙`);

      if (winnerLines.length > 0) {
        embed.addFields({
          name: '🏆 Người thắng',
          value: winnerLines.join('\n') || 'Không có',
          inline: false,
        });
      }
      if (loserLines.length > 0) {
        embed.addFields({
          name: '💔 Người thua',
          value: loserLines.join('\n') || 'Không có',
          inline: false,
        });
      }
    }

    embed.setTimestamp();
    return embed;
  }

  async addBet(userId, choice, amount) {
    if (!this.isActive) return { success: false, message: 'Phiên đã đóng!' };
    if (amount <= 0) return { success: false, message: 'Số tiền phải lớn hơn 0!' };

    if (this.bettors.has(userId)) {
      return { success: false, message: 'Bạn đã đặt cược rồi!' };
    }

    this.bets[choice] += amount;
    this.bettors.set(userId, { choice, amount });

    const user = await UserModel.getOrCreate(userId);
    await BetModel.create(this.sessionId, user._id, choice, amount);

    return { success: true };
  }

  async end(client) {
    if (!this.isActive) return;

    clearTimeout(this.updateTimer);
    this.isActive = false;

    const totalBets = this.bets.tai + this.bets.xiu;
    const channel = client.channels.cache.get(this.channelId);

    if (totalBets === 0) {
      if (channel) {
        await channel.send({ embeds: [
          new EmbedBuilder()
            .setTitle('🎲 TÀI XỈU')
            .setDescription(`**Phiên #${this.sessionId}**\n\nKhông ai đặt cược. Bắt đầu phiên mới...`)
            .setColor(config.colors.info)
        ] });
      }
      this.emit('ended', this.sessionId);
      setTimeout(() => { this.start(client); }, 3000);
      return;
    }

    if (channel) {
      const rollingEmbed = new EmbedBuilder()
        .setTitle('🎲 TÀI XỈU')
        .setDescription(`**Phiên #${this.sessionId}**\n\n🎲 Đang lắc xúc xắc...`)
        .setColor(config.colors.primary);
      await channel.send({ embeds: [rollingEmbed] });
    }

    await new Promise(r => setTimeout(r, 2000));

    const { d1, d2, d3 } = rollDice();
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

    setTimeout(() => {
      this.start(client);
    }, 5000);
  }

  stop() {
    clearTimeout(this.updateTimer);
    this.isActive = false;
  }
}

module.exports = GameSession;
