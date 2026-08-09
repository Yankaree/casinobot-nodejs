const { UserModel, BaucuaBetModel, JackpotModel } = require('../../database/models');
const { countAnimal, getTripleAnimal } = require('./engine');
const { GAME_NAME } = require('./jackpot');

const NORMAL_MULTIPLIER = 1.2;
const JACKPOT_MULTIPLIER = 1.4;

async function processRewards(guildId, sessionId, results, totalBets) {
  const bets = await BaucuaBetModel.getSessionBets(sessionId);

  const tripleName = getTripleAnimal(results);
  const jackpotWin = tripleName !== null;

  let jackpotBalance = await JackpotModel.getBalance(guildId, GAME_NAME);
  if (jackpotBalance < 0) jackpotBalance = 0;

  const jackpotWinners = [];
  const multiplierPayouts = new Map();
  let totalMultiplierPayout = 0;

  for (const bet of bets) {
    const count = countAnimal(results, bet.animal);
    let payout = 0;

    if (count > 0) {
      if (jackpotWin && bet.animal === tripleName) {
        payout = Math.floor(bet.amount * count * JACKPOT_MULTIPLIER);
        jackpotWinners.push(bet);
      } else {
        payout = Math.floor(bet.amount * count * NORMAL_MULTIPLIER);
      }
    }

    multiplierPayouts.set(`${bet.user_id}_${bet.animal}`, payout);
    totalMultiplierPayout += payout;

    if (payout > 0) {
      await UserModel.addCoins(guildId, bet.discord_id, payout);
      await UserModel.addWin(guildId, bet.discord_id);
      await BaucuaBetModel.updateResult(sessionId, bet.user_id, bet.animal, true, payout);
    } else {
      await UserModel.addLose(guildId, bet.discord_id);
      await BaucuaBetModel.updateResult(sessionId, bet.user_id, bet.animal, false, 0);
    }
  }

  if (jackpotWin && jackpotWinners.length > 0) {
    const totalJackpotBet = jackpotWinners.reduce((sum, b) => sum + b.amount, 0);

    for (const winner of jackpotWinners) {
      const share = totalJackpotBet > 0 ? winner.amount / totalJackpotBet : 1 / jackpotWinners.length;
      const jackpotPayout = Math.floor(jackpotBalance * share);
      if (jackpotPayout > 0) {
        await UserModel.addCoins(guildId, winner.discord_id, jackpotPayout);
        const existingPayout = multiplierPayouts.get(`${winner.user_id}_${winner.animal}`) || 0;
        await BaucuaBetModel.updateResult(
          sessionId, winner.user_id, winner.animal, true,
          existingPayout + jackpotPayout
        );
      }
    }

    await JackpotModel.reset(guildId, GAME_NAME);
  }

  const moneyForJackpot = totalBets - totalMultiplierPayout;

  if (moneyForJackpot > 0) {
    await JackpotModel.addAmount(guildId, GAME_NAME, moneyForJackpot);
  }
}

module.exports = { processRewards };
