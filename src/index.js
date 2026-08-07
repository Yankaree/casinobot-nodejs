require('dotenv').config();
const { Client, Collection, GatewayIntentBits } = require('discord.js');
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
  ],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    }
  } catch (error) {
    console.error(`Error loading command ${file}:`, error);
  }
}

client.once('ready', () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  console.log(`📌 Serving ${client.guilds.cache.size} guild(s)`);
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
      console.error('Error sending error reply:', e);
    }
  }
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await closeDb();
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

(async () => {
  try {
    await connectDb();
    createServer(client);
    await client.login(config.token);
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
})();
