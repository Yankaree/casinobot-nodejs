// ═══════════════════════════════════════════
// COMMAND — /vay (vay tiền với lãi suất)
// ═══════════════════════════════════════════
// - /vay muon <amount>: vay coin, lãi 100% (dưới 100 triệu) hoặc 200% (từ 100 triệu)
// - /vay tra [amount]: trả nợ (bỏ trống = trả hết, có thể trả một phần)
// - /vay info: xem khoản vay hiện tại
// Mỗi người chỉ được có 1 khoản vay đang hoạt động tại một thời điểm.

const { SlashCommandBuilder } = require('discord.js');
const { UserModel, LoanModel, TransactionModel } = require('../database/models');
const config = require('../config');
const { formatCoins } = require('../utils/formatter');

function loanRate(amount) {
  return amount >= config.loan.tierBoundary ? config.loan.highRate : config.loan.lowRate;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vay')
    .setDescription('Vay coin với lãi suất (dưới 100M: 100%, từ 100M: 200%)')
    .addSubcommand((sub) =>
      sub
        .setName('muon')
        .setDescription('Vay coin — phải trả lại kèm lãi suất')
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription('Số coin muốn vay (tối đa ' + formatCoins(config.loan.maxLoan) + ')')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('tra')
        .setDescription('Trả nợ (bỏ trống = trả hết, có thể trả một phần)')
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription('Số coin trả')
            .setRequired(false)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) => sub.setName('info').setDescription('Xem khoản vay hiện tại')),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({
        content: '❌ Lệnh này chỉ dùng được trong server!',
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'muon') return this.handleBorrow(interaction);
    if (subcommand === 'tra') return this.handleRepay(interaction);
    return this.handleInfo(interaction);
  },

  // ── /vay muon ──
  async handleBorrow(interaction) {
    const amount = interaction.options.getInteger('amount');
    if (!amount || amount <= 0) {
      return interaction.reply({ content: '❌ **Lỗi**\nSố coin phải lớn hơn 0!', ephemeral: true });
    }
    if (amount > config.loan.maxLoan) {
      return interaction.reply({
        content: '❌ **Lỗi**\nSố coin tối đa mỗi lần vay là **' + formatCoins(config.loan.maxLoan) + '** 🪙!',
        ephemeral: true,
      });
    }

    const existing = await LoanModel.getActive(interaction.guildId, interaction.user.id);
    if (existing) {
      return interaction.reply({
        content:
          '❌ **Bạn đang còn nợ ' + formatCoins(existing.debt) + ' 🪙!**\n' +
          'Hãy trả nợ trước bằng /vay tra rồi mới vay tiếp.',
        ephemeral: true,
      });
    }

    const rate = loanRate(amount);
    const debt = Math.round(amount * (1 + rate));

    await UserModel.addCoins(interaction.guildId, interaction.user.id, amount);
    await LoanModel.create({
      guildId: interaction.guildId,
      discordId: interaction.user.id,
      amount,
      rate,
      debt,
    });
    await TransactionModel.record({
      guildId: interaction.guildId,
      discordId: interaction.user.id,
      amount,
      type: 'reward',
      game: 'loan',
    });

    const newBalance = await UserModel.getBalance(interaction.guildId, interaction.user.id);
    return interaction.reply({
      content:
        '✅ **Vay thành công!**\n' +
        '💰 Nhận: **' + formatCoins(amount) + '** 🪙\n' +
        '💸 Phải trả: **' + formatCoins(debt) + '** 🪙 (lãi **' + Math.round(rate * 100) + '%**)\n' +
        '💰 Số dư hiện tại: **' + formatCoins(newBalance) + '** 🪙\n' +
        '🕐 Trả bằng /vay tra bất cứ lúc nào.',
    });
  },

  // ── /vay tra ──
  async handleRepay(interaction) {
    const loan = await LoanModel.getActive(interaction.guildId, interaction.user.id);
    if (!loan) {
      return interaction.reply({
        content: '✅ Bạn không có khoản nợ nào!',
        ephemeral: true,
      });
    }

    const balance = await UserModel.getBalance(interaction.guildId, interaction.user.id);
    const amount = interaction.options.getInteger('amount') || loan.debt;
    const repayAmount = Math.min(amount, loan.debt);

    if (repayAmount <= 0) {
      return interaction.reply({ content: '❌ **Lỗi**\nSố coin trả phải lớn hơn 0!', ephemeral: true });
    }
    if (balance < repayAmount) {
      return interaction.reply({
        content:
          '❌ **Không đủ coin để trả nợ!**\n' +
          '💸 Nợ hiện tại: **' + formatCoins(loan.debt) + '** 🪙\n' +
          '💰 Số dư: **' + formatCoins(balance) + '** 🪙\n' +
          'Cần thêm **' + formatCoins(repayAmount - balance) + '** 🪙.',
        ephemeral: true,
      });
    }

    await UserModel.removeCoins(interaction.guildId, interaction.user.id, repayAmount);
    const result = await LoanModel.repay(interaction.guildId, interaction.user.id, repayAmount);
    await TransactionModel.record({
      guildId: interaction.guildId,
      discordId: interaction.user.id,
      amount: -repayAmount,
      type: 'reward',
      game: 'loan',
    });

    const newBalance = balance - repayAmount;
    if (result && result.fullyRepaid) {
      return interaction.reply({
        content:
          '✅ **Đã trả hết nợ!**\n' +
          '💸 Đã trả: **' + formatCoins(result.repaid) + '** 🪙\n' +
          '💰 Số dư còn lại: **' + formatCoins(newBalance) + '** 🪙',
      });
    }
    return interaction.reply({
      content:
        '✅ **Đã trả ' + formatCoins(repayAmount) + '** 🪙\n' +
        '💸 Còn nợ: **' + formatCoins(result ? result.remainingDebt : 0) + '** 🪙\n' +
        '💰 Số dư còn lại: **' + formatCoins(newBalance) + '** 🪙',
    });
  },

  // ── /vay info ──
  async handleInfo(interaction) {
    const loan = await LoanModel.getActive(interaction.guildId, interaction.user.id);
    if (!loan) {
      return interaction.reply({
        content:
          '✅ Bạn không có khoản vay nào.\n' +
          'Dùng /vay muon <số coin> để vay — dưới **' + formatCoins(config.loan.tierBoundary) + '**: lãi **100%**, từ đó trở lên: lãi **200%**.',
        ephemeral: true,
      });
    }
    return interaction.reply({
      content:
        '💸 **Khoản vay hiện tại**\n' +
        '💰 Đã vay: **' + formatCoins(loan.amount) + '** 🪙\n' +
        '📈 Lãi suất: **' + Math.round(loan.rate * 100) + '%**\n' +
        '💸 Còn phải trả: **' + formatCoins(loan.debt) + '** 🪙\n' +
        '🕐 Trả bằng /vay tra.',
      ephemeral: true,
    });
  },
};
