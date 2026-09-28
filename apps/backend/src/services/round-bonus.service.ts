// Round Bonus Service
// After every completed round, one random registered cartela is selected as the bonus winner.
// That player receives their stake back (1 cartela price) credited to their main wallet.

import { TxType } from '@fidel/shared';
import prisma from '../lib/prisma.js';

export const RoundBonusService = {
  /**
   * Award a bonus to a randomly selected cartela holder in the completed round.
   * The bonus amount equals the round stake (1 cartela price returned).
   * Idempotent — if a bonus winner already exists for this round, does nothing.
   *
   * @param roundId  The completed round ID
   */
  async awardRoundBonus(roundId: string): Promise<void> {
    // Guard: skip if bonus already awarded for this round
    const existing = await prisma.roundBonusWinner.findUnique({
      where: { round_id: roundId },
    });
    if (existing) return;

    // Fetch round stake and all non-watching entries in one query
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      select: {
        stake: true,
        round_entries: {
          where: { is_watching: false },
          select: { player_id: true, cartela_number: true },
        },
      },
    });

    if (!round || round.round_entries.length === 0) return;

    const stake = Math.round(Number(round.stake)); // integer birr
    if (stake <= 0) return;

    // Pick a random entry
    const entries = round.round_entries;
    const winnerEntry = entries[Math.floor(Math.random() * entries.length)]!;

    // Credit bonus and record winner atomically
    await prisma.$transaction(async (tx) => {
      // Double-check no concurrent winner was inserted
      const check = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM round_bonus_winners WHERE round_id = ${roundId} LIMIT 1
      `;
      if (check.length > 0) return;

      // Find player's main wallet
      const wallets = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM wallets WHERE player_id = ${winnerEntry.player_id} AND type = 'main' LIMIT 1
      `;
      const walletId = wallets[0]?.id;
      if (!walletId) return;

      // Credit stake to main wallet
      await tx.wallet.update({
        where: { id: walletId },
        data: { balance: { increment: stake } },
      });

      await tx.transaction.create({
        data: {
          wallet_id: walletId,
          type: TxType.bonus,
          amount: stake,
          reference_id: roundId,
          note: `Round bonus — cartela #${winnerEntry.cartela_number}`,
        },
      });

      // Record the winner
      await tx.roundBonusWinner.create({
        data: {
          round_id: roundId,
          player_id: winnerEntry.player_id,
          cartela_number: winnerEntry.cartela_number,
          bonus_amount: stake,
        },
      });
    });

    console.log(
      `[RoundBonus] Round ${roundId}: bonus of ${stake} ETB awarded to player ${winnerEntry.player_id} (cartela #${winnerEntry.cartela_number})`,
    );
  },
};
