const crypto = require('crypto');

function secureRandom(max) {
  return crypto.randomInt(0, max);
}

const roleRegistry = new Map();

function registerRole(id, definition) {
  roleRegistry.set(id, {
    id,
    name: definition.name,
    emoji: definition.emoji,
    team: definition.team, // 'werewolf' | 'villager' | 'neutral'
    description: definition.description,
    skills: definition.skills || [],
    nightActions: definition.nightActions || [],
    dayActions: definition.dayActions || [],
    minPlayers: definition.minPlayers || 0,
    maxCount: definition.maxCount || Infinity,
    priority: definition.priority || 0,
  });
}

function getRole(id) {
  return roleRegistry.get(id) || null;
}

function getAllRoles() {
  return Array.from(roleRegistry.values());
}

function getRolesByTeam(team) {
  return getAllRoles().filter((r) => r.team === team);
}

function getAvailableRoles(playerCount) {
  return getAllRoles().filter((r) => r.minPlayers <= playerCount);
}

function buildRoleList(playerCount) {
  const roles = [];
  const available = getAvailableRoles(playerCount);

  const wolfCount = Math.max(1, Math.floor(playerCount / 4));

  const wolfRoles = available.filter((r) => r.team === 'werewolf');
  const villagerRoles = available.filter((r) => r.team === 'villager');
  const neutralRoles = available.filter((r) => r.team === 'neutral');

  // Add neutrals first (1 max if available)
  let neutralsAdded = 0;
  for (const role of neutralRoles) {
    if (neutralsAdded >= 1) break;
    roles.push(role.id);
    neutralsAdded++;
  }

  let villagersNeeded = playerCount - wolfCount - neutralsAdded;

  // Add wolf roles
  let wolvesAdded = 0;
  for (const role of wolfRoles) {
    if (wolvesAdded >= wolfCount) break;
    const count = Math.min(role.maxCount, wolfCount - wolvesAdded);
    for (let i = 0; i < count; i++) {
      roles.push(role.id);
      wolvesAdded++;
    }
  }
  while (wolvesAdded < wolfCount) {
    roles.push('werewolf');
    wolvesAdded++;
  }

  // Add villager roles
  let villagersAdded = 0;
  for (const role of villagerRoles) {
    if (villagersAdded >= villagersNeeded) break;
    const count = Math.min(role.maxCount, villagersNeeded - villagersAdded);
    for (let i = 0; i < count; i++) {
      roles.push(role.id);
      villagersAdded++;
    }
  }
  while (villagersAdded < villagersNeeded) {
    roles.push('villager');
    villagersAdded++;
  }

  return roles;
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = secureRandom(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function assignRoles(playerIds) {
  const roleList = buildRoleList(playerIds.length);
  const shuffledRoles = shuffleArray(roleList);
  const assignments = {};

  for (let i = 0; i < playerIds.length; i++) {
    assignments[playerIds[i]] = shuffledRoles[i];
  }

  return assignments;
}

// ═══════════════════════════════════════════
// REGISTER ALL ROLES
// ═══════════════════════════════════════════

registerRole('werewolf', {
  name: 'Sói',
  emoji: '🐺',
  team: 'werewolf',
  description: 'Sói tấn công dân làng vào ban đêm.',
  skills: [],
  nightActions: ['kill'],
  minPlayers: 4,
  maxCount: Infinity,
  priority: 10,
});

registerRole('villager', {
  name: 'Dân làng',
  emoji: '🧑‍🌾',
  team: 'villager',
  description: 'Dân thường, không có kỹ năng đặc biệt.',
  skills: [],
  nightActions: [],
  minPlayers: 0,
  maxCount: Infinity,
  priority: 0,
});

registerRole('doctor', {
  name: 'Bác sĩ',
  emoji: '🩺',
  team: 'villager',
  description: 'Có khả năng cứu một người mỗi đêm.',
  skills: ['heal'],
  nightActions: ['heal'],
  minPlayers: 4,
  maxCount: 1,
  priority: 5,
});

registerRole('corrupted_pharmacist', {
  name: 'Dược sư tha hoá',
  emoji: '☠️',
  team: 'werewolf',
  description: 'Phe Sói. Có kỹ năng Độc tố, dùng ban ngày để giết người bí mật.',
  skills: ['poison'],
  dayActions: ['poison'],
  minPlayers: 5,
  maxCount: 1,
  priority: 8,
});

registerRole('seer', {
  name: 'Thầy bói',
  emoji: '🔮',
  team: 'villager',
  description: 'Có thể soi một người mỗi đêm để biết phe.',
  skills: ['investigate'],
  nightActions: ['investigate'],
  minPlayers: 6,
  maxCount: 1,
  priority: 3,
});

registerRole('hunter', {
  name: 'Thợ săn',
  emoji: '🏹',
  team: 'villager',
  description: 'Khi chết, có thể bắn chết một người.',
  skills: ['shoot_on_death'],
  nightActions: [],
  minPlayers: 5,
  maxCount: 1,
  priority: 2,
});

registerRole('bodyguard', {
  name: 'Vệ sĩ',
  emoji: '🛡️',
  team: 'villager',
  description: 'Bảo vệ một người mỗi đêm. Nếu bị tấn công, vệ sĩ chết thay.',
  skills: ['guard'],
  nightActions: ['guard'],
  minPlayers: 6,
  maxCount: 1,
  priority: 4,
});

registerRole('mad_scientist', {
  name: 'Nhà khoa học điên',
  emoji: '🧪',
  team: 'neutral',
  description: 'Trung lập. Thắng nếu sống sót đến cuối game.',
  skills: [],
  nightActions: [],
  minPlayers: 7,
  maxCount: 1,
  priority: 1,
});

module.exports = {
  registerRole,
  getRole,
  getAllRoles,
  getRolesByTeam,
  getAvailableRoles,
  buildRoleList,
  assignRoles,
  shuffleArray,
  secureRandom,
};
