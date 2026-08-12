// ═══════════════════════════════════════════
// CARD GAMES — entry point
// ═══════════════════════════════════════════

module.exports = {
  engine: require('./engine'),
  rules: require('./rules/registry'),
  config: require('./config'),
  LobbyManager: require('./lobby/manager').LobbyManager,
  CardSession: require('./session').CardSession,
};
