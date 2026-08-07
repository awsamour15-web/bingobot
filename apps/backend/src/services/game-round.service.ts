// Game Round Lifecycle Service
// Requirements: 3.3, 3.5, 3.6, 13.1, 13.2, 13.3, 15.4

import { GameStatus, TxType, WalletType } from '@fidel/shared';
import prisma from '../lib/prisma.js';
import { WalletService } from './wallet.service.js';
import { nce } from './nce.service.js';
import { ReferralService } from './referral.service.js';

// ─── Typed errors ─────────────────────────────────────────────────────────────

export class RoundNotPendingError extends Error {
  constructor(roundId: string, status: string) {
    super(`Round ${roundId} is not pending (current status: ${status})`);
    this.name = 'RoundNotPendingError';
  }
}

export class CartelaTakenError extends Error {
  constructor(roundId: string, cartelaNumber: number) {
    super(`Cartela ${cartelaNumber} is already taken in round ${roundId}`);
    this.name = 'CartelaTakenError';
  }
}

export class PlayerSuspendedError extends Error {
  constructor(playerId: string) {
    super(`Player ${playerId} is suspended and cannot join rounds`);
    this.name = 'PlayerSuspendedError';
  }
}

export class RoundNotFoundError extends Error {
  constructor(roundId: string) {
    super(`Round ${roundId} not found`);
    this.name = 'RoundNotFoundError';
  }
}

// ─── Callback type for cancel broadcast ──────────────────────────────────────

export type OnRoundCancelled = (roundId: string) => void | Promise<void>;
export type OnRoundVoidEmpty = (roundId: string) => void | Promise<void>;
export type OnCartelaTaken = (roundId: string, cartelaNumbers: number[], playerCount: number) => void | Promise<void>;

// ─── Service ─────────────────────────────────────────────────────────────────

