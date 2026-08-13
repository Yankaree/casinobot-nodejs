require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// --check: chỉ báo cáo sự khác biệt giữa code và Discord, KHÔNG đăng ký lại.
const CHECK_ONLY = process.argv.includes('--check');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command) {
    commands.push(command.data.toJSON());
  }
}

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('❌ Thiếu DISCORD_TOKEN hoặc CLIENT_ID trong .env!');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    // 1. Lấy danh sách lệnh đang có trên Discord (global commands)
    let current = [];
    try {
      current = await rest.get(Routes.applicationCommands(clientId));
    } catch (err) {
      console.error('❌ Không lấy được danh sách lệnh trên Discord:', err.message);
      console.error('   Kiểm tra DISCORD_TOKEN / CLIENT_ID có đúng không.');
      process.exit(1);
    }

    const currentNames = current.map((c) => c.name);
    const localNames = commands.map((c) => c.name);

    const missing = commands.filter((c) => !currentNames.includes(c.name)); // trong code, chưa có trên Discord
    const removed = current.filter((c) => !localNames.includes(c.name));    // trên Discord, không còn trong code

    console.log('═══════════════════════════════════════════');
    console.log(`📋 Code có      : ${commands.length} lệnh`);
    console.log(`🌐 Discord có   : ${current.length} lệnh`);
    console.log('───────────────────────────────────────────');
    console.log(`📦 Lệnh trong code: ${localNames.sort().join(', ')}`);
    if (current.length) {
      console.log(`☁️  Lệnh trên Discord: ${currentNames.sort().join(', ')}`);
    }

    if (missing.length) {
      console.log('\n🆕 Lệnh CHƯA đăng ký trên Discord:');
      missing.forEach((c) => console.log(`   • /${c.name}`));
    }
    if (removed.length) {
      console.log('\n🗑️ Lệnh có trên Discord nhưng không còn trong code:');
      removed.forEach((c) => console.log(`   • /${c.name}`));
    }
    if (!missing.length && !removed.length) {
      console.log('\n✅ Mọi lệnh trong code đã được đăng ký trên Discord.');
    }
    console.log('═══════════════════════════════════════════');

    if (CHECK_ONLY) {
      console.log('ℹ️  Chế độ --check: chỉ báo cáo, chưa đăng ký gì. Chạy lại KHÔNG có --check để đăng ký.');
      process.exit(0);
    }

    if (!missing.length && !removed.length) {
      process.exit(0);
    }

    // 2. Đăng ký lại toàn bộ danh sách (PUT thay thế toàn bộ — đảm bảo khớp với code)
    console.log(`🔄 Đang đăng ký ${commands.length} lệnh...`);
    const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Đã đăng ký ${data.length} lệnh thành công.`);
    if (missing.length) {
      console.log(`   ➕ Đã thêm: ${missing.map((c) => '/' + c.name).join(', ')}`);
    }
    if (removed.length) {
      console.log(`   ➖ Đã xóa: ${removed.map((c) => '/' + c.name).join(', ')}`);
    }
    console.log('⚠️  Lệnh global có thể mất tới 1 giờ để hiện ở server (thường chỉ vài phút).');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi đăng ký lệnh:', error.message);
    process.exit(1);
  }
})();
