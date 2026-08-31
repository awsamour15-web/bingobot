import { TxType, WalletType } from " @fidel/shared\;
import prisma from \../lib/prisma.js\;

export class InsufficientFundsError extends Error {
 constructor(public readonly walletId: string, public readonly balance: number, public readonly requested: number) {
 super(Insufficient Funds! Need Birr - you have Birr.);
 this.name = \InsufficientFundsError\;
 }
};

export const WalletService = {
 async debit(playerId: string, walletType: WalletType, amount: number, type: TxType, referenceId?: string, note?: string): Promise<void> {
 await prisma.(async (tx) => {
 const wallets = await tx.<Array<{ id: string; balance: string }>>(SELECT id, balance FROM wallets WHERE player_id = AND type = ::\WalletType\ FOR UPDATE);
 const wallet = wallets[0];
 if (!wallet) throw new Error(Wallet not found);
 const currentBalance = parseFloat(wallet.balance);
 if (currentBalance < amount) throw new InsufficientFundsError(wallet.id, currentBalance, amount);
 await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } } });
 await tx.transaction.create({ data: { wallet_id: wallet.id, type, amount, reference_id: referenceId ?? null, note: note ?? null } });
 });
 },
 async debitDual(playerId: string, amount: number, type: TxType, referenceId?: string, note?: string): Promise<void> {
 await prisma.(async (tx) => {
 const wallets = await tx.<Array<{ id: string; balance: string; type: string }>>(SELECT id, balance, type FROM wallets WHERE player_id = FOR UPDATE);
 const playWallet = wallets.find(w => w.type === \play\);
 const mainWallet = wallets.find(w => w.type === \main\);
 if (!mainWallet) throw new Error(Main wallet not found);
 const playBalance = playWallet ? parseFloat(playWallet.balance) : 0;
 const mainBalance = parseFloat(mainWallet.balance);
 if (playBalance + mainBalance < amount) throw new InsufficientFundsError(mainWallet.id, playBalance + mainBalance, amount);
 let remaining = amount;
 if (playWallet && playBalance > 0) {
 const fromPlay = Math.min(playBalance, remaining);
 await tx.wallet.update({ where: { id: playWallet.id }, data: { balance: { decrement: fromPlay } } });
 await tx.transaction.create({ data: { wallet_id: playWallet.id, type, amount: fromPlay, reference_id: referenceId ?? null, note: note ? ${note} (play) : null } });
 remaining -= fromPlay;
 }
 if (remaining > 0) {
 await tx.wallet.update({ where: { id: mainWallet.id }, data: { balance: { decrement: remaining } } });
 await tx.transaction.create({ data: { wallet_id: mainWallet.id, type, amount: remaining, reference_id: referenceId ?? null, note: note ? ${note} (main) : null } });
 }
 });
 },
 async credit(playerId: string, walletType: WalletType, amount: number, type: TxType, referenceId?: string, note?: string): Promise<void> {
 await prisma.(async (tx) => {
 const wallet = await tx.wallet.findUniqueOrThrow({ where: { player_id_type: { player_id: playerId, type: walletType } } });
 await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
 await tx.transaction.create({ data: { wallet_id: wallet.id, type, amount, reference_id: referenceId ?? null, note: note ?? null } });
 });
 },
 assertWithdrawable(walletType: WalletType): void {
 if (walletType === WalletType.play) throw new Error(\Play wallet credits cannot be withdrawn\);
 }
};
