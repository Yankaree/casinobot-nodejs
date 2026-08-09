const http = require('http');
const config = require('./config');

function createServer(client) {
  const server = http.createServer((req, res) => {
    if (req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('pong');
    }

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const botStatus = client && client.user ? 'Online' : 'Starting...';
    const botTag = client && client.user ? client.user.tag : 'N/A';
    const guildCount = client && client.guilds ? client.guilds.cache.size : 0;

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tai Xiu Bot - Status</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      padding: 40px;
      max-width: 500px;
      width: 90%;
      text-align: center;
    }
    .dice { font-size: 60px; margin-bottom: 10px; }
    h1 { font-size: 28px; margin-bottom: 5px; }
    .subtitle { color: #aaa; margin-bottom: 30px; }
    .status-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 30px;
    }
    .status-card {
      background: rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 20px 15px;
    }
    .status-card .label { font-size: 12px; color: #aaa; text-transform: uppercase; }
    .status-card .value { font-size: 24px; font-weight: bold; margin-top: 5px; }
    .online { color: #00ff88; }
    .gold { color: #ffd700; }
    .ping-section {
      background: rgba(0,255,136,0.1);
      border: 1px solid rgba(0,255,136,0.3);
      border-radius: 12px;
      padding: 15px;
    }
    .ping-section h3 { color: #00ff88; margin-bottom: 5px; }
    .ping-section p { color: #aaa; font-size: 14px; }
    .footer { margin-top: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="dice">🎲</div>
    <h1>Tài Xỉu Bot</h1>
    <p class="subtitle">Discord Mini Game</p>

    <div class="status-grid">
      <div class="status-card">
        <div class="label">Bot Status</div>
        <div class="value ${botStatus === 'Online' ? 'online' : ''}">${botStatus}</div>
      </div>
      <div class="status-card">
        <div class="label">Servers</div>
        <div class="value gold">${guildCount}</div>
      </div>
      <div class="status-card">
        <div class="label">Bot Tag</div>
        <div class="value" style="font-size:16px">${botTag}</div>
      </div>
      <div class="status-card">
        <div class="label">Uptime</div>
        <div class="value gold">${hours}h ${minutes}m ${seconds}s</div>
      </div>
    </div>

    <div class="ping-section">
      <h3>Keep Alive</h3>
      <p>Ping endpoint: <code>/ping</code></p>
      <p>Sử dụng UptimeRobot hoặc service tương tự để ping liên tục</p>
    </div>

    <div class="footer">Tai Xiu Bot &copy; 2026 | Powered by SQLite Cloud</div>
  </div>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
  });

  if (process.env.RENDER_URL) {
    setInterval(() => {
      http.get(process.env.RENDER_URL, (res) => {
        console.log(`[KeepAlive] Ping: ${res.statusCode}`);
      }).on('error', () => {});
    }, 5 * 60 * 1000);
  }

  return server;
}

module.exports = { createServer };
