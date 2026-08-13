// ═══════════════════════════════════════════
// UI — Discord components (button / select menu)
// ═══════════════════════════════════════════
// Custom ID format: card:<action>:<id>[:payload]

const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} = require('discord.js');

// ── Lobby ──
function lobbyButtons(lobbyId) {
  const join = new ButtonBuilder()
    .setCustomId(`card:join:${lobbyId}`)
    .setLabel('Tham gia')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🚪');

  const leave = new ButtonBuilder()
    .setCustomId(`card:leave:${lobbyId}`)
    .setLabel('Rời phòng')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🚪');

  const start = new ButtonBuilder()
    .setCustomId(`card:start:${lobbyId}`)
    .setLabel('Bắt đầu')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('▶️');

  return [new ActionRowBuilder().addComponents(join, leave, start)];
}

// Khóa toàn bộ component (hỗ trợ cả button lẫn select menu)
function disabledRows(rows) {
  return rows.map((row) => {
    const newRow = new ActionRowBuilder();
    for (const comp of row.components) {
      const cloned =
        comp.type === ComponentType.Button
          ? ButtonBuilder.from(comp)
          : StringSelectMenuBuilder.from(comp);
      newRow.addComponents(cloned.setDisabled(true));
    }
    return newRow;
  });
}

// ── Báo Sâm / Bắt Sâm ──
function baoSamButtons(sessionId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`card:sam:${sessionId}`)
        .setLabel('Báo Sâm')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔔')
    ),
  ];
}

function catchSamButtons(sessionId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`card:catch:${sessionId}`)
        .setLabel('Bắt Sâm')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚔️')
    ),
  ];
}

// ── Lượt chơi (DM) ──
// Select chọn bài (tối đa 25 lựa chọn; Tiến Lên 13 lá, Sâm 10 lá)
function handSelect(sessionId, hand) {
  const options = hand.map((card) => ({
    label: `${card.symbol}${card.rankLabel}`,
    value: card.id,
    description: `${card.suitName} ${card.rankLabel}`,
    emoji: card.color === 'red' ? '🔴' : '⚫',
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`card:select:${sessionId}`)
    .setPlaceholder('Chọn lá bài để đánh...')
    .setMinValues(1)
    .setMaxValues(Math.min(hand.length, 25))
    .addOptions(options);

  return select;
}

// Hàng nút xác nhận sau khi đã chọn bài
function confirmRows(sessionId, cardIds, passAllowed) {
  const play = new ButtonBuilder()
    .setCustomId(`card:play:${sessionId}:${cardIds.join(',')}`)
    .setLabel('✅ Đánh bài')
    .setStyle(ButtonStyle.Success);

  const reselect = new ButtonBuilder()
    .setCustomId(`card:reselect:${sessionId}`)
    .setLabel('↩️ Chọn lại')
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(play, reselect);

  const rows = [row1];
  if (passAllowed) {
    const pass = new ButtonBuilder()
      .setCustomId(`card:pass:${sessionId}`)
      .setLabel('🙅 Bỏ lượt')
      .setStyle(ButtonStyle.Danger);
    rows.push(new ActionRowBuilder().addComponents(pass));
  }
  return rows;
}

// Nút bỏ lượt riêng (hàng đầu tiên, kèm select)
function passRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`card:pass:${sessionId}`)
      .setLabel('🙅 Bỏ lượt')
      .setStyle(ButtonStyle.Danger)
  );
}

module.exports = {
  lobbyButtons,
  disabledRows,
  baoSamButtons,
  catchSamButtons,
  handSelect,
  confirmRows,
  passRow,
};
