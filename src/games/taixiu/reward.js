const { UserModel, BetModel, ConfigModel } = require('../../database/models');
const config = require('../../config');

async function processRewards(guildId, sessionId, result, jackpot, bets) {
  const losers = bets.filter(b => b.choice !== result);
  const winners = bets.filter(b => b.choice === result);

  for (const bet of losers) {
    const user = UserModel.getOrCreate(bet.discord_id);
    ConfigModel.addJackpot(guildId, bet.amount);
    UserModel.addLose(bet.discord_id);
    BetModel.updateResult(sessionId, user.id, false, 0);
  }

  let jackpotBalance = ConfigModel.getJackpot(guildId);

  for (const bet of winners) {
    const user = UserModel.getOrCreate(bet.discord_id);
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
      ConfigModel.addJackpot(guildId, -payout);
      UserModel.addCoins(bet.discord_id, payout);
    }

    UserModel.addWin(bet.discord_id);
    BetModel.updateResult(sessionId, user.id, true, payout);
  }
}

module.exports = { processRewards };
