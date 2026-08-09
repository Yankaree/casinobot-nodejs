const { EmbedBuilder } = require('discord.js');
const { GlobalTaixiuChannelModel } = require('../../../database/models');
const config = require('../../../config');

function getDisplayName(message) {
  const member = message.member;
  if (member?.nickname) return member.nickname;
  if (member?.displayName) return member.displayName;
  if (message.author.displayName) return message.author.displayName;
  if (message.author.globalName) return message.author.globalName;
  return message.author.username;
}

async function broadcastMessage(client, message, sourceChannelId) {
  const channelIds = await GlobalTaixiuChannelModel.getAllChannelIds();

  if (channelIds.length === 0) return;

  const displayName = getDisplayName(message);
  const avatarURL = message.author.displayAvatarURL({ size: 128, extension: 'png' });

  const embed = new EmbedBuilder()
    .setAuthor({
      name: displayName,
      iconURL: avatarURL,
    })
    .setDescription(message.content)
    .setColor(config.colors.primary)
    .setTimestamp(new Date());

  const targetChannelIds = channelIds.filter((id) => id !== sourceChannelId);

  for (const channelId of targetChannelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error(`[GlobalChat] Failed to relay to channel ${channelId}:`, err.message);
    }
  }
}

module.exports = { broadcastMessage, getDisplayName };
