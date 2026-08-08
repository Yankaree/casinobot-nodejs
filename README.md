# 🎲 Discord Tài Xỉu Bot

Mini game Tài Xỉu với coin ảo trên Discord.

## Tính năng

- 🎲 Game Tài Xỉu tự động chạy
- 💰 Hệ thống coin ảo
- 💎 Nổ hũ (Jackpot) khi xúc xắc 1-1-1 hoặc 6-6-6
- 📊 Thống kê lịch sử
- 🔒 Admin commands

## Cài đặt

```bash
npm install
```

## Cấu hình

Copy `.env.example` thành `.env` và điền thông tin:

```bash
cp .env.example .env
```

```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_client_id_here
```

## Đăng ký commands

```bash
npm run start
```

Sau đó copy nội dung `deploy-commands.js` và chạy:

```bash
node deploy-commands.js
```

## Commands

### Player Commands

| Command | Mô tả |
|---------|-------|
| `/help` | Xem danh sách lệnh và hướng dẫn |
| `/balance` | Xem số dư coin |
| `/work` | Đi làm kiếm coin (cooldown 90 giây) |
| `/bet tai <amount>` | Đặt cược Tài |
| `/bet xiu <amount>` | Đặt cược Xỉu |
| `/jackpot` | Xem jackpot hiện tại |

### Admin Commands

| Command | Mô tả |
|---------|-------|
| `/taixiu setchannel #channel` | Đặt kênh Tài Xỉu |
| `/taixiu start` | Bắt đầu game |
| `/taixiu stop` | Dừng game |
| `/taixiu stats` | Xem thống kê |
| `/admin givecoin @user <amount>` | Tặng coin |
| `/admin resetjackpot` | Reset jackpot |

## Luật chơi

- Mỗi phiên 50 giây
- 3 xúc xắc: 4-10 = Xỉu, 11-17 = Tài
- Thắng: nhận 120% tiền cược
- Nổ hũ (1-1-1 hoặc 6-6-6): nhận 140% tiền cược
- 5% tổng cược mỗi phiên được cộng vào jackpot
- Random vật lý: streak 2-3 tự nhiên, streak 5+ rất hiếm

## Tài liệu kỹ thuật

- [Architecture](docs/ARCHITECTURE.md) — Tổng quan hệ thống & luồng chạy
- [Modules](docs/MODULES.md) — Chi tiết từng module
- [Database](docs/DATABASE.md) — Schema và mô hình dữ liệu
- [Commands](docs/COMMANDS.md) — Tham chiếu lệnh

## Cấu trúc thư mục

```
src/
├── index.js          # Entry point
├── config.js         # Configuration
├── commands/         # Discord commands
├── games/taixiu/     # Game logic
├── database/         # SQLite database
└── utils/            # Utilities
```
