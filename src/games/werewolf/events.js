const crypto = require('crypto');

function secureRandom(max) {
  return crypto.randomInt(0, max);
}

const eventRegistry = new Map();

function registerEvent(id, definition) {
  eventRegistry.set(id, {
    id,
    name: definition.name,
    emoji: definition.emoji,
    description: definition.description,
    effect: definition.effect,
    duration: definition.duration || 'night',
    minPlayers: definition.minPlayers || 0,
  });
}

function getEvent(id) {
  return eventRegistry.get(id) || null;
}

function getAllEvents() {
  return Array.from(eventRegistry.values());
}

function rollRandomEvent(session) {
  const roll = secureRandom(100);
  if (roll >= 40) return null;

  const available = getAllEvents().filter(
    (e) => e.minPlayers <= session.players.length
  );
  if (available.length === 0) return null;

  const idx = secureRandom(available.length);
  return available[idx];
}

function checkLastCandle(session) {
  const alive = session.players.filter((p) => p.alive);
  const wolves = alive.filter((p) => p.team === 'werewolf');
  const villagers = alive.filter((p) => p.team !== 'werewolf');
  const deadVillagers = session.players.filter(
    (p) => !p.alive && p.team !== 'werewolf'
  );
  const deadWolves = session.players.filter(
    (p) => !p.alive && p.team === 'werewolf'
  );

  if (alive.length !== 3) return null;
  if (wolves.length !== 1) return null;
  if (villagers.length !== 2) return null;
  if (session.lastCandleChecked) return null;

  session.lastCandleChecked = true;

  const roll = secureRandom(100);
  if (roll >= 40) return null;

  let toResurrect = null;
  if (deadVillagers.length > 0) {
    toResurrect = deadVillagers[secureRandom(deadVillagers.length)];
  } else if (deadWolves.length > 0) {
    toResurrect = deadWolves[secureRandom(deadWolves.length)];
  }

  if (!toResurrect) return null;

  return {
    type: 'last_candle',
    player: toResurrect,
  };
}

// ═══════════════════════════════════════════
// REGISTER ALL EVENTS
// ═══════════════════════════════════════════

registerEvent('fog', {
  name: 'Sương mù',
  emoji: '🌫️',
  description: 'Sương mù bao phủ. Lính không thể thấy ai bị giết.',
  effect: (session) => {
    session.effects.push({ type: 'fog', rounds: 1 });
  },
  minPlayers: 4,
});

registerEvent('fish_rain', {
  name: 'Mưa cá',
  emoji: '🐟',
  description: 'Mưa cá rơi từ trời. Tất cả được hồi 1 máu.',
  effect: (session) => {
    session.players.forEach((p) => {
      if (p.hp < p.maxHp) p.hp = Math.min(p.hp + 1, p.maxHp);
    });
  },
  minPlayers: 4,
});

registerEvent('disease', {
  name: 'Bệnh tật',
  emoji: '🦠',
  description: 'Dịch bệnh lan rộng. Một người ngẫu nhiên bị mất 1 máu.',
  effect: (session) => {
    const alive = session.players.filter((p) => p.alive);
    if (alive.length === 0) return;
    const target = alive[secureRandom(alive.length)];
    target.hp -= 1;
    if (target.hp <= 0) {
      target.alive = false;
      target.deathReason = 'disease';
      target.deathDay = session.day;
      session.deadPlayers.push({ ...target });
    }
  },
  minPlayers: 4,
});

registerEvent('freeze', {
  name: 'Đóng băng',
  emoji: '❄️',
  description: 'Mùa đông giá rét. Một người bị đóng băng, mất lượt.',
  effect: (session) => {
    const alive = session.players.filter((p) => p.alive);
    if (alive.length === 0) return;
    const target = alive[secureRandom(alive.length)];
    session.effects.push({ type: 'freeze', targetId: target.userId, rounds: 1 });
  },
  minPlayers: 4,
});

registerEvent('illusion', {
  name: 'Ảo ảnh',
  emoji: '🪞',
  description: 'Ảo ảnh xuất hiện. Thầy bói soi nhầm người.',
  effect: (session) => {
    session.effects.push({ type: 'illusion', rounds: 1 });
  },
  minPlayers: 6,
});

registerEvent('lightning', {
  name: 'Sét đánh',
  emoji: '⚡',
  description: 'Tia sét đánh trúng. Một người bị mất 1 máu.',
  effect: (session) => {
    const alive = session.players.filter((p) => p.alive);
    if (alive.length === 0) return;
    const target = alive[secureRandom(alive.length)];
    target.hp -= 1;
    if (target.hp <= 0) {
      target.alive = false;
      target.deathReason = 'lightning';
      target.deathDay = session.day;
      session.deadPlayers.push({ ...target });
    }
  },
  minPlayers: 4,
});

registerEvent('heavy_rain', {
  name: 'Mưa lớn',
  emoji: '🌧️',
  description: 'Mưa lớn gây ngập. Vote ban ngày bị rút ngắn.',
  effect: (session) => {
    session.effects.push({ type: 'heavy_rain', rounds: 1 });
  },
  minPlayers: 4,
});

registerEvent('blood_moon', {
  name: 'Trăng máu',
  emoji: '🌕',
  description: 'Trăng máu hiện lên. Sói mạnh hơn, giết 2 người.',
  effect: (session) => {
    session.effects.push({ type: 'blood_moon', rounds: 1 });
  },
  minPlayers: 6,
});

registerEvent('volcano', {
  name: 'Núi lửa phun trào',
  emoji: '🌋',
  description: 'Núi lửa phun trào. Một người ngẫu nhiên bị thương nặng.',
  effect: (session) => {
    const alive = session.players.filter((p) => p.alive);
    if (alive.length === 0) return;
    const target = alive[secureRandom(alive.length)];
    target.hp -= 2;
    if (target.hp <= 0) {
      target.alive = false;
      target.deathReason = 'volcano';
      target.deathDay = session.day;
      session.deadPlayers.push({ ...target });
    }
  },
  minPlayers: 5,
});

module.exports = {
  registerEvent,
  getEvent,
  getAllEvents,
  rollRandomEvent,
  checkLastCandle,
};
