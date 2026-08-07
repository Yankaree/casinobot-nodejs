const { UserModel, BetModel } = require('../../database/models');
const config = require('../../config');

async function processRewards(sessionId, result, jackpot, bets) {
  for (const bet of bets) {
    const user = UserModel.getOrCreate(bet.discord_id);
    const won = bet.choice === result;
    let payout = 0;

    if (won) {
      if (jackpot) {
        payout = Math.floor(bet.amount * config.game.jackpotMultiplier);
      } else {
        payout = Math.floor(bet.amount * config.game.betMultiplier);
      }
      UserModel.addCoins(bet.discord_id, payout);
      UserModel.addWin(bet.discord_id);
    } else {
      UserModel.addLose(bet.discord_id);
    }

    BetModel.updateResult(sessionId, user.id, won, payout);
  }
}

module.exports = { processRewards };
