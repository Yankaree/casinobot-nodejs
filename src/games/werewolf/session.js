const { EventEmitter } = require('events');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const { assignRoles, getRole } = require('./roles');
const { rollRandomEvent, checkLastCandle } = require('./events');
const { formatTime } = require('../../utils/formatter');

function secureRandom(max) {
  return crypto.randomInt(0, max);
}

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 15;
const DISCUSSION_TIME = 45;
const VOTE_TIME = 30;
const NIGHT_ACTION_TIME = 30;

const werewolfSessions = new Map();

class WerewolfSession extends EventEmitter {
  constructor(guildId, channelId, creatorId) {
    super();
    this.lobbyId = `${guildId}_${channelId}`;
    this.guildId = guildId;
    this.channelId = channelId;
    this.creatorId = creatorId;

    this.phase = 'lobby'; // lobby | night | discussion | voting | ended
    this.day = 0;
    this.round = 0;

    this.players = [];
    this.deadPlayers = [];
    this.lobbyMessage = null;
    this.gameMessage = null;

    this.activeEvents = [];
    this.effects = [];
    this.pendingKills = [];
    this.pendingHeals = [];
    this.pendingGuards = [];
    this.pendingInvestigates = [];
    this.poisonUses = 0;
    this.maxPoisonUses = 2;

    this.votes = {};
    this.voteMessage = null;
    this.lastCandleChecked = false;

    this.nightTimer = null;
    this.dayTimer = null;
    this.discussionTimer = null;
    this._client = null;
    this.winner = null;

    this.startedAt = null;
  }

  addPlayer(userId) {
    if (this.phase !== 'lobby') return { success: false, message: 'Game đã bắt đầu!' };
    if (this.players.length >= MAX_PLAYERS) return { success: false, message: 'Lobby đã đầy!' };
    if (this.players.find((p) => p.userId === userId)) {
      return { success: false, message: 'Bạn đã trong lobby!' };
    }

    this.players.push({
      userId,
      role: null,
      team: null,
      alive: true,
      hp: 1,
      maxHp: 1,
      deathReason: null,
      deathDay: null,
      killedBy: null,
    });

    return { success: true };
  }

  removePlayer(userId) {
    if (this.phase !== 'lobby') return { success: false, message: 'Game đã bắt đầu, không thể rời!' };
    const idx = this.players.findIndex((p) => p.userId === userId);
    if (idx === -1) return { success: false, message: 'Bạn chưa trong lobby!' };

    this.players.splice(idx, 1);

    // Transfer ownership if creator leaves
    if (this.creatorId === userId && this.players.length > 0) {
      this.creatorId = this.players[0].userId;
    }

    return { success: true };
  }

  async start(client) {
    if (this.phase !== 'lobby') {
      return { success: false, message: 'Game đã bắt đầu!' };
    }
    if (this.players.length < MIN_PLAYERS) {
      return { success: false, message: `Cần ít nhất ${MIN_PLAYERS} người chơi!` };
    }

    this._client = client;
    this.startedAt = Date.now();

    const assignments = assignRoles(this.players.map((p) => p.userId));

    for (const player of this.players) {
      const roleId = assignments[player.userId];
      const roleDef = getRole(roleId);
      player.role = roleId;
      player.team = roleDef.team;
      player.hp = 1;
      player.maxHp = 1;
    }

    for (const player of this.players) {
      await this.sendRoleDM(client, player);
    }

    this.phase = 'night';
    this.day = 1;
    this.round = 1;

    await this.startNight(client);

    return { success: true };
  }

  async sendRoleDM(client, player) {
    const roleDef = getRole(player.role);
    const skills = roleDef.skills.length > 0
      ? roleDef.skills.map((s) => {
          const skillNames = {
            heal: 'Cứu người',
            poison: 'Độc tố',
            investigate: 'Soi role',
            guard: 'Bảo vệ',
            shoot_on_death: 'Bắn khi chết',
          };
          return `• ${skillNames[s] || s}`;
        }).join('\n')
      : 'Không có';

    const teamText = {
      werewolf: 'Sói',
      villager: 'Dân làng',
      neutral: 'Trung lập',
    };

    const content =
      `${roleDef.emoji} **Vai trò của bạn:**\n\n` +
      `**${roleDef.name}**\n\n` +
      `Phe: ${teamText[player.team]}\n` +
      `Kỹ năng:\n${skills}\n\n` +
      `_Đây là tin nhắn bí mật. Không chia sẻ role!_`;

    try {
      const user = await client.users.fetch(player.userId);
      await user.send({ content });
    } catch {
      // DM failed
    }
  }

