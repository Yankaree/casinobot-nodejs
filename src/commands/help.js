const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Xem danh sách lệnh và hướng dẫn'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('📖 HƯỚNG DẪN SỬ DỤNG')
      .setDescription('Danh sách tất cả lệnh của bot')
      .addFields(
        {
          name: '🎲 TÀI XỈU',
          value: [
            '`/bet tai <số coin>` - Đặt cược Tài',
            '`/bet xiu <số coin>` - Đặt cược Xỉu',
            '`/taixiu stats` - Xem thống kê game',
            '`/jackpot` - Xem jackpot hiện tại',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🦀 BẦU CUA',
          value: [
            '`/baucua bet <biểu tượng> <số coin>` - Đặt cược',
            '`/baucua stats` - Xem thống kê game',
            '`/baucua jackpot` - Xem hũ Bầu Cua',
            'Biểu tượng: 🥣 Bầu, 🦀 Cua, 🦐 Tôm, 🐟 Cá, 🐓 Gà, 🦌 Nai',
            '3 xúc xắc giống nhau → Nổ hũ!',
          ].join('\n'),
          inline: false,
        },
        {
          name: '👤 NGƯỜI CHƠI',
          value: [
            '`/balance` - Xem số dư và profile',
            '`/balance @user` - Xem profile người khác',
            '`/work` - Đi làm kiếm coin (90s cooldown)',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🔧 ADMIN',
          value: [
            '`/taixiu setchannel <kênh>` - Đặt kênh Tài Xỉu',
            '`/taixiu start` - Bắt đầu game Tài Xỉu',
            '`/taixiu stop` - Dừng game Tài Xỉu',
            '`/baucua setchannel <kênh>` - Đặt kênh Bầu Cua',
            '`/baucua start` - Bắt đầu game Bầu Cua',
            '`/baucua stop` - Dừng game Bầu Cua',
            '`/admin givecoin <@user> <số coin>` - Tặng coin',
            '`/admin resetjackpot` - Reset jackpot',
            '`/shutdown` - Tắt bot',
          ].join('\n'),
          inline: false,
        },
        {
          name: '📊 QUY TẮC',
          value: [
            '**Tài Xỉu:**',
            '• Xúc xắc 3 hạt, tổng 4-10 = **Xỉu**, 11-17 = **Tài**',
            '• Jackpot (111 hoặc 666): thưởng **+40%**',
            '• Thắng cược: nhận **1.2x** số coin đặt',
            '',
            '**Bầu Cua:**',
            '• 3 xúc xắc, mỗi xúc xắc 1 trong 6 biểu tượng',
            '• Cược đúng 1 lần = **1.2x**, 2 lần = **2.4x**, 3 lần = **3.6x**',
            '• 3 xúc xắc giống nhau → Nổ hũ, chia jackpot',
            '',
            `• Coin khởi đầu: **${config.game.startingCoins.toLocaleString('vi-VN')}** 🪙`,
          ].join('\n'),
          inline: false,
        }
      )
      .setColor(config.colors.info)
      .setFooter({ text: 'Tài Xỉu Bot | Nhập lệnh bằng /' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
