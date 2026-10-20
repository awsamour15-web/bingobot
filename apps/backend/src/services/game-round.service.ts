// Game Round Lifecycle Service
// Requirements: 3.3, 3.5, 3.6, 13.1, 13.2, 13.3, 15.4

import { GameStatus, TxType, WalletType, WinPattern } from '@fidel/shared';
import prisma from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { WalletService } from './wallet.service.js';
import { nce } from './nce.service.js';
import { getConfigInt, getConfigFloat } from '../lib/config-cache.js';

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
    winningPattern = JSON.stringify([WinPattern.any_line, WinPattern.corners]),
  ): Promise<string> {
    const commissionPct = await getConfigFloat('platform_commission_pct', 20);

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
   * Join a player to a pending round with multiple cartela numbers.
   * Only checks balance — NO deduction here.
   * Payment is collected in bulk when the round starts via collectRoundPayments().
   */
  async joinBatch(
    roundId: string,
    playerId: string,
    cartelaNumbers: number[],
  ): Promise<void> {
    if (cartelaNumbers.length === 0) return;

    const maxCartelasRow = await prisma.config.findUnique({ where: { key: 'max_cartelas_per_player' } });
    const rawMax = maxCartelasRow ? parseInt(maxCartelasRow.value, 10) : 2;
    const maxAllowed = Number.isFinite(rawMax) && rawMax >= 1 ? rawMax : 2;

    try {
      await prisma.$transaction(async (tx) => {
        const round = await tx.gameRound.findUnique({
          where: { id: roundId },
          select: { id: true, status: true, stake: true, commission_pct: true },
        });

        if (!round) throw new RoundNotFoundError(roundId);
        if (round.status !== GameStatus.pending) {
          throw new RoundNotPendingError(roundId, round.status);
        }

        const player = await tx.player.findUnique({ where: { id: playerId } });
        if (!player) throw new Error(`Player ${playerId} not found`);
        if (player.is_suspended) throw new PlayerSuspendedError(playerId);

        // Check cartela availability
        const existingEntries = await tx.roundEntry.findMany({
          where: { round_id: roundId, cartela_number: { in: cartelaNumbers } },
          select: { cartela_number: true, player_id: true },
        });
        const alreadyOwned = new Set(
          existingEntries.filter(e => e.player_id === playerId).map(e => e.cartela_number)
        );
        const takenByOthers = existingEntries.filter(e => e.player_id !== playerId);
        if (takenByOthers.length > 0) {
          throw new CartelaTakenError(roundId, takenByOthers[0]!.cartela_number);
        }
        const newCartelaNumbers = cartelaNumbers.filter(n => !alreadyOwned.has(n));
        if (newCartelaNumbers.length === 0) return;

        // Enforce per-player cartela limit
        const currentCount = await tx.roundEntry.count({
          where: { round_id: roundId, player_id: playerId, is_watching: false },
        });
        if (currentCount + newCartelaNumbers.length > maxAllowed) {
          throw Object.assign(new Error(`You can only select up to ${maxAllowed} cartela(s) per round`), { code: 'MAX_CARTELA_LIMIT' });
        }

        // Balance check only — NO deduction
        const stake = Number(round.stake);
        const totalNeeded = stake * (currentCount + newCartelaNumbers.length);
        const allWallets = await tx.wallet.findMany({
          where: { player_id: playerId, type: { in: ['play', 'main'] as any } },
          select: { id: true, type: true, balance: true },
        });
        const totalBalance = allWallets.reduce((s, w) => s + Number(w.balance), 0);
        if (totalBalance < totalNeeded) {
          const { InsufficientFundsError } = await import('./wallet.service.js');
          throw new InsufficientFundsError('', totalBalance, totalNeeded);
        }

        // Insert entries
        await tx.roundEntry.createMany({
          data: newCartelaNumbers.map((cartelaNumber) => ({
            round_id: roundId,
            player_id: playerId,
            cartela_number: cartelaNumber,
            is_watching: false,
          })),
        });

        // Update derash preview
        const entryCount = await tx.roundEntry.count({
          where: { round_id: roundId, is_watching: false },
        });
        const newDerash = entryCount * stake * (1 - round.commission_pct / 100);
        await tx.gameRound.update({ where: { id: roundId }, data: { derash: newDerash } });
      }, { timeout: 15000 });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'P2002') throw new CartelaTakenError(roundId, cartelaNumbers[0]!);
      throw err;
    }

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
      // 1. Fetch the round
      const round = await tx.gameRound.findUnique({
        where: { id: roundId },
        select: { id: true, status: true, stake: true, commission_pct: true },
      });

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

      const stake = Number(round.stake);
      const commissionPct = round.commission_pct;

      // Balance check only — NO deduction (payment collected at round start)
      const allWallets = await tx.wallet.findMany({
        where: { player_id: playerId, type: { in: ['play', 'main'] as any } },
        select: { id: true, type: true, balance: true },
      });
      const totalBalance = allWallets.reduce((s, w) => s + Number(w.balance), 0);
      if (totalBalance < stake) {
        const { InsufficientFundsError } = await import('./wallet.service.js');
        throw new InsufficientFundsError('', totalBalance, stake);
      }

      // Insert RoundEntry
      await tx.roundEntry.create({
        data: {
          round_id: roundId,
          player_id: playerId,
          cartela_number: cartelaNumber,
          is_watching: false,
        },
      });

      // Recalculate and update derash (preview)
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
   * Start a round: payments were already collected at cartela selection time.
   * Just flip status to active, recalculate derash, and kick off NCE immediately.
   */
  async start(roundId: string): Promise<void> {
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      select: { id: true, status: true, stake: true, commission_pct: true },
    });
    if (!round) throw new RoundNotFoundError(roundId);

    // Use updateMany with status=pending guard — idempotent, safe against concurrent calls.
    const { count: claimCount } = await prisma.gameRound.updateMany({
      where: { id: roundId, status: GameStatus.pending },
      data: { status: GameStatus.active, start_time: new Date() },
    });
    if (claimCount === 0) {
      console.log(`[GameRoundService] Round ${roundId} already started by another process — skipping`);
      return;
    }

    const finalEntryCount = await prisma.roundEntry.count({ where: { round_id: roundId, is_watching: false } });

    if (finalEntryCount === 0) {
      await prisma.gameRound.update({ where: { id: roundId }, data: { status: GameStatus.void, ended_at: new Date() } });
      if (GameRoundService._onRoundVoidEmpty) await GameRoundService._onRoundVoidEmpty(roundId);
      return;
    }

    // Derash = entry count × stake × (1 - commission).
    // We use entry count here (not transaction sum) because real-player payments
    // are collected asynchronously AFTER this point, so transaction totals are
    // incomplete at start time. After collectRoundPayments finishes it will
    // recalculate and update derash if any players are removed for insufficient funds.
    const stake = Number(round.stake);
    const finalDerash = Math.floor(finalEntryCount * stake * (1 - round.commission_pct / 100));
    await prisma.gameRound.update({ where: { id: roundId }, data: { derash: finalDerash } });

    // Collect payments from all players in the background (non-blocking)
    // Players who can't pay are removed from the round before NCE starts
    void GameRoundService.collectRoundPayments(roundId).then(() => {
      // Kick off number calling after payments are collected
      nce.start(roundId).catch((err) => {
        console.error(`[GameRoundService] Failed to start NCE for round ${roundId}:`, err);
      });
    }).catch((err) => {
      console.error(`[GameRoundService] collectRoundPayments failed for ${roundId}:`, err);
      // Start anyway so round doesn't get stuck
      nce.start(roundId).catch(() => {});
    });
  },

  /**
   * Collect payments from all round entries when the round starts.
   * Deducts stake from each player (play wallet first, then main).
   * Players with insufficient balance are removed from the round.
   */
  async collectRoundPayments(roundId: string): Promise<void> {
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      select: { stake: true, commission_pct: true },
    });
    if (!round) return;

    const stake = Number(round.stake);

    const entries = await prisma.roundEntry.findMany({
      where: { round_id: roundId, is_watching: false },
      select: { player_id: true, cartela_number: true },
    });

    // Group entries by player
    const byPlayer = new Map<string, number[]>();
    for (const e of entries) {
      if (!byPlayer.has(e.player_id)) byPlayer.set(e.player_id, []);
      byPlayer.get(e.player_id)!.push(e.cartela_number);
    }

    const removedPlayers: string[] = [];

    for (const [playerId, cartelas] of byPlayer) {
      // Skip mock players — their payments are handled by mock bot
      const player = await prisma.player.findUnique({ where: { id: playerId }, select: { is_mock: true } });
      if (player?.is_mock) continue;

      const totalStake = stake * cartelas.length;

      try {
        await prisma.$transaction(async (tx) => {
          const wallets = await tx.wallet.findMany({
            where: { player_id: playerId, type: { in: ['play', 'main'] as any } },
            select: { id: true, type: true, balance: true },
          });
          const playWallet = wallets.find(w => w.type === 'play');
          const mainWallet = wallets.find(w => w.type === 'main');
          const playBalance = Number(playWallet?.balance ?? 0);
          const mainBalance = Number(mainWallet?.balance ?? 0);

          if (playBalance + mainBalance < totalStake) {
            // Insufficient — remove all their cartelas
            await tx.roundEntry.deleteMany({
              where: { round_id: roundId, player_id: playerId },
            });
            removedPlayers.push(playerId);
            return;
          }

          // Deduct play wallet first, then main
          let remaining = totalStake;
          const playDebit = Math.min(playBalance, remaining);
          remaining -= playDebit;
          const mainDebit = remaining;

          if (playDebit > 0 && playWallet) {
            await tx.wallet.update({ where: { id: playWallet.id }, data: { balance: { decrement: playDebit } } });
            await tx.transaction.create({ data: { wallet_id: playWallet.id, type: TxType.game_entry, amount: playDebit, reference_id: roundId } });
          }
          if (mainDebit > 0 && mainWallet) {
            await tx.wallet.update({ where: { id: mainWallet.id }, data: { balance: { decrement: mainDebit } } });
            await tx.transaction.create({ data: { wallet_id: mainWallet.id, type: TxType.game_entry, amount: mainDebit, reference_id: roundId } });
          }
        });
      } catch (err) {
        console.error(`[GameRoundService] Payment failed for player ${playerId} in round ${roundId}:`, err);
        removedPlayers.push(playerId);
        await prisma.roundEntry.deleteMany({ where: { round_id: roundId, player_id: playerId } }).catch(() => {});
      }
    }

    if (removedPlayers.length > 0) {
      console.log(`[GameRoundService] Removed ${removedPlayers.length} players from round ${roundId} due to insufficient balance`);
      // Recalculate derash after removals
      const remaining = await prisma.roundEntry.count({ where: { round_id: roundId, is_watching: false } });
      const newDerash = Math.floor(remaining * stake * (1 - round.commission_pct / 100));
      await prisma.gameRound.update({ where: { id: roundId }, data: { derash: newDerash } }).catch(() => {});
    }
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

    // Refund all paying entries — return to the wallet type they paid from
    // Since payment uses play-first then main, refund back to play wallet
    // (play wallet is the primary game wallet; this matches user expectation)
    await Promise.all(
      round.round_entries.map(async (entry) => {
        await WalletService.credit(
          entry.player_id,
          WalletType.play,
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
    const [round, minPlayers] = await Promise.all([
      prisma.gameRound.findUnique({
        where: { id: roundId },
        include: { _count: { select: { round_entries: true } } },
      }),
      getConfigInt('min_players_to_start', 1),
    ]);

    if (!round || round.status !== GameStatus.pending) return;

    const playerCount = round._count.round_entries;

    if (playerCount >= minPlayers && round.start_time <= new Date()) {
      await GameRoundService.start(roundId);
    }
  },
};
