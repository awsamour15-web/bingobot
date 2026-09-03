// Game Round Lifecycle Service
// Requirements: 3.3, 3.5, 3.6, 13.1, 13.2, 13.3, 15.4

import { GameStatus, TxType, WalletType } from '@fidel/shared';
import prisma from '../lib/prisma.js';
import { WalletService } from './wallet.service.js';
import { nce } from './nce.service.js';

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
export type OnCartelaTaken = (roundId: string, cartelaNumbers: number[], playerCount: number, excludePlayerId?: string) => void | Promise<void>;
export type OnCartelaReserved = (roundId: string, cartelaNumbers: number[]) => void | Promise<void>;
export type OnCartelaUnreserved = (roundId: string, cartelaNumbers: number[]) => void | Promise<void>;

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

  /** Optional callback invoked when a cartela is reserved. */
  _onCartelaReserved: undefined as OnCartelaReserved | undefined,

  setOnCartelaReserved(cb: OnCartelaReserved): void {
    GameRoundService._onCartelaReserved = cb;
  },

  /** Optional callback invoked when a cartela reservation is released. */
  _onCartelaUnreserved: undefined as OnCartelaUnreserved | undefined,

  setOnCartelaUnreserved(cb: OnCartelaUnreserved): void {
    GameRoundService._onCartelaUnreserved = cb;
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
    winningPattern = 'any_line',
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
        winning_pattern: winningPattern,
      },
    });

    return round.id;
  },

  /**
   * Join a player to a pending round with multiple cartela numbers in a single transaction.
   * No balance deduction here — payment is collected when the game starts.
   * Removes any existing reservations for these cartelas by this player.
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

        // 3. Check all cartelas are available (not taken by others)
        const existingEntries = await tx.roundEntry.findMany({
          where: { round_id: roundId, cartela_number: { in: cartelaNumbers } },
          select: { cartela_number: true },
        });
        if (existingEntries.length > 0) {
          throw new CartelaTakenError(roundId, existingEntries[0]!.cartela_number);
        }

        // 3b. Enforce per-player cartela limit from Config
        const maxCartelasRow = await tx.config.findUnique({ where: { key: 'max_cartelas_per_player' } });
        const rawMax = maxCartelasRow ? parseInt(maxCartelasRow.value, 10) : 2;
        const maxAllowed = Number.isFinite(rawMax) && rawMax >= 1 ? rawMax : 2;
        const currentCount = await tx.roundEntry.count({
          where: { round_id: roundId, player_id: playerId, is_watching: false },
        });
        if (currentCount + cartelaNumbers.length > maxAllowed) {
          throw Object.assign(new Error(`You can only select up to ${maxAllowed} cartela(s) per round`), { code: 'MAX_CARTELA_LIMIT' });
        }

        // 4. Check player has sufficient balance (soft check — actual debit at game start)
        const stake = parseFloat(round.stake);
        const totalStake = stake * cartelaNumbers.length;
        const allWallets = await tx.$queryRaw<Array<{ id: string; type: string; balance: string }>>`
          SELECT id, type, balance FROM wallets
          WHERE player_id = ${playerId} AND type IN ('play', 'main')
        `;
        const playBalance = parseFloat(allWallets.find(w => w.type === 'play')?.balance ?? '0');
        const mainBalance = parseFloat(allWallets.find(w => w.type === 'main')?.balance ?? '0');
        if (playBalance + mainBalance < totalStake) {
          const { InsufficientFundsError } = await import('./wallet.service.js');
          const mainWalletId = allWallets.find(w => w.type === 'main')?.id ?? '';
          throw new InsufficientFundsError(mainWalletId, playBalance + mainBalance, totalStake);
        }

        // 5. Insert all RoundEntries (no payment yet)
        await tx.roundEntry.createMany({
          data: cartelaNumbers.map((cartelaNumber) => ({
            round_id: roundId,
            player_id: playerId,
            cartela_number: cartelaNumber,
            is_watching: false,
          })),
        });

        // 7. Recalculate derash (preview — will be recalculated at start with actual payers)
        const entryCount = await tx.roundEntry.count({
          where: { round_id: roundId, is_watching: false },
        });
        const commissionPct = round.commission_pct;
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

    // Notify websocket layer — exclude the picker so they don't receive CARTELA_TAKEN for their own pick
    if (GameRoundService._onCartelaTaken) {
      const playerCount = await prisma.roundEntry.count({
        where: { round_id: roundId, is_watching: false },
      });
      await GameRoundService._onCartelaTaken(roundId, cartelaNumbers, playerCount, playerId);
    }
  },

  /**
   * Join a player to a pending round with a specific cartela number.
   * No balance deduction here — payment is collected when the game starts.
   * Removes any existing reservation for this cartela by this player.
   */
  async join(
    roundId: string,
    playerId: string,
    cartelaNumber: number,
    walletType: WalletType = WalletType.main,
  ): Promise<void> {
    void walletType; // kept for API compatibility
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

      // 3. Check cartela availability (not taken by others)
      const existing = await tx.roundEntry.findUnique({
        where: { round_id_cartela_number: { round_id: roundId, cartela_number: cartelaNumber } },
      });
      if (existing) throw new CartelaTakenError(roundId, cartelaNumber);

      const stake = parseFloat(round.stake);
      const commissionPct = round.commission_pct;

      // 4. Soft balance check (actual debit happens at game start)
      const allWallets = await tx.$queryRaw<Array<{ id: string; type: string; balance: string }>>`
        SELECT id, type, balance FROM wallets
        WHERE player_id = ${playerId} AND type IN ('play', 'main')
      `;
      const playBalance = parseFloat(allWallets.find(w => w.type === 'play')?.balance ?? '0');
      const mainBalance = parseFloat(allWallets.find(w => w.type === 'main')?.balance ?? '0');
      if (playBalance + mainBalance < stake) {
        const { InsufficientFundsError } = await import('./wallet.service.js');
        const mainWalletId = allWallets.find(w => w.type === 'main')?.id ?? '';
        throw new InsufficientFundsError(mainWalletId, playBalance + mainBalance, stake);
      }

      // 5. Insert RoundEntry (no payment yet)
      await tx.roundEntry.create({
        data: {
          round_id: roundId,
          player_id: playerId,
          cartela_number: cartelaNumber,
          is_watching: false,
        },
      });

      // 7. Recalculate and update derash (preview)
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
      if (e.code === 'P2002') throw new CartelaTakenError(roundId, cartelaNumber);
      throw err;
    }

    // Notify websocket layer — exclude the picker
    if (GameRoundService._onCartelaTaken) {
      const playerCount = await prisma.roundEntry.count({
        where: { round_id: roundId, is_watching: false },
      });
      await GameRoundService._onCartelaTaken(roundId, [cartelaNumber], playerCount, playerId);
    }
  },

  /**
   * Start a round: collect payment from all entries, set status to active, kick off NCE.
   */
  async start(roundId: string): Promise<void> {
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      include: { round_entries: { where: { is_watching: false }, select: { player_id: true, cartela_number: true } } },
    });
    if (!round) throw new RoundNotFoundError(roundId);

    const stake = Number(round.stake);
    const commissionPct = round.commission_pct;

    // Collect payment from each entry — remove entries that can't pay
    // Process all payments in parallel for speed
    const paidPlayerIds: string[] = [];
    const removedCartelas: number[] = [];

    await Promise.all(
      round.round_entries.map(async (entry) => {
        try {
          await prisma.$transaction(async (tx) => {
            const allWallets = await tx.$queryRaw<Array<{ id: string; type: string; balance: string }>>`
              SELECT id, type, balance FROM wallets
              WHERE player_id = ${entry.player_id} AND type IN ('play', 'main')
              FOR UPDATE
            `;
            const playWallet = allWallets.find(w => w.type === 'play');
            const mainWallet = allWallets.find(w => w.type === 'main');
            const playBal = parseFloat(playWallet?.balance ?? '0');
            const mainBal = parseFloat(mainWallet?.balance ?? '0');

            if (playBal + mainBal < stake) {
              // Can't pay — remove entry
              await tx.roundEntry.delete({
                where: { round_id_cartela_number: { round_id: roundId, cartela_number: entry.cartela_number } },
              });
              removedCartelas.push(entry.cartela_number);
              return;
            }

            const playDebit = Math.min(playBal, stake);
            const mainDebit = stake - playDebit;

            if (playDebit > 0 && playWallet) {
              await tx.wallet.update({ where: { id: playWallet.id }, data: { balance: { decrement: playDebit } } });
              await tx.transaction.create({ data: { wallet_id: playWallet.id, type: TxType.game_entry, amount: playDebit, reference_id: roundId } });
            }
            if (mainDebit > 0 && mainWallet) {
              await tx.wallet.update({ where: { id: mainWallet.id }, data: { balance: { decrement: mainDebit } } });
              await tx.transaction.create({ data: { wallet_id: mainWallet.id, type: TxType.game_entry, amount: mainDebit, reference_id: roundId } });
            }
            paidPlayerIds.push(entry.player_id);
          });
        } catch {
          // On error, remove this entry to be safe
          await prisma.roundEntry.deleteMany({
            where: { round_id: roundId, player_id: entry.player_id, cartela_number: entry.cartela_number },
          }).catch(() => {});
          removedCartelas.push(entry.cartela_number);
        }
      })
    );

    // Recalculate derash with actual paying players
    const finalEntryCount = await prisma.roundEntry.count({ where: { round_id: roundId, is_watching: false } });

    if (finalEntryCount === 0) {
      // No paying players — void the round
      await prisma.gameRound.update({ where: { id: roundId }, data: { status: GameStatus.void, ended_at: new Date() } });
      if (GameRoundService._onRoundVoidEmpty) await GameRoundService._onRoundVoidEmpty(roundId);
      return;
    }

    const finalDerash = finalEntryCount * stake * (1 - commissionPct / 100);

    await prisma.gameRound.update({
      where: { id: roundId },
      data: { status: GameStatus.active, start_time: new Date(), derash: finalDerash },
    });

    // Kick off number calling immediately (non-blocking) — don't wait for async completion
    nce.start(roundId).catch((err) => {
      console.error(`[GameRoundService] Failed to start NCE for round ${roundId}:`, err);
    });
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

    // Refund all paying entries
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
