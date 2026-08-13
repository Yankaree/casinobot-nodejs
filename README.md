# Discord Tài Xỉu & Bầu Cua Bot

Mini game Tài Xỉu và Bầu Cua với coin ảo trên Discord.

## Tính năng

- 🎲 Game Tài Xỉu tự động chạy
- 🦀 Game Bầu Cua tự động chạy (6 biểu tượng)
- 💰 Hệ thống coin ảo chung
- ⚡ Trả thưởng trực tiếp, không có hũ (jackpot)
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
SQLITECLOUD_URI=your_sqlitecloud_uri_here
```

## Đăng ký commands

```bash
node deploy-commands.js
```

## Chạy bot

```bash
npm start
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
| `/baucua bet <biểu tượng> <amount>` | Đặt cược Bầu Cua |
| `/baucua stats` | Xem thống kê Bầu Cua |

### Admin Commands

| Command | Mô tả |
|---------|-------|
| `/taixiu setchannel #channel` | Đặt kênh Tài Xỉu |
| `/taixiu start` | Bắt đầu game Tài Xỉu |
| `/taixiu stop` | Dừng game Tài Xỉu |
| `/taixiu stats` | Xem thống kê Tài Xỉu |
| `/baucua setchannel #channel` | Đặt kênh Bầu Cua |
| `/baucua start` | Bắt đầu game Bầu Cua |
| `/baucua stop` | Dừng game Bầu Cua |
| `/admin givecoin @user <amount>` | Tặng coin |

## Luật chơi

### Tài Xỉu

- Mỗi phiên 50 giây
- Kết quả random 50/50 Tài/Xỉu
- Thắng: nhận **250%** tiền cược (trả trực tiếp, không có hũ)

### Bầu Cua

- Mỗi phiên 50 giây
- 3 xúc xắc, mỗi xúc xắc 1 trong 6 biểu tượng: 🥣 Bầu, 🦀 Cua, 🦐 Tôm, 🐟 Cá, 🐓 Gà, 🦌 Nai
- Cho phép đặt nhiều cửa (tối đa 6) trong 1 phiên
- Cược đúng 1 lần = 1.2x, 2 lần = 2.4x, 3 lần = 3.6x (trả trực tiếp, không có hũ)
- 3 xúc xắc giống nhau → trúng cửa đó x1.4 thay vì x1.2

## Cấu trúc thư mục

```
src/
├── index.js              # Entry point
├── config.js             # Configuration
├── commands/             # Discord commands
│   ├── baucua.js         # /baucua commands
│   ├── bet.js            # /bet (Tài Xỉu)
│   ├── taixiu.js         # /taixiu commands
│   └── ...
├── games/
│   ├── taixiu/           # Tài Xỉu game logic
│   └── baucua/           # Bầu Cua game logic
│       ├── engine.js     # Random symbol rolling
│       ├── session.js    # Round lifecycle
│       ├── reward.js     # Payout settlement
│       └── stats.js      # Stats embeds
├── database/             # SQLite Cloud database
└── utils/                # Utilities
```