  async startNight(client) {
    this.phase = 'night';
    this.pendingKills = [];
    this.pendingHeals = [];
    this.pendingGuards = [];
    this.pendingInvestigates = [];

    // Roll random event for this night
    this.activeEvents = [];
    const event = rollRandomEvent(this);
    if (event) {
      this.activeEvents.push(event);
      // Apply event effect immediately
      event.effect(this);
    }

    const channel = client.channels.cache.get(this.channelId);
    if (!channel) return;

    let nightDesc =
      `**Ngày ${this.day}**\n\n` +
      `Đêm đã buông xuống. Sói đang đi săn...\n` +
      `Thời gian hành động: **${formatTime(NIGHT_ACTION_TIME)}**\n`;

    if (event) {
      nightDesc += `\n${event.emoji} **Sự kiện:** ${event.name}\n_${event.description}_\n`;
    }

    nightDesc += `\n_Role có hành động ban đêm, hãy sử dụng kỹ năng!_`;

    const nightEmbed = new EmbedBuilder()
      .setTitle('🌙 ĐÊM ĐEN TỐI')
      .setDescription(nightDesc)
      .setColor(0x1a1a2e)
      .setTimestamp();

    this.gameMessage = await channel.send({ embeds: [nightEmbed] });

    this.nightTimer = setTimeout(() => {
      this.resolveNight(client).catch((err) => {
        console.error('[WW] Night resolve error:', err);
      });
    }, NIGHT_ACTION_TIME * 1000);
  }

  _isFrozen(userId) {
    return this.effects.some(
      (e) => e.type === 'freeze' && e.targetId === userId && e.rounds > 0
    );
  }

  submitNightAction(userId, action, targetId) {
    if (this.phase !== 'night') return { success: false, message: 'Không phải ban đêm!' };

    const player = this.players.find((p) => p.userId === userId && p.alive);
    if (!player) return { success: false, message: 'Bạn không còn sống!' };

    if (this._isFrozen(userId)) {
      return { success: false, message: '❄️ Bạn bị đóng băng, không thể hành động!' };
    }

    const roleDef = getRole(player.role);
    if (!roleDef.nightActions.includes(action)) {
      return { success: false, message: 'Role của bạn không có hành động này!' };
    }

    // No self-targeting for kill, investigate
    if ((action === 'kill' || action === 'investigate') && targetId === userId) {
      return { success: false, message: 'Không thể chọn chính mình!' };
    }

    // Wolf-on-wolf check
    if (action === 'kill') {
      const target = this.players.find((p) => p.userId === targetId);
      if (target && target.team === 'werewolf') {
        return { success: false, message: 'Không thể giết đồng đội!' };
      }
    }

    if (action === 'kill') {
      const existing = this.pendingKills.find((k) => k.attackerId === userId);
      if (existing) {
        existing.targetId = targetId;
      } else {
        this.pendingKills.push({ attackerId: userId, targetId });
      }
    } else if (action === 'heal') {
      this.pendingHeals = this.pendingHeals.filter((h) => h.healerId !== userId);
      this.pendingHeals.push({ healerId: userId, targetId });
    } else if (action === 'guard') {
      this.pendingGuards = this.pendingGuards.filter((g) => g.guardId !== userId);
      this.pendingGuards.push({ guardId: userId, targetId });
    } else if (action === 'investigate') {
      this.pendingInvestigates = this.pendingInvestigates.filter((i) => i.investigatorId !== userId);
      this.pendingInvestigates.push({ investigatorId: userId, targetId });
    }

    return { success: true };
  }

