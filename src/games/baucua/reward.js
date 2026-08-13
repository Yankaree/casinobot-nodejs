const { UserModel, BaucuaBetModel, TransactionModel } = require('../../database/models');
const { countAnimal, getTripleAnimal } = require('./engine');

const GAME_NAME = 'baucua';
const NORMAL_MULTIPLIER = 1.2;
const TRIPLE_MULTIPLIER = 1.4;

async function processRewards(guildId, sessionId, results, totalBets) {
  const bets = await BaucuaBetModel.getSessionBets(sessionId);

  const tripleName = getTripleAnimal(results);

  for (const bet of bets) {
    const count = countAnimal(results, bet.animal);
    let payout = 0;

    if (count > 0) {
      const multiplier = tripleName !== null && bet.animal === tripleName
        ? TRIPLE_MULTIPLIER
        : NORMAL_MULTIPLIER;
      payout = Math.floor(bet.amount * count * multiplier);
    }

    if (payout > 0) {
      await UserModel.addCoins(guildId, bet.discord_id, payout);
      await TransactionModel.record({
        guildId,
        discordId: bet.discord_id,
        amount: payout,
        type: 'win',
        game: GAME_NAME,
      });
      await UserModel.addWin(guildId, bet.discord_id);
      await BaucuaBetModel.updateResult(sessionId, bet.user_id, bet.animal, true, payout);
    } else {
      await UserModel.addLose(guildId, bet.discord_id);
      await TransactionModel.record({
        guildId,
        discordId: bet.discord_id,
        amount: -bet.amount,
        type: 'lose',
        game: GAME_NAME,
      });
      await BaucuaBetModel.updateResult(sessionId, bet.user_id, bet.animal, false, 0);
    }
  }
}

module.exports = { processRewards };
