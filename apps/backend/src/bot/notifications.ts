// Telegram Bot notification dispatcher

import { bot } from './index.js';
import prisma from '../lib/prisma.js';

/** Resolve a player's telegram_id from their player UUID */
async function getPlayerTelegramId(playerId: string): Promise<bigint | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { telegram_id: true },
  });
  return player?.telegram_id ?? null;
}

/**
 * Notify a player that their game round is about to start.
 */
export async function notifyGameStart(_playerId: string, _roundId: string): Promise<void> {
  // not implemented
}

/**
 * Notify a player that they won a game round.
 */
export async function notifyWin(_playerId: string, _derash: number, _totalWinners?: number): Promise<void> {
  // not implemented
}

/**
 * Notify a player about a completed deposit or withdrawal transaction.
 */
export async function notifyTransaction(
  _playerId: string,
  _txType: string,
  _amount: number,
  _newBalance: number,
): Promise<void> {
  // not implemented
}

/**
 * Notify a player that their withdrawal was approved and paid.
 */
export async function notifyWithdrawalApproved(playerId: string, amount: number, phone: string): Promise<void> {
  try {
    if (!bot) return;
    const telegramId = await getPlayerTelegramId(playerId);
    if (!telegramId) return;

    await bot.api.sendMessage(
      telegramId.toString(),
      `✅ የማውጣት ጥያቄዎ ተፈቅዷል!\n\n` +
      `💵 መጠን: ${amount} ብር\n` +
      `📱 ስልክ: ${phone}\n\n` +
      `ብሩ ወደ ቴሌብር ቁጥርዎ ተልኳል። ❤️`,
    );
  } catch (err) {
    console.error('[Notifications] Failed to send withdrawal approved message:', err);
  }
}

/**
 * Notify a player that their withdrawal was rejected and funds refunded.
 */
export async function notifyWithdrawalRejected(playerId: string, amount?: number): Promise<void> {
  try {
    if (!bot) return;
    const telegramId = await getPlayerTelegramId(playerId);
    if (!telegramId) return;

    const amountText = amount ? `💵 መጠን: ${amount} ብር\n\n` : '';

    await bot.api.sendMessage(
      telegramId.toString(),
      `❌ የማውጣት ጥያቄዎ ውድቅ ተደርጓል።\n\n` +
      amountText +
      `ሂሳብዎ ወደ  ዋሌትዎ ተመልሷል። ለተጨማሪ መረጃ ድጋፍ ያግኙ።`,
    );
  } catch (err) {
    console.error('[Notifications] Failed to send withdrawal rejected message:', err);
  }
}
