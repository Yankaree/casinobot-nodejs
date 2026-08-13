// ═══════════════════════════════════════════
// BET CONFIRM — UI xác nhận đặt cược dùng chung
// ═══════════════════════════════════════════
// Dùng cho: /bet (Tài Xỉu), /baucua bet + modal, /globaltaixiu bet.
//
// Flow: người chơi nhập lựa chọn + số tiền → bot hiện embed
//   "Bạn có chắc chắn muốn đặt X 🪙 vào Y?" kèm nút [✅ Xác nhận] [❌ Hủy]
// → bấm Xác nhận mới thực sự đặt cược; hết 30 giây tự hủy.
//
// Custom ID: confirm:<prefix>:<userId>:yes|no

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { formatCoins } = require('./formatter');

const CONFIRM_TIMEOUT_MS = 30_000;

// userId -> { prefix, guildId, message, timer, onConfirm, onCancel }
const pendingByUser = new Map();

function clearPendingFor(userId) {
  const p = pendingByUser.get(userId);
  if (p) {
    clearTimeout(p.timer);
    pendingByUser.delete(userId);
  }
}

// Hủy lời xác nhận cũ của người chơi (nếu có) trước khi tạo lời mới
async function expireOldPending(userId) {
  const old = pendingByUser.get(userId);
  if (!old) return;
  clearPendingFor(userId);
  try {
    await old.message.edit({
      content: '⏳ Lời xác nhận trước đã hết hạn.',
      embeds: [],
      components: [],
    });
  } catch {
    // tin nhắn đã bị xóa — bỏ qua
  }
}

/**
 * Hiện UI xác nhận trên interaction (phản hồi ephemeral).
 * @param {Interaction} interaction — slash command hoặc modal submit (chưa trả lời)
 * @param {object} opts
 *   prefix:      'tx' | 'bc' | 'gtx'
 *   emoji:       emoji tiêu đề (vd '🎲')
 *   choiceLabel: nhãn lựa chọn (vd '📈 TÀI')
 *   amount:      số coin muốn đặt
 *   note:        dòng ghi chú thêm (tùy chọn)
 *   onConfirm:   async (interaction) => {} — chạy khi bấm Xác nhận (đặt cược thật)
 *   onCancel:    async (interaction) => {} — chạy khi bấm Hủy (tùy chọn)
 */
async function showConfirmation(interaction, { prefix, emoji, choiceLabel, amount, note, onConfirm, onCancel }) {
  await expireOldPending(interaction.user.id);
  await interaction.deferReply({ ephemeral: true });

  const uid = interaction.user.id;
  const embed = new EmbedBuilder()
    .setTitle(`${emoji || '🤔'} Xác nhận đặt cược`)
    .setDescription(
      `**Bạn có chắc chắn muốn đặt ${formatCoins(amount)} 🪙 vào ${choiceLabel}?**` +
      (note ? `\n${note}` : '') +
      `\n\n⏳ Lời xác nhận hết hạn sau ${CONFIRM_TIMEOUT_MS / 1000} giây.`
    )
    .setColor(config.colors.info);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm:${prefix}:${uid}:yes`)
      .setLabel('✅ Xác nhận')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`confirm:${prefix}:${uid}:no`)
      .setLabel('❌ Hủy')
      .setStyle(ButtonStyle.Danger)
  );

  const message = await interaction.editReply({ embeds: [embed], components: [row] });

  const timer = setTimeout(async () => {
    const cur = pendingByUser.get(uid);
    if (cur && cur.message === message) {
      clearPendingFor(uid);
      try {
        await message.edit({
          content: '⏳ Hết thời gian xác nhận — đã hủy đặt cược.',
          embeds: [],
          components: [],
        });
      } catch {
        // bỏ qua
      }
    }
  }, CONFIRM_TIMEOUT_MS);

  pendingByUser.set(uid, { prefix, guildId: interaction.guildId, message, timer, onConfirm, onCancel });
}

/**
 * Xử lý khi bấm nút Xác nhận/Hủy (route từ src/index.js theo prefix).
 */
async function handleConfirmationClick(interaction, prefix) {
  const parts = interaction.customId.split(':');
  const uid = parts[2];
  const action = parts[3];

  if (interaction.user.id !== uid) {
    return interaction.reply({ content: '❌ Nút này không phải của bạn!', ephemeral: true });
  }

  const pending = pendingByUser.get(uid);
  if (!pending || pending.prefix !== prefix || pending.guildId !== interaction.guildId) {
    return interaction.reply({
      content: '❌ Lời xác nhận đã hết hạn — hãy đặt cược lại!',
      ephemeral: true,
    });
  }

  clearPendingFor(uid);

  // Khóa nút ngay (chống bấm đúp / bấm lại)
  try {
    await interaction.update({ components: [] });
  } catch (err) {
    console.error('[BetConfirm] update:', err.message);
  }

  if (action === 'no') {
    if (pending.onCancel) return pending.onCancel(interaction);
    return interaction.followUp({ content: '❌ Đã hủy đặt cược.', ephemeral: true });
  }

  if (action === 'yes' && pending.onConfirm) {
    return pending.onConfirm(interaction);
  }

  return interaction.followUp({ content: '❌ Lời xác nhận không hợp lệ.', ephemeral: true });
}

module.exports = { showConfirmation, handleConfirmationClick, clearPendingFor, CONFIRM_TIMEOUT_MS };
