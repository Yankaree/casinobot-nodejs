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

    // Tránh PUT toàn bộ lệnh mỗi lần boot: Discord giới hạn số lần cập nhật
    // global command (429 nếu vượt) — restart nhiều lần có thể khiến việc
    // đăng ký thất bại và danh sách lệnh cũ (thiếu /transfer, /vay...) bị giữ nguyên.
    // Chỉ PUT khi danh sách thực sự khác biệt.
    let current = [];
    try {
      current = await rest.get(Routes.applicationCommands(config.clientId));
    } catch (err) {
      console.warn('[Deploy] Không lấy được danh sách lệnh trên Discord, thử PUT trực tiếp:', err.message);
    }

    const currentNames = current.map((c) => c.name);
    const localNames = commandData.map((c) => c.name);
    const missing = commandData.filter((c) => !currentNames.includes(c.name)).length;
    const removed = current.filter((c) => !localNames.includes(c.name)).length;

    if (current.length > 0 && missing === 0 && removed === 0) {
      console.log(`[Deploy] ${current.length} lệnh đã đồng bộ với Discord, không cần đăng ký lại.`);
      return;
    }

    console.log(`[Deploy] Đăng ký ${commandData.length} lệnh (thêm ${missing}, xóa ${removed})...`);
    const data = await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commandData }
    );
    console.log(`[Deploy] Registered ${data.length} commands successfully`);
  } catch (err) {
    console.error('[Deploy] Failed to register commands:', err.message);
  }
}

client.once('ready', async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  console.log(`📌 Serving ${client.guilds.cache.size} guild(s)`);

  // Auto-register commands on every boot
  await registerCommands();

  try {
    const { setupGlobalChatListener } = require('./games/global-taixiu/chat/listener');
    await setupGlobalChatListener(client);
  } catch (err) {
    console.error('[Ready] setupGlobalChatListener failed:', err.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  // Handle button interactions
  if (interaction.isButton()) {
    try {
      const customId = interaction.customId;

      // Card game buttons (Tiến Lên / Sâm Lốc)
      if (customId.startsWith('card:')) {
        const cardCmd = client.commands.get('card');
        if (cardCmd && cardCmd.handleButton) {
          await cardCmd.handleButton(interaction);
        }
        return;
      }

      // Nút xác nhận đặt cược Tài Xỉu (/bet + modal)
      if (customId.startsWith('confirm:tx:')) {
        const betCmd = client.commands.get('bet');
        if (betCmd && betCmd.handleButton) {
          await betCmd.handleButton(interaction);
        }
        return;
      }

      // Nút xác nhận đặt cược Bầu Cua
      if (customId.startsWith('confirm:bc:')) {
        const baucuaCmd = client.commands.get('baucua');
        if (baucuaCmd && baucuaCmd.handleButton) {
          await baucuaCmd.handleButton(interaction);
        }
        return;
      }

      // Nút xác nhận đặt cược Tài Xỉu Global
      if (customId.startsWith('confirm:gtx:')) {
        const gtxCmd = client.commands.get('globaltaixiu');
        if (gtxCmd && gtxCmd.handleButton) {
          await gtxCmd.handleButton(interaction);
        }
        return;
      }

      // Tai Xiu button
      if (customId.startsWith('taixiu_bet_')) {
        const taixiuCmd = client.commands.get('taixiu');
        if (taixiuCmd && taixiuCmd.handleButton) {
          await taixiuCmd.handleButton(interaction);
        }
        return;
      }

      // Bau Cua button
      if (customId.startsWith('baucua_select_')) {
        const baucuaCmd = client.commands.get('baucua');
        if (baucuaCmd && baucuaCmd.handleButton) {
          await baucuaCmd.handleButton(interaction);
        }
        return;
      }
    } catch (error) {
      console.error('Button interaction error:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Lỗi hệ thống!', ephemeral: true });
        }
      } catch (e) {}
    }
    return;
  }

  // Handle message component interactions (select menus)
  if (interaction.isStringSelectMenu()) {
    try {
      const customId = interaction.customId;

      // Card game select menu (chọn bài)
      if (customId.startsWith('card:')) {
        const cardCmd = client.commands.get('card');
        if (cardCmd && cardCmd.handleSelectMenu) {
          await cardCmd.handleSelectMenu(interaction);
        }
        return;
      }

      if (customId.startsWith('baucua_select_')) {
        const baucuaCmd = client.commands.get('baucua');
        if (baucuaCmd && baucuaCmd.handleSelectMenu) {
          await baucuaCmd.handleSelectMenu(interaction);
        }
        return;
      }
    } catch (error) {
      console.error('Select menu interaction error:', error);
    }
    return;
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    try {
      const customId = interaction.customId;

      // Card game modal (dự phòng mở rộng)
      if (customId.startsWith('card:')) {
        const cardCmd = client.commands.get('card');
        if (cardCmd && cardCmd.handleModal) {
          await cardCmd.handleModal(interaction);
        }
        return;
      }

      if (customId.startsWith('taixiu_modal_')) {
        const taixiuCmd = client.commands.get('taixiu');
        if (taixiuCmd && taixiuCmd.handleModal) {
          await taixiuCmd.handleModal(interaction);
        }
        return;
      }

      if (customId.startsWith('baucua_modal_')) {
        const baucuaCmd = client.commands.get('baucua');
        if (baucuaCmd && baucuaCmd.handleModal) {
          await baucuaCmd.handleModal(interaction);
        }
        return;
      }
    } catch (error) {
      console.error('Modal submission error:', error);
    }
    return;
  }

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

// Connect DB first, then login
async function startBot() {
  try {
    await connectDb();
    console.log('[Bot] Database connected');
  } catch (err) {
    console.error('[Bot] Database connection failed:', err.message);
    console.error('[Bot] Bot will start but DB features may not work');
  }

  // Reset hũ hằng ngày lúc 7:00 (GMT+7)
  try {
    const { startJackpotResetScheduler } = require('./utils/jackpotScheduler');
    startJackpotResetScheduler();
  } catch (err) {
    console.error('[Bot] Không khởi động được scheduler reset hũ:', err.message);
  }

  const MAX_LOGIN_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt++) {
    try {
      await client.login(config.token);
      // Login successful, ready event will handle the rest
      return;
    } catch (err) {
      console.error(`[Bot] Login attempt ${attempt}/${MAX_LOGIN_ATTEMPTS} failed: ${err.message}`);
      if (attempt < MAX_LOGIN_ATTEMPTS) {
        const delay = 5000 * attempt;
        console.log(`[Bot] Retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  console.error('[Bot] Failed to login after max attempts. Exiting.');
  process.exit(1);
}

startBot();
