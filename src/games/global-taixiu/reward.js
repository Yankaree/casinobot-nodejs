const { UserModel, GlobalTaixiuBetModel, TransactionModel } = require('../../database/models');
const config = require('../../config');

const GAME_NAME = 'globaltaixiu';

async function processRewards(sessionId, result, bets) {
  const losers = bets.filter(b => b.choice !== result);
  const winners = bets.filter(b => b.choice === result);

  for (const bet of winners) {
    const payout = Math.floor(bet.amount * config.game.betMultiplier);

    if (payout > 0) {
      await UserModel.addCoins(bet.guild_id, bet.discord_id, payout);
    }

    await TransactionModel.record({
      guildId: bet.guild_id,
      discordId: bet.discord_id,
      amount: payout,
      type: 'win',
      game: GAME_NAME,
    });

    await UserModel.addWin(bet.guild_id, bet.discord_id);
    await GlobalTaixiuBetModel.updateResult(sessionId, bet.user_id, true, payout);
  }

  for (const bet of losers) {
    await TransactionModel.record({
      guildId: bet.guild_id,
      discordId: bet.discord_id,
      amount: -bet.amount,
      type: 'lose',
      game: GAME_NAME,
    });
    await UserModel.addLose(bet.guild_id, bet.discord_id);
    await GlobalTaixiuBetModel.updateResult(sessionId, bet.user_id, false, 0);
  }
}

module.exports = { processRewards };