  async resolveNight(client) {
    if (this.nightTimer) {
      clearTimeout(this.nightTimer);
      this.nightTimer = null;
    }

    if (this.phase !== 'night') return;

    // Resolve investigates
    for (const inv of this.pendingInvestigates) {
      const investigator = this.players.find((p) => p.userId === inv.investigatorId && p.alive);
      if (!investigator) continue;

      const target = this.players.find((p) => p.userId === inv.targetId);
      if (!target || !target.alive) continue;

      const hasIllusion = this.effects.some((e) => e.type === 'illusion' && e.rounds > 0);
      let revealedTeam = target.team;
      if (hasIllusion) {
        const teams = ['werewolf', 'villager', 'neutral'];
        revealedTeam = teams[secureRandom(teams.length)];
      }

      try {
        const user = await client.users.fetch(inv.investigatorId);
        const teamText = { werewolf: '🐺 Sói', villager: '🧑‍🌾 Dân làng', neutral: '⚖️ Trung lập' };
        await user.send({
          content: `🔮 **Kết quả soi:**\n<@${inv.targetId}> là ${teamText[revealedTeam] || revealedTeam}`,
        });
      } catch {}
    }

    // Resolve guards (before kills - guards protect targets)
    const guardedIds = new Set(this.pendingGuards.map((g) => g.targetId));

    // Resolve kills
    const bloodMoon = this.effects.some((e) => e.type === 'blood_moon' && e.rounds > 0);

    for (const kill of this.pendingKills) {
      const attacker = this.players.find((p) => p.userId === kill.attackerId && p.alive);
      if (!attacker) continue;

      const target = this.players.find((p) => p.userId === kill.targetId);
      if (!target || !target.alive) continue;

      // Check if healed
      const isHealed = this.pendingHeals.some((h) => h.targetId === kill.targetId);
      if (isHealed) {
        try {
          const user = await client.users.fetch(kill.attackerId);
          await user.send({ content: `🩺 Cuộc tấn công vào <@${kill.targetId}> đã bị bác sĩ cứu!` });
        } catch {}
        continue;
      }

      // Check if guarded
      if (guardedIds.has(kill.targetId)) {
        const guardInfo = this.pendingGuards.find((g) => g.targetId === kill.targetId);
        const guard = guardInfo
          ? this.players.find((p) => p.userId === guardInfo.guardId && p.alive)
          : null;
        if (guard) {
          guard.alive = false;
          guard.deathReason = 'guard';
          guard.deathDay = this.day;
          guard.killedBy = kill.attackerId;
          this.deadPlayers.push({ ...guard });

          try {
            const user = await client.users.fetch(guard.userId);
            await user.send({ content: '🛡️ Bạn đã chết vì bảo vệ người khác!' });
          } catch {}
        }
        continue;
      }

      // Apply damage
      const damage = bloodMoon ? 2 : 1;
      target.hp -= damage;

      if (target.hp <= 0) {
        target.alive = false;
        target.deathReason = 'killed';
        target.deathDay = this.day;
        target.killedBy = kill.attackerId;
        this.deadPlayers.push({ ...target });
      }
    }

    // Decrement effect rounds
    for (const effect of this.effects) {
      if (effect.rounds !== undefined && effect.rounds > 0) {
        effect.rounds--;
      }
    }
    this.effects = this.effects.filter((e) => e.rounds > 0);

    // Check last candle
    const candleResult = checkLastCandle(this);
    if (candleResult) {
      const resurrected = this.players.find((p) => p.userId === candleResult.player.userId);
      if (resurrected) {
        resurrected.alive = true;
        resurrected.hp = resurrected.maxHp;
        resurrected.deathReason = null;
        resurrected.deathDay = null;
        this.deadPlayers = this.deadPlayers.filter((p) => p.userId !== resurrected.userId);
      }
    }

    // Report deaths
    await this.reportNightResults(client, candleResult);

    // Check win condition
    if (this.checkWinCondition()) {
      await this.endGame(client);
      return;
    }

    // Start discussion
    this.day++;
    await this.startDiscussion(client);
  }

