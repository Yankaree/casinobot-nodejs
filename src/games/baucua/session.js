const { EventEmitter } = require('events');
const { BaucuaSessionModel, BaucuaBetModel, UserModel } = require('../../database/models');
const { rollDice, isTriple, formatResults, ANIMALS, countAnimal } = require('./engine');
const { processRewards } = require('./reward');
const config = require('../../config');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatCoins, formatTime } = require('../../utils/formatter');

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
    this.restartTimer = null;
    this.message = null;
    this.bets = {};
    this.bettors = new Map();
    this._client = null;
    this._tickInterval = null;
    this._startTime = null;

    ANIMALS.forEach((a) => { this.bets[a.name] = 0; });
  }

  async start(client) {
    this._client = client;
    this.sessionId = await BaucuaSessionModel.create(this.guildId);
    if (!this.sessionId) {
      console.error('[Baucua] Failed to create session - no ID returned');
      return;
    }
    this.isActive = true;
    this.isStopped = false;
    this.isPaused = false;
    this.timeLeft = config.game.sessionDuration;
    ANIMALS.forEach((a) => { this.bets[a.name] = 0; });
    this.bettors.clear();

    const channel = client.channels.cache.get(this.channelId);
    if (!channel) return;

    this.message = await channel.send({
      embeds: [this.createEmbed()],
      components: this.createButtons(),
    });

    this._startTime = Date.now();
    this._tickInterval = setInterval(() => {
      if (this.isStopped || this.isPaused) {
        clearInterval(this._tickInterval);
        return;
      }
      const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
      this.timeLeft = Math.max(0, config.game.sessionDuration - elapsed);
      if (this.message) {
        this.message.edit({
          embeds: [this.createEmbed()],
          components: this.createButtons(),
        }).catch(() => {});
      }
      if (this.timeLeft <= 0) {
        clearInterval(this._tickInterval);
        this.end(client).catch((err) => console.error('[Baucua] Session end error:', err));
      }
    }, 1000);
  }

  createEmbed() {
    const totalBets = ANIMALS.reduce((sum, a) => sum + this.bets[a.name], 0);

    const animalLines = ANIMALS.map((a) => {
      const amount = this.bets[a.name];
      return `${a.emoji} **${a.label}**: ${formatCoins(amount)} 🪙`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🦀 BẦU CUA')
      .setColor(0xff69b4);

    if (this.isPaused) {
      embed.setDescription(
        `**Phiên #${this.sessionId}**\n\n` +
        `⏸️ **TẠM DỪNG** - Không ai đặt cược qua ${config.game.maxEmptyRounds} phiên\n` +
        `Dùng \`/baucua tieptuc\` để tiếp tục`
      );
    } else {
      embed.setDescription(
        `**Phiên #${this.sessionId}**\n` +
        `⏳ Còn **${formatTime(this.timeLeft)}**\n\n` +
        `${animalLines.join('\n')}\n\n` +
        `💰 **Tổng cược:** ${formatCoins(totalBets)} 🪙`
      );
    }

    if (!this.isPaused) {
      embed.setFooter({ text: 'Dùng /baucua bet <biểu tượng> <số coin> để đặt cược' });
    }

    embed.setTimestamp();
    return embed;
  }

  createButtons() {
    if (this.isPaused || !this.isActive) return [];

    const rows = [];
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    ANIMALS.forEach((a, i) => {
      const btn = new ButtonBuilder()
        .setCustomId(`baucua_select_${a.name}_${this.sessionId}`)
        .setLabel(`${a.emoji} ${a.label}`)
        .setStyle(ButtonStyle.Secondary);

      if (i < 3) row1.addComponents(btn);
      else row2.addComponents(btn);
    });

    rows.push(row1);
    if (row2.components.length > 0) rows.push(row2);
    return rows;
  }

  createResultEmbed(results, triple, bets) {
    const tripleWin = isTriple(results);
    const tripleName = tripleWin ? results[0].name : null;

    const embed = new EmbedBuilder()
      .setTitle('🦀 KẾT QUẢ BẦU CUA')
      .setDescription(`**Phiên #${this.sessionId}**`)
      .addFields({
        name: '🎲 Kết quả',
        value: formatResults(results),
        inline: false,
      })
      .setColor(0xff69b4);

    if (tripleWin) {
      const animal = ANIMALS.find((a) => a.name === tripleName);
      embed.addFields({
        name: '💎 BỘ BA ĐẶC BIỆT!',
        value: `${animal.emoji} ${animal.label} ${animal.emoji} ${animal.label} ${animal.emoji} ${animal.label}\nThưởng đặc biệt ×1.4!`,
        inline: false,
      });
    }

    const winners = bets.filter((b) => b.won && b.payout > 0);
    const losers = bets.filter((b) => !b.won || b.payout === 0);

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

    embed.setTimestamp();
    return embed;
  }

  formatBettorList(list, won) {
    if (!list.length) return 'Không có';
    const lines = list.map((b) => {
      const animal = ANIMALS.find((a) => a.name === b.animal);
      const emoji = animal ? animal.emoji : '';
      return won
        ? `<@${b.discord_id}> ${emoji} +${formatCoins(b.payout)} 🪙`
        : `<@${b.discord_id}> ${emoji} -${formatCoins(b.amount)} 🪙`;
    });
    let text = lines.join('\n');
    if (text.length > 1000) {
      text = `${lines.slice(0, 15).join('\n')}\n... và ${lines.length - 15} người khác`;
    }
    return text;
  }

  async addBet(userId, animal, amount) {
    if (!this.isActive) return { success: false, message: 'Phiên đã đóng!' };
    if (this.isStopped) return { success: false, message: 'Game đã dừng!' };
    if (this.isPaused) return { success: false, message: '⏸️ Game đang tạm dừng! Dùng `/baucua tieptuc` để tiếp tục' };
    if (amount < 1000) return { success: false, message: 'Mức cược tối thiểu là **1,000** 🪙!' };

    const existingBets = this.bettors.get(userId) || [];
    if (existingBets.length >= 6) {
      return { success: false, message: 'Bạn đã đặt tối đa **6 cửa** rồi!' };
    }

    const existingBet = existingBets.find((b) => b.animal === animal);
    if (existingBet) {
      return { success: false, message: `Bạn đã cược **${animal}** rồi! Mỗi cửa chỉ cược 1 lần.` };
    }

    const balance = await UserModel.getBalance(this.guildId, userId);
    if (balance < amount) {
      return { success: false, message: `Không đủ coin! Số dư: ${formatCoins(balance)} 🪙` };
    }

    await UserModel.removeCoins(this.guildId, userId, amount);
    this.bets[animal] += amount;

    if (!this.bettors.has(userId)) {
      this.bettors.set(userId, []);
    }
    this.bettors.get(userId).push({ animal, amount });

    const user = await UserModel.getOrCreate(this.guildId, userId);
    await BaucuaBetModel.create(this.sessionId, user.id, animal, amount);

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

    const totalBets = ANIMALS.reduce((sum, a) => sum + this.bets[a.name], 0);
    const channel = client.channels.cache.get(this.channelId);

    if (totalBets === 0) {
      this.emptyRoundCount++;

      if (channel) {
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🦀 BẦU CUA')
              .setDescription(`**Phiên #${this.sessionId}**\n\nKhông ai đặt cược. Bắt đầu phiên mới...`)
              .setColor(config.colors.info),
          ],
        });
      }

      if (this.emptyRoundCount >= config.game.maxEmptyRounds) {
        this.isPaused = true;
        if (channel) {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle('🦀 BẦU CUA - TẠM DỪNG')
                .setDescription(
                  `**Đã ${config.game.maxEmptyRounds} phiên liên tiếp không ai đặt cược!**\n\n` +
                  `⏸️ Game đang tạm dừng. Dùng \`/baucua tieptuc\` để tiếp tục!`
                )
                .setColor(config.colors.info),
            ],
          });
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
        .setTitle('🦀 BẦU CUA')
        .setDescription(`**Phiên #${this.sessionId}**\n\n🎲 Đang lắc xúc xắc...`)
        .setColor(0xff69b4);
      await channel.send({ embeds: [rollingEmbed] });
    }

    await new Promise((r) => setTimeout(r, 2000));

    if (this.isStopped) return;

    const results = rollDice();
    const triple = isTriple(results);

    await BaucuaSessionModel.finish(
      this.sessionId,
      results[0].name,
      results[1].name,
      results[2].name,
      totalBets
    );

    await processRewards(this.guildId, this.sessionId, results, totalBets);

    const updatedBets = await BaucuaBetModel.getSessionBets(this.sessionId);

    if (channel) {
      await channel.send({
        embeds: [this.createResultEmbed(results, triple, updatedBets)],
      });
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
      this.message.edit({ embeds: [this.createEmbed()], components: [] }).catch(() => {});
    }
    return true;
  }

  async resume(client) {
    if (!this.isPaused) return false;
    this.isPaused = false;
    this.emptyRoundCount = 0;
    this.sessionId = null;
    await this.start(client);
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
  }
}

module.exports = GameSession;
