const https = require('https');

let webhookUrl = null;
const queue = [];
let sending = false;

async function sendToWebhook(text) {
  if (!webhookUrl || !text) return;

  const truncated = text.length > 1900 ? text.substring(0, 1900) + '...' : text;

  queue.push(truncated);
  if (sending) return;
  sending = true;

  while (queue.length > 0) {
    const msg = queue.shift();
    try {
      const url = new URL(webhookUrl);
      const data = JSON.stringify({ content: `\`\`\`\n${msg}\n\`\`\`` });

      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
          timeout: 10000,
        }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            if (res.statusCode === 429) {
              const retry = JSON.parse(body).retry_after || 5;
              setTimeout(() => { queue.unshift(msg); resolve(); }, retry * 1000);
            } else {
              resolve();
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(data);
        req.end();
      });

      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      // skip error
    }
  }
  sending = false;
}

function setupDiscordLogHook() {
  webhookUrl = process.env.DISCORD_LOG_WEBHOOK;
  if (!webhookUrl) return;

  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  console.log = (...args) => {
    origLog.apply(console, args);
    sendToWebhook(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
  };

  console.error = (...args) => {
    origError.apply(console, args);
    sendToWebhook('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
  };

  console.warn = (...args) => {
    origWarn.apply(console, args);
    sendToWebhook('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
  };

  console.log('🔗 Discord log hook active');
}

module.exports = { setupDiscordLogHook };
