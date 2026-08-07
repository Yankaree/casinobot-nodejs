const { UserModel, BetModel, ConfigModel } = require('../../database/models');
const config = require('../../config');

async function processRewards(guildId, sessionId, result, jackpot, bets) {
  const losers = bets.filter(b => b.choice !== result);
  const winners = bets.filter(b => b.choice === result);

  for (const bet of losers) {
    await ConfigModel.addJackpot(guildId, bet.amount);
    await UserModel.addLose(bet.discord_id);
    await BetModel.updateResult(sessionId, bet.user_id, false, 0);
  }

  let jackpotBalance = await ConfigModel.getJackpot(guildId);

  for (const bet of winners) {
    let payout = 0;

    if (jackpot) {
      payout = Math.floor(bet.amount * config.game.jackpotMultiplier);
    } else {
      payout = Math.floor(bet.amount * config.game.betMultiplier);
    }

    if (payout > jackpotBalance) {
      payout = jackpotBalance;
    }

    if (payout > 0) {
      await ConfigModel.addJackpot(guildId, -payout);
      await UserModel.addCoins(bet.discord_id, payout);
    }

    await UserModel.addWin(bet.discord_id);
    await BetModel.updateResult(sessionId, bet.user_id, true, payout);
  }
}

module.exports = { processRewards };
