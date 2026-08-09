const cooldowns = new Map();

const COOLDOWN_MS = 5000;

function canSend(userId) {
  const lastTime = cooldowns.get(userId);
  if (!lastTime) return true;
  return Date.now() - lastTime >= COOLDOWN_MS;
}

function setCooldown(userId) {
  cooldowns.set(userId, Date.now());
}

function cleanup() {
  const now = Date.now();
  for (const [userId, timestamp] of cooldowns) {
    if (now - timestamp > COOLDOWN_MS * 2) {
      cooldowns.delete(userId);
    }
  }
}

setInterval(cleanup, 60_000);

module.exports = { canSend, setCooldown };
