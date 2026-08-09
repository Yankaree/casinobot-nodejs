const { UserModel, GlobalTaixiuBetModel, JackpotModel } = require('../../database/models');
const config = require('../../config');

const GAME_NAME = 'globaltaixiu';
const GLOBAL_KEY = 'global';

async function processRewards(sessionId, result, jackpot, bets) {
  const losers = bets.filter(b => b.choice !== result);
  const winners = bets.filter(b => b.choice === result);

  const totalLost = losers.reduce((sum, b) => sum + b.amount, 0);

  let jackpotBalance = await JackpotModel.getBalance(GLOBAL_KEY, GAME_NAME);
  if (jackpotBalance < 0) jackpotBalance = 0;

  let poolFromLosers = totalLost;

  for (const bet of winners) {
    let payout = 0;

    if (jackpot) {
      payout = Math.floor(bet.amount * config.game.jackpotMultiplier);
    } else {
      payout = Math.floor(bet.amount * config.game.betMultiplier);
    }

    let fromLosers = Math.min(payout, poolFromLosers);
    let fromJackpot = payout - fromLosers;

    poolFromLosers -= fromLosers;

    if (fromJackpot > 0 && fromJackpot <= jackpotBalance) {
      await JackpotModel.addAmount(GLOBAL_KEY, GAME_NAME, -fromJackpot);
      jackpotBalance -= fromJackpot;
    } else if (fromJackpot > 0) {
      fromJackpot = jackpotBalance;
      await JackpotModel.reset(GLOBAL_KEY, GAME_NAME);
      jackpotBalance = 0;
    }

    const finalPayout = fromLosers + fromJackpot;
    if (finalPayout > 0) {
      await UserModel.addCoins(bet.guild_id, bet.discord_id, finalPayout);
    }

    await UserModel.addWin(bet.guild_id, bet.discord_id);
    await GlobalTaixiuBetModel.updateResult(sessionId, bet.user_id, true, finalPayout);
  }

  if (poolFromLosers > 0) {
    await JackpotModel.addAmount(GLOBAL_KEY, GAME_NAME, poolFromLosers);
  }

  for (const bet of losers) {
    await UserModel.addLose(bet.guild_id, bet.discord_id);
    await GlobalTaixiuBetModel.updateResult(sessionId, bet.user_id, false, 0);
  }
}

module.exports = { processRewards };
