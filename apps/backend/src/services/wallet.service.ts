// Wallet service — atomic debit and credit operations
// Requirements: 3.3, 3.4, 5.3, 6.2, 6.4

import { TxType, WalletType } from '@fidel/shared';
import prisma from '../lib/prisma.js';

// ─── Typed error ─────────────────────────────────────────────────────────────

export class InsufficientFundsError extends Error {
  constructor(
    public readonly walletId: string,
    public readonly balance: number,
    public readonly requested: number,
  ) {
    super(
      `ቀሪ ሂሳብ አይበቃም!\nNeed ${requested} Birr — you have ${balance.toFixed(0)} Birr.\nPlease deposit to continue.`,
    );
    this.name = 'InsufficientFundsError';
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const WalletService = {
  /**
   * Debit a player's wallet of a given type.
   * Uses SELECT … FOR UPDATE to prevent double-spend race conditions.
   * Throws InsufficientFundsError when balance < amount.
   */
  async debit(
    playerId: string,
    walletType: WalletType,
    amount: number,
    type: TxType,
    referenceId?: string,
    note?: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Lock the wallet row for the duration of this transaction
      const wallets = await tx.$queryRaw<
        Array<{ id: string; balance: string }>
      >`
        SELECT id, balance
        FROM wallets
        WHERE player_id = ${playerId}
          AND type = ${walletType}::"WalletType"
        FOR UPDATE
      `;

      const wallet = wallets[0];
      if (!wallet) {
        throw new Error(`Wallet not found for player ${playerId} type ${walletType}`);
      }

      const currentBalance = parseFloat(wallet.balance);

      if (currentBalance < amount) {
        throw new InsufficientFundsError(wallet.id, currentBalance, amount);
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });

      await tx.transaction.create({
        data: {
          wallet_id: wallet.id,
          type,
          amount,
          reference_id: referenceId ?? null,
          note: note ?? null,
        },
      });
    });
  },

  /**
   * Credit a player's wallet of a given type.
   * Always succeeds as long as the wallet exists.
   */
  async credit(
    playerId: string,
    walletType: WalletType,
    amount: number,
    type: TxType,
    referenceId?: string,
    note?: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { player_id_type: { player_id: playerId, type: walletType } },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });

      await tx.transaction.create({
        data: {
          wallet_id: wallet.id,
          type,
          amount,
          reference_id: referenceId ?? null,
          note: note ?? null,
        },
      });
    });
  },

  /**
   * Validate that a withdrawal targets the main wallet only.
   * Play wallet withdrawals are rejected at the service boundary.
   * Requirements: 6.6
   */
  assertWithdrawable(walletType: WalletType): void {
    if (walletType === WalletType.play) {
      throw new Error('Play wallet credits cannot be withdrawn as real money');
    }
  },
};
