cat << 'EOF' > apps/backend/src/services/wallet.service.ts
// Wallet service — atomic debit and credit operations
// Requirements: 3.3, 3.4, 5.3, 6.2, 6.4

import { TxType, WalletType } from '@fidel/shared';
import prisma from '../lib/prisma.js';

// ————— Typed error —————————————————————————————————————————————————————————————————————————————————————

export class InsufficientFundsError extends Error {
  constructor(
    public readonly walletId: string,
    public readonly balance: number,
    public readonly requested: number,
  ) {
    super(
      Insufficient Funds!\nNeed  Birr — you have  Birr.\nPlease deposit to continue.,
    );
    this.name = 'InsufficientFundsError';
  }
}

// ————— Service ——————————————————————————————————————————————————————————————————————————————————————————

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
    await prisma.(async (tx) => {
      const wallets = await tx.<
        Array<{ id: string; balance: string }>
      >
        SELECT id, balance
        FROM wallets
        WHERE player_id = 
          AND type = ::" WalletType\
 FOR UPDATE
 ;

 const wallet = wallets[0];
 if (!wallet) {
 throw new Error(Wallet not found for player type );
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
 * Debit from play wallet first, then main wallet for the remainder.
 */
 async debitDual(
 playerId: string,
 amount: number,
 type: TxType,
 referenceId?: string,
 note?: string,
 ): Promise<void> {
 await prisma.(async (tx) => {
 const wallets = await tx.<
 Array<{ id: string; balance: string; type: string }>
 >
 SELECT id, balance, type
 FROM wallets
 WHERE player_id = 
 FOR UPDATE
 ;

 const playWallet = wallets.find(w => w.type === 'play');
 const mainWallet = wallets.find(w => w.type === 'main');

 if (!mainWallet) {
 throw new Error(Main wallet not found for player );
 }

 const playBalance = playWallet ? parseFloat(playWallet.balance) : 0;
 const mainBalance = parseFloat(mainWallet.balance);

 if (playBalance + mainBalance < amount) {
 throw new InsufficientFundsError(mainWallet.id, playBalance + mainBalance, amount);
 }

 let remainingToDebit = amount;

 if (playWallet && playBalance > 0) {
 const amountFromPlay = Math.min(playBalance, remainingToDebit);
 await tx.wallet.update({
 where: { id: playWallet.id },
 data: { balance: { decrement: amountFromPlay } },
 });
 await tx.transaction.create({
 data: {
 wallet_id: playWallet.id,
 type,
 amount: amountFromPlay,
 reference_id: referenceId ?? null,
 note: note ? ${note} (from play) : null,
 },
 });
 remainingToDebit -= amountFromPlay;
 }

 if (remainingToDebit > 0) {
 await tx.wallet.update({
 where: { id: mainWallet.id },
 data: { balance: { decrement: remainingToDebit } },
 });
 await tx.transaction.create({
 data: {
 wallet_id: mainWallet.id,
 type,
 amount: remainingToDebit,
 reference_id: referenceId ?? null,
 note: note ? ${note} (from main) : null,
 },
 });
 }
 });
 },

 async credit(
 playerId: string,
 walletType: WalletType,
 amount: number,
 type: TxType,
 referenceId?: string,
 note?: string,
 ): Promise<void> {
 await prisma.(async (tx) => {
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

 assertWithdrawable(walletType: WalletType): void {
 if (walletType === WalletType.play) {
 throw new Error('Play wallet credits cannot be withdrawn as real money');
 }
 },
};
EOF
