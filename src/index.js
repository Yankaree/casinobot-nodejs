require('dotenv').config();
const { Client, Collection, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { connectDb, closeDb } = require('./database/database');
const { createServer } = require('./server');
const { setupDiscordLogHook } = require('./utils/discordLogHook');

setupDiscordLogHook();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

const commandData = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commandData.push(command.data.toJSON());
    }
  } catch (error) {
    console.error(`Error loading command ${file}:`, error);
  }
}

async function registerCommands() {
  if (!config.token || !config.clientId) {
    console.warn('[Deploy] Missing DISCORD_TOKEN or CLIENT_ID, skipping command registration');
    return;
  }
  try {
    const rest = new REST({ version: '10' }).setToken(config.token);
    const data = await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commandData }
    );
    console.log(`[Deploy] Registered ${data.length} commands`);
  } catch (err) {
    console.error('[Deploy] Failed to register commands:', err.message);
  }
}

client.once('ready', async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  console.log(`📌 Serving ${client.guilds.cache.size} guild(s)`);
  try {
    const { setupGlobalChatListener } = require('./games/global-taixiu/chat/listener');
    await setupGlobalChatListener(client);
  } catch (err) {
    console.error('[Ready] setupGlobalChatListener failed:', err.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    const reply = {
      content: '❌ **Lỗi hệ thống**\nĐã xảy ra lỗi không mong muốn. Vui lòng thử lại!',
      ephemeral: true,
    };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (e) {
      // ignore
    }
  }
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await closeDb();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down...');
  await closeDb();
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  if (error?.errorCode === 'ERR_CONNECTION_ENDED' || error?.errorCode === 'ERR_CONNECTION_NOT_ESTABLISHED') {
    return;
  }
  console.error('Unhandled promise rejection:', error);
});

createServer(client);

client.login(config.token).then(() => {
  registerCommands();
  connectDb().then(() => {
    console.log('[Bot] Database connected');
  }).catch((err) => {
    console.error('[Bot] Database connection failed:', err.message);
  });
}).catch((err) => {
  console.error(`[Bot] Login failed: ${err.message}. Retrying in 30s...`);
  setTimeout(() => {
    client.login(config.token).catch(() => {});
    registerCommands();
    connectDb().catch(() => {});
  }, 30_000);
});
