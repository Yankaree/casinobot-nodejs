const config = require('../config');

const cache = new Map();

function getKey(namespace, id) {
  return `${namespace}:${id || ''}`;
}

function get(namespace, id) {
  const key = getKey(namespace, id);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function set(namespace, id, data) {
  const key = getKey(namespace, id);
  cache.set(key, { data, expiresAt: Date.now() + config.leaderboard.cacheTtlMs });
}

function invalidateServer(guildId) {
  cache.delete(getKey('serverTop', guildId));
}

function invalidateGlobal() {
  cache.delete(getKey('globalTop'));
}

module.exports = { get, set, invalidateServer, invalidateGlobal };