  async reportNightResults(client, candleResult) {
    const channel = client.channels.cache.get(this.channelId);
    if (!channel) return;

    const fog = this.effects.some((e) => e.type === 'fog' && e.rounds > 0);
    const deaths = this.deadPlayers.filter((p) => p.deathDay === this.day);

    let desc = `**Ngày ${this.day} - Bình minh**\n\n`;

    if (fog) {
      desc += '🌫️ Sương mù bao phủ. Không thể nhìn thấy gì...\n';
    } else if (deaths.length === 0) {
      desc += '🌅 Đêm qua không ai chết!\n';
    } else {
      for (const d of deaths) {
        const roleDef = getRole(d.role);
        desc += `${roleDef.emoji} <@${d.userId}> đã bị giết trong đêm.\n`;
      }
    }

    if (candleResult) {
      desc += `\n🕯️ **Ngọn nến cuối cùng đã cháy sáng!**\n<@${candleResult.player.userId}> đã được hồi sinh.\n`;
    }

    const alive = this.players.filter((p) => p.alive);
    desc += `\n👤 Còn lại: **${alive.length}** người`;

    const embed = new EmbedBuilder()
      .setTitle('🌅 BÌNH MINH')
      .setDescription(desc)
      .setColor(0xffa500)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  }

  async startDiscussion(client) {
    this.phase = 'discussion';

    const channel = client.channels.cache.get(this.channelId);
    if (!channel) return;

    const rainEffect = this.effects.some((e) => e.type === 'heavy_rain' && e.rounds > 0);
    const time = rainEffect ? Math.floor(DISCUSSION_TIME * 0.7) : DISCUSSION_TIME;

    const embed = new EmbedBuilder()
      .setTitle('💬 THẢO LUẬN')
      .setDescription(
        `**Ngày ${this.day}**\n\n` +
        `Thời gian thảo luận: **${formatTime(time)}**\n\n` +
        `Hãy thảo luận và tìm ra ai là sói!\n` +
        `_Dùng \`/ww docto @user\` nếu bạn là Dược sư tha hoá._`
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    this.discussionTimer = setTimeout(() => {
      this.startVoting(client).catch((err) => {
        console.error('[WW] Voting start error:', err);
      });
    }, time * 1000);
  }

  async startVoting(client) {
    this.phase = 'voting';
    this.votes = {};

    const channel = client.channels.cache.get(this.channelId);
    if (!channel) return;

    const alive = this.players.filter((p) => p.alive);
    const playerList = alive.map((p, i) => `${i + 1}. <@${p.userId}>`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🗳️ BẦU CỬ')
      .setDescription(
        `**Ngày ${this.day}**\n\n` +
        `Thời gian bầu cử: **${formatTime(VOTE_TIME)}**\n\n` +
        `${playerList}\n\n` +
        `_Dùng \`/ww vote @user\` để bầu chọn._`
      )
      .setColor(0xffd700)
      .setTimestamp();

    this.voteMessage = await channel.send({ embeds: [embed] });

    this.dayTimer = setTimeout(() => {
      this.resolveVotes(client).catch((err) => {
        console.error('[WW] Vote resolve error:', err);
      });
    }, VOTE_TIME * 1000);
  }

  submitVote(voterId, targetId) {
    if (this.phase !== 'voting') return { success: false, message: 'Không phải lúc bầu cử!' };

    const voter = this.players.find((p) => p.userId === voterId && p.alive);
    if (!voter) return { success: false, message: 'Bạn không còn sống!' };

    if (this._isFrozen(voterId)) {
      return { success: false, message: '❄️ Bạn bị đóng băng, không thể bầu!' };
    }

    const target = this.players.find((p) => p.userId === targetId && p.alive);
    if (!target) return { success: false, message: 'Người này không còn sống!' };

    if (voterId === targetId) return { success: false, message: 'Không thể bầu chính mình!' };

    this.votes[voterId] = targetId;
    return { success: true };
  }

  async resolveVotes(client) {
    if (this.dayTimer) {
      clearTimeout(this.dayTimer);
      this.dayTimer = null;
    }

    if (this.phase !== 'voting') return;

    const voteCounts = {};
    for (const [voter, target] of Object.entries(this.votes)) {
      voteCounts[target] = (voteCounts[target] || 0) + 1;
    }

    let maxVotes = 0;
    let eliminated = null;
    let tied = false;

    for (const [target, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminated = target;
        tied = false;
      } else if (count === maxVotes && count > 0) {
        tied = true;
      }
    }

    const channel = client.channels.cache.get(this.channelId);
    if (!channel) return;

    if (!eliminated || tied || maxVotes === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🗳️ KẾT QUẢ BẦU CỬ')
        .setDescription(
          `**Ngày ${this.day}**\n\n` +
          `Không ai bị loại (bình đẳng hoặc không có phiếu).`
        )
        .setColor(0x808080)
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    } else {
      const target = this.players.find((p) => p.userId === eliminated);
      if (target) {
        target.alive = false;
        target.deathReason = 'voted';
        target.deathDay = this.day;
        this.deadPlayers.push({ ...target });

        const roleDef = getRole(target.role);

        const embed = new EmbedBuilder()
          .setTitle('🗳️ KẾT QUẢ BẦU CỬ')
          .setDescription(
            `**Ngày ${this.day}**\n\n` +
            `<@${eliminated}> đã bị loại với **${maxVotes}** phiếu.\n\n` +
            `${roleDef.emoji} Role: **${roleDef.name}**`
          )
          .setColor(0xff0000)
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      }
    }

    // Check win
    if (this.checkWinCondition()) {
      await this.endGame(client);
      return;
    }

    // New night
    await this.startNight(client);
  }

  usePoison(casterId, targetId) {
    if (this.phase !== 'discussion') return { success: false, message: 'Chỉ dùng được ban ngày khi thảo luận!' };

    const caster = this.players.find((p) => p.userId === casterId && p.alive);
    if (!caster) return { success: false, message: 'Bạn không còn sống!' };
    if (caster.role !== 'corrupted_pharmacist') {
      return { success: false, message: 'Bạn không phải Dược sư tha hoá!' };
    }
    if (this.poisonUses >= this.maxPoisonUses) {
      return { success: false, message: `Đã dùng hết ${this.maxPoisonUses} lần độc!` };
    }

    const target = this.players.find((p) => p.userId === targetId && p.alive);
    if (!target) return { success: false, message: 'Người này không còn sống!' };
    if (targetId === casterId) return { success: false, message: 'Không thể tự đầu độc!' };

    this.poisonUses++;
    const delay = 10 + secureRandom(6); // 10-15 seconds

    setTimeout(() => {
      // Only kill if still in discussion phase and game not ended
      if (this.phase !== 'discussion' && this.phase !== 'voting') return;

      const t = this.players.find((p) => p.userId === targetId && p.alive);
      if (t) {
        t.alive = false;
        t.deathReason = 'poisoned';
        t.deathDay = this.day;
        this.deadPlayers.push({ ...t });

        const channel = this._client?.channels?.cache?.get(this.channelId);
        if (channel) {
          const embed = new EmbedBuilder()
            .setTitle('☠️ CÁI CHẾT BÍ ẨN')
            .setDescription(
              `<@${targetId}> đã chết trong lúc thảo luận.\n` +
              `_Không tiết lộ nguyên nhân._`
            )
            .setColor(0x800080)
            .setTimestamp();
          channel.send({ embeds: [embed] });
        }

        if (this._client && this.checkWinCondition()) {
          this.endGame(this._client).catch(() => {});
        }
      }
    }, delay * 1000);

    return { success: true };
  }

  checkWinCondition() {
    if (this.phase === 'ended') return false;

    const alive = this.players.filter((p) => p.alive);
    const wolves = alive.filter((p) => p.team === 'werewolf');
    const nonWolves = alive.filter((p) => p.team !== 'werewolf');
    const neutrals = alive.filter((p) => p.team === 'neutral');

    // Wolves eliminated
    if (wolves.length === 0) {
      // Check if neutral (mad_scientist) should win
      if (neutrals.length > 0 && alive.length === neutrals.length) {
        this.winner = 'neutral';
      } else {
        this.winner = 'villager';
      }
      return true;
    }

    // Wolves equal or outnumber others
    if (wolves.length >= nonWolves.length) {
      this.winner = 'werewolf';
      return true;
    }

    // Only 1 alive
    if (alive.length <= 1) {
      if (alive.length === 1 && alive[0].team === 'neutral') {
        this.winner = 'neutral';
      } else {
        this.winner = wolves.length > 0 ? 'werewolf' : 'villager';
      }
      return true;
    }

    return false;
  }

  async endGame(client) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.activeEvents = [];
    this.effects = [];

    if (this.nightTimer) clearTimeout(this.nightTimer);
    if (this.dayTimer) clearTimeout(this.dayTimer);
    if (this.discussionTimer) clearTimeout(this.discussionTimer);

    const channel = client.channels.cache.get(this.channelId);
    if (!channel) return;

    const winnerMap = {
      werewolf: { text: '🐺 Phe Sói', emoji: '🐺', color: 0xff0000 },
      villager: { text: '🧑‍🌾 Phe Dân làng', emoji: '🧑‍🌾', color: 0x00ff00 },
      neutral: { text: '⚖️ Phe Trung lập', emoji: '⚖️', color: 0xffd700 },
    };
    const w = winnerMap[this.winner] || winnerMap.villager;

    let roleReveal = '\n**Role của tất cả người chơi:**\n';
    for (const p of this.players) {
      const roleDef = getRole(p.role);
      const status = p.alive ? '✅' : '💀';
      roleReveal += `${status} <@${p.userId}> - ${roleDef.emoji} ${roleDef.name}\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${w.emoji} GAME KẾT THÚC`)
      .setDescription(
        `**${w.text} THẮNG!**\n\n` +
        `Số ngày: ${this.day - 1}\n` +
        `Thời gian: ${formatTime(Math.floor(((this.startedAt ? Date.now() - this.startedAt : 0)) / 1000))}\n` +
        roleReveal
      )
      .setColor(w.color)
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    this.emit('gameEnd', {
      guildId: this.guildId,
      winner: this.winner,
      players: this.players.length,
      days: this.day - 1,
      duration: this.startedAt ? Date.now() - this.startedAt : 0,
    });
  }

  stop() {
    this.phase = 'ended';
    this._client = null;
    if (this.nightTimer) clearTimeout(this.nightTimer);
    if (this.dayTimer) clearTimeout(this.dayTimer);
    if (this.discussionTimer) clearTimeout(this.discussionTimer);
  }

  getStatus() {
    const alive = this.players.filter((p) => p.alive);
    const dead = this.players.filter((p) => !p.alive);

    return {
      lobbyId: this.lobbyId,
      phase: this.phase,
      day: this.day,
      playerCount: this.players.length,
      aliveCount: alive.length,
      deadCount: dead.length,
      players: this.players.map((p) => ({
        userId: p.userId,
        alive: p.alive,
        role: p.role,
      })),
    };
  }
}

function getSession(lobbyId) {
  return werewolfSessions.get(lobbyId) || null;
}

function createSession(guildId, channelId, creatorId) {
  const lobbyId = `${guildId}_${channelId}`;
  if (werewolfSessions.has(lobbyId)) return null;

  const session = new WerewolfSession(guildId, channelId, creatorId);
  werewolfSessions.set(lobbyId, session);
  return session;
}

function deleteSession(lobbyId) {
  const session = werewolfSessions.get(lobbyId);
  if (session) {
    session.stop();
    werewolfSessions.delete(lobbyId);
  }
}

function cleanupStaleLobbies() {
  // Called on bot startup to mark stale lobbies
  for (const [lobbyId, session] of werewolfSessions) {
    if (session.phase === 'ended') {
      werewolfSessions.delete(lobbyId);
    }
  }
}

function getAllSessions() {
  return werewolfSessions;
}

module.exports = {
  WerewolfSession,
  getSession,
  createSession,
  deleteSession,
  getAllSessions,
  cleanupStaleLobbies,
  MIN_PLAYERS,
  MAX_PLAYERS,
};
