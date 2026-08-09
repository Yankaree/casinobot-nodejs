const { GlobalTaixiuChannelModel } = require('../../../database/models');
const { canSend, setCooldown } = require('./cooldown');
const { broadcastMessage } = require('./relay');

const KNOWN_BOT_COMMANDS = new Set([
  'bet', 'taixiu', 'baucua', 'help', 'ping', 'work',
  'balance', 'admin', 'shutdown', 'jackpot', 'globaltaixiu',
]);

function isCommand(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith('/')) return true;
  if (trimmed.startsWith('!') || trimmed.startsWith('?') || trimmed.startsWith('.')) return true;
  return false;
}

function isKnownCommand(content) {
  const trimmed = content.trim().toLowerCase();
  const commandName = trimmed.startsWith('/')
    ? trimmed.slice(1).split(/\s+/)[0]
    : trimmed.startsWith('!') || trimmed.startsWith('?') || trimmed.startsWith('.')
      ? trimmed.slice(1).split(/\s+/)[0]
      : null;
  return commandName && KNOWN_BOT_COMMANDS.has(commandName);
}

async function setupGlobalChatListener(client) {
  const channels = await GlobalTaixiuChannelModel.getAllChannelIds();
  const registeredChannels = new Set(channels);

  console.log(`[GlobalChat] Listening on ${registeredChannels.size} channel(s)`);

  GlobalTaixiuChannelModel._cache = registeredChannels;

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.webhookId) return;
    if (message.author.system) return;

    if (!GlobalTaixiuChannelModel._cache.has(message.channelId)) return;

    if (isCommand(message.content)) return;
    if (isKnownCommand(message.content)) return;

    if (!canSend(message.author.id)) return;

    setCooldown(message.author.id);

    try {
      await broadcastMessage(client, message, message.channelId);
    } catch (err) {
      console.error('[GlobalChat] Broadcast error:', err.message);
    }
  });
}

async function refreshRegisteredChannels() {
  const channels = await GlobalTaixiuChannelModel.getAllChannelIds();
  const cache = GlobalTaixiuChannelModel._cache;
  if (cache) {
    cache.clear();
    for (const ch of channels) {
      cache.add(ch);
    }
  }
  console.log(`[GlobalChat] Refreshed: ${cache ? cache.size : channels.length} channel(s)`);
  return cache;
}

module.exports = { setupGlobalChatListener, refreshRegisteredChannels };
