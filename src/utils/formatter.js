function formatCoins(amount) {
  return amount.toLocaleString('vi-VN');
}

function formatDice(d1, d2, d3) {
  const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  return `${diceEmojis[d1 - 1]} ${diceEmojis[d2 - 1]} ${diceEmojis[d3 - 1]}`;
}

function formatProgressBar(current, total, length = 10) {
  const filled = Math.round((current / total) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatTime(seconds) {
  if (seconds <= 0) return '0 giây';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins} phút ${secs} giây`;
  return `${secs} giây`;
}

function getResultEmoji(result) {
  return result === 'tai' ? '📈' : '📉';
}

function getResultText(result) {
  return result === 'tai' ? 'TÀI' : 'XỈU';
}

module.exports = {
  formatCoins,
  formatDice,
  formatProgressBar,
  formatTime,
  getResultEmoji,
  getResultText,
};