export const GameRoundService = {
  /** Optional callback invoked after a round is cancelled. WebSocket layer registers here. */
  _onRoundCancelled: undefined as OnRoundCancelled | undefined,

  setOnRoundCancelled(cb: OnRoundCancelled): void {
    GameRoundService._onRoundCancelled = cb;
  },

  /** Optional callback invoked when a round is voided due to no players. */
  _onRoundVoidEmpty: undefined as OnRoundVoidEmpty | undefined,

  setOnRoundVoidEmpty(cb: OnRoundVoidEmpty): void {
    GameRoundService._onRoundVoidEmpty = cb;
  },

  /** Optional callback invoked when a cartela is successfully taken. */
  _onCartelaTaken: undefined as OnCartelaTaken | undefined,

  setOnCartelaTaken(cb: OnCartelaTaken): void {
    GameRoundService._onCartelaTaken = cb;
  },

  /**
   * Create a new pending game round.
   * Snapshots `commission_pct` from Config at creation time so that
   * subsequent config changes do not affect this round (Requirement 15.4).
   */
  async create(
    stake: number,
    startTime: Date,
    maxPlayers: number,
  ): Promise<string> {
    const commissionRow = await prisma.config.findUnique({
      where: { key: 'platform_commission_pct' },
    });
    const commissionPct = commissionRow ? parseFloat(commissionRow.value) : 20;

    const round = await prisma.gameRound.create({
      data: {
        stake,
        status: GameStatus.pending,
        max_players: maxPlayers,
        start_time: startTime,
        commission_pct: commissionPct,
        derash: 0,
      },
    });

    return round.id;
  },

  /**
   * Join a player to a pending round with multiple cartela numbers in a single transaction.
   * Prevents the race where the round starts between sequential single joins.
   * Requirements: 3.3, 3.5, 3.6
   */
  async joinBatch(
    roundId: string,
    playerId: string,
    cartelaNumbers: number[],
  ): Promise<void> {
    if (cartelaNumbers.length === 0) return;

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Fetch and lock the round once
        const rounds = await tx.$queryRaw<
          Array<{ id: string; status: string; stake: string; commission_pct: number }>
        >`
          SELECT id, status, stake, commission_pct
          FROM game_rounds
          WHERE id = ${roundId}
          FOR UPDATE
        `;

        const round = rounds[0];
        if (!round) throw new RoundNotFoundError(roundId);
        if (round.status !== GameStatus.pending) {
          throw new RoundNotPendingError(roundId, round.status);
        }

        // 2. Check player suspension once
        const player = await tx.player.findUnique({ where: { id: playerId } });
        if (!player) throw new Error(`Player ${playerId} not found`);
        if (player.is_suspended) throw new PlayerSuspendedError(playerId);

        // 3. Check all cartelas are available
        const existingEntries = await tx.roundEntry.findMany({
          where: { round_id: roundId, cartela_number: { in: cartelaNumbers } },
          select: { cartela_number: true },
        });
        if (existingEntries.length > 0) {
          throw new CartelaTakenError(roundId, existingEntries[0]!.cartela_number);
        }

        const stake = parseFloat(round.stake);
        const commissionPct = round.commission_pct;
        const totalStake = stake * cartelaNumbers.length;

        // 4. Debit total stake — play wallet first, then main
        const allWallets = await tx.$queryRaw<Array<{ id: string; type: string; balance: string }>>`
          SELECT id, type, balance
          FROM wallets
          WHERE player_id = ${playerId}
            AND type IN ('play', 'main')
          FOR UPDATE
        `;

        const playWalletRow = allWallets.find((w) => w.type === 'play');
        const mainWalletRow = allWallets.find((w) => w.type === 'main');

        if (!mainWalletRow) throw new Error(`Main wallet not found for player ${playerId}`);

        const playBalance = playWalletRow ? parseFloat(playWalletRow.balance) : 0;
        const mainBalance = parseFloat(mainWalletRow.balance);
        const totalAvailable = playBalance + mainBalance;

        if (totalAvailable < totalStake) {
          const { InsufficientFundsError } = await import('./wallet.service.js');
          throw new InsufficientFundsError(mainWalletRow.id, totalAvailable, totalStake);
        }

        const playDebit = Math.min(playBalance, totalStake);
        const mainDebit = totalStake - playDebit;

        if (playDebit > 0 && playWalletRow) {
          await tx.wallet.update({
            where: { id: playWalletRow.id },
            data: { balance: { decrement: playDebit } },
          });
          await tx.transaction.create({
            data: {
              wallet_id: playWalletRow.id,
              type: TxType.game_entry,
              amount: playDebit,
              reference_id: roundId,
            },
          });
        }

        if (mainDebit > 0) {
          await tx.wallet.update({
            where: { id: mainWalletRow.id },
            data: { balance: { decrement: mainDebit } },
          });
          await tx.transaction.create({
            data: {
              wallet_id: mainWalletRow.id,
              type: TxType.game_entry,
              amount: mainDebit,
              reference_id: roundId,
            },
          });
        }

        // 5. Insert all RoundEntries
        await tx.roundEntry.createMany({
          data: cartelaNumbers.map((cartelaNumber) => ({
            round_id: roundId,
            player_id: playerId,
            cartela_number: cartelaNumber,
            is_watching: false,
          })),
        });

        // 6. Recalculate derash
        const entryCount = await tx.roundEntry.count({
          where: { round_id: roundId, is_watching: false },
        });
        const newDerash = entryCount * stake * (1 - commissionPct / 100);

        await tx.gameRound.update({
          where: { id: roundId },
          data: { derash: newDerash },
        });
      });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'P2002') throw new CartelaTakenError(roundId, cartelaNumbers[0]!);
      throw err;
    }

    // Notify websocket layer
    if (GameRoundService._onCartelaTaken) {
      const playerCount = await prisma.roundEntry.count({
        where: { round_id: roundId, is_watching: false },
      });
      await GameRoundService._onCartelaTaken(roundId, cartelaNumbers, playerCount);
    }
  },

  /**
   * Join a player to a pending round with a specific cartela number.
   *
   * Inside a single Postgres transaction:
   *  1. Verify round is pending.
   *  2. Verify player is not suspended.
   *  3. Verify the cartela is not already taken in this round.
   *  4. Debit the stake from the player's wallet.
   *  5. Insert the RoundEntry.
   *  6. Update GameRound.derash.
   *
   * Round auto-start is handled by the scheduler, not here.
   * Requirements: 3.3, 3.5, 3.6
   */
  async join(
    roundId: string,
    playerId: string,
    cartelaNumber: number,
    walletType: WalletType = WalletType.main,
  ): Promise<void> {
    try {
    await prisma.$transaction(async (tx) => {
      // 1. Fetch and lock the round
      const rounds = await tx.$queryRaw<
        Array<{ id: string; status: string; stake: string; commission_pct: number }>
      >`
        SELECT id, status, stake, commission_pct
        FROM game_rounds
        WHERE id = ${roundId}
        FOR UPDATE
      `;

      const round = rounds[0];
      if (!round) throw new RoundNotFoundError(roundId);
      if (round.status !== GameStatus.pending) {
        throw new RoundNotPendingError(roundId, round.status);
      }

      // 2. Check player suspension
      const player = await tx.player.findUnique({ where: { id: playerId } });
      if (!player) throw new Error(`Player ${playerId} not found`);
      if (player.is_suspended) throw new PlayerSuspendedError(playerId);

      // 3. Check cartela availability
      const existing = await tx.roundEntry.findUnique({
        where: { round_id_cartela_number: { round_id: roundId, cartela_number: cartelaNumber } },
      });
      if (existing) throw new CartelaTakenError(roundId, cartelaNumber);      const stake = parseFloat(round.stake);
      const commissionPct = round.commission_pct;

      // 4. Debit stake — use play wallet first, then main wallet for the remainder.
      //    This allows welcome bonus / play credits to be spent on game entry.
      const allWallets = await tx.$queryRaw<Array<{ id: string; type: string; balance: string }>>`
        SELECT id, type, balance
        FROM wallets
        WHERE player_id = ${playerId}
          AND type IN ('play', 'main')
        FOR UPDATE
      `;

      const playWalletRow = allWallets.find((w) => w.type === 'play');
      const mainWalletRow = allWallets.find((w) => w.type === 'main');

      if (!mainWalletRow) throw new Error(`Main wallet not found for player ${playerId}`);

      const playBalance = playWalletRow ? parseFloat(playWalletRow.balance) : 0;
      const mainBalance = parseFloat(mainWalletRow.balance);
      const totalAvailable = playBalance + mainBalance;

      if (totalAvailable < stake) {
        const { InsufficientFundsError } = await import('./wallet.service.js');
        throw new InsufficientFundsError(mainWalletRow.id, totalAvailable, stake);
      }

      // Deduct from play wallet first, then main wallet for any remainder
      const playDebit = Math.min(playBalance, stake);
      const mainDebit = stake - playDebit;

      if (playDebit > 0 && playWalletRow) {
        await tx.wallet.update({
          where: { id: playWalletRow.id },
          data: { balance: { decrement: playDebit } },
        });
        await tx.transaction.create({
          data: {
            wallet_id: playWalletRow.id,
            type: TxType.game_entry,
            amount: playDebit,
            reference_id: roundId,
          },
        });
      }

      if (mainDebit > 0) {
        await tx.wallet.update({
          where: { id: mainWalletRow.id },
          data: { balance: { decrement: mainDebit } },
        });
        await tx.transaction.create({
          data: {
            wallet_id: mainWalletRow.id,
            type: TxType.game_entry,
            amount: mainDebit,
            reference_id: roundId,
          },
        });
      }

      // 5. Insert RoundEntry
      await tx.roundEntry.create({
        data: {
          round_id: roundId,
          player_id: playerId,
          cartela_number: cartelaNumber,
          is_watching: false,
        },
      });

      // 6. Recalculate and update derash
      //    derash = (current_entries + 1) * stake * (1 - commission_pct / 100)
      const entryCount = await tx.roundEntry.count({
        where: { round_id: roundId, is_watching: false },
      });
      // entryCount already includes the newly inserted row because we're inside the same tx
      const newDerash = entryCount * stake * (1 - commissionPct / 100);

      await tx.gameRound.update({
        where: { id: roundId },
        data: { derash: newDerash },
      });
    });
    } catch (err: unknown) {
      // Catch Prisma unique-constraint violation (race condition: two requests
      // pass the availability check simultaneously and one loses the DB race).
      const e = err as { code?: string };
      if (e.code === 'P2002') throw new CartelaTakenError(roundId, cartelaNumber);
      throw err;
    }

    // Notify websocket layer so all users on the cartela screen see this cartela as taken
    if (GameRoundService._onCartelaTaken) {
      const playerCount = await prisma.roundEntry.count({
        where: { round_id: roundId, is_watching: false },
      });
      await GameRoundService._onCartelaTaken(roundId, [cartelaNumber], playerCount);
    }
  },

  /**
   * Start a round: set status to active and kick off the NCE.
   * Also schedules a 60-second-before notification for every player in the round.
   * Requirements: 10.1, 13.2
   */
  async start(roundId: string): Promise<void> {
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      include: { round_entries: { where: { is_watching: false }, select: { player_id: true } } },
    });
    if (!round) throw new RoundNotFoundError(roundId);

    await prisma.gameRound.update({
      where: { id: roundId },
      data: {
        status: GameStatus.active,
        start_time: new Date(),
      },
    });

    // Kick off number calling (non-blocking)
    void nce.start(roundId);
  },

  /**
   * Cancel a round: stop NCE, refund all entries, update status.
   * Requirements: 13.3
   */
  async cancel(roundId: string): Promise<void> {
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      include: { round_entries: { where: { is_watching: false } } },
    });

    if (!round) throw new RoundNotFoundError(roundId);

    // Stop the NCE timer if running
    nce.stop(roundId);

    // Mark round as cancelled
    await prisma.gameRound.update({
      where: { id: roundId },
      data: { status: GameStatus.cancelled, ended_at: new Date() },
    });

    const stake = Number(round.stake);

    // Refund all paying entries and credit referral commissions
    await Promise.all(
      round.round_entries.map(async (entry) => {
        await WalletService.credit(
          entry.player_id,
          WalletType.main,
          stake,
          TxType.refund,
          roundId,
          'Round cancelled by admin',
        );
        await ReferralService.creditCommission(entry.player_id, roundId);
      }),
    );

    // Notify WebSocket layer
    if (GameRoundService._onRoundCancelled) {
      await GameRoundService._onRoundCancelled(roundId);
    }
  },

  /**
   * Check whether a round should auto-start after a player joins.
   * Auto-starts when playerCount >= min_players_to_start AND start_time has passed.
   * Requirements: 3.5, 3.6
   */
  async autoStartCheck(roundId: string): Promise<void> {
    const [round, minPlayersRow] = await Promise.all([
      prisma.gameRound.findUnique({
        where: { id: roundId },
        include: { _count: { select: { round_entries: true } } },
      }),
      prisma.config.findUnique({ where: { key: 'min_players_to_start' } }),
    ]);

    if (!round || round.status !== GameStatus.pending) return;

    const minPlayers = minPlayersRow ? parseInt(minPlayersRow.value, 10) : 1;
    const playerCount = round._count.round_entries;

    if (playerCount >= minPlayers && round.start_time <= new Date()) {
      await GameRoundService.start(roundId);
    }
  },
};
