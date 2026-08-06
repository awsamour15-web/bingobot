// Telegram Bot notification dispatcher
// Requirements: 10.1, 10.2, 10.3, 10.4

import { InlineKeyboard } from 'grammy';
import { bot, MINI_APP_URL } from './index.js';
import prisma from '../lib/prisma.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Look up a player's telegram_id from the database.
 * Returns null if the player is not found or has no telegram_id.
 */
async function getTelegramId(playerId: string): Promise<string | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { telegram_id: true },
  });

  if (!player?.telegram_id) return null;

  // telegram_id is stored as BigInt — convert to string for the bot API
  return player.telegram_id.toString();
}

/**
 * Build the standard "Open App" inline keyboard button.
 */
function openAppKeyboard(): InlineKeyboard {
  return new InlineKeyboard().url('📱 Open App', MINI_APP_URL);
}

// ─── Notification functions ───────────────────────────────────────────────────

/**
 * Notify a player that their game round is about to start.
 * Called ~60 seconds before the round begins.
 *
 * @param playerId  Internal UUID of the player
 * @param roundId   Internal UUID of the game round
 *
 * Requirements: 10.1, 10.4
 */
export async function notifyGameStart(playerId: string, roundId: string): Promise<void> {
  return; // notifications disabled

  try {
    const telegramId = await getTelegramId(playerId);
    if (!telegramId) return;

    await bot.api.sendMessage(
      telegramId,
      `⏰ Your bingo game (Round ${roundId.slice(-6).toUpperCase()}) is starting in about 60 seconds!\n\nGet ready — open the app and keep an eye on the board.`,
      { reply_markup: openAppKeyboard() },
    );
  } catch (err) {
    console.error(`[Bot] notifyGameStart error for player ${playerId}:`, err);
  }
}

/**
 * Notify a player that they won a game round and the prize has been credited.
 *
 * @param playerId  Internal UUID of the player
 * @param derash    Prize amount in Birr (ETB)
 *
 * Requirements: 10.2, 10.4
 */
export async function notifyWin(playerId: string, derash: number, totalWinners?: number): Promise<void> {
  return; // notifications disabled

  try {
    const telegramId = await getTelegramId(playerId);
    if (!telegramId) return;

    const formattedAmount = new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(derash);

    const message = totalWinners && totalWinners > 1
      ? `🏆 You won a shared prize! ${totalWinners} players won this round.\n\n💰 Your share: ${formattedAmount} has been credited to your Main Wallet.\n\nOpen the app to continue playing!`
      : `🏆 Congratulations! You won!\n\n💰 Prize: ${formattedAmount} has been credited to your Main Wallet.\n\nOpen the app to continue playing!`;

    await bot.api.sendMessage(telegramId, message, { reply_markup: openAppKeyboard() });
  } catch (err) {
    console.error(`[Bot] notifyWin error for player ${playerId}:`, err);
  }
}

/**
 * Notify a player about a completed deposit or withdrawal transaction.
 *
 * @param playerId    Internal UUID of the player
 * @param txType      Transaction type (e.g. 'deposit', 'withdrawal')
 * @param amount      Transaction amount in Birr
 * @param newBalance  Player's updated Main Wallet balance in Birr
 *
 * Requirements: 10.3, 10.4
 */
export async function notifyTransaction(
  playerId: string,
  txType: string,
  amount: number,
  newBalance: number,
): Promise<void> {
  return; // notifications disabled

  try {
    const telegramId = await getTelegramId(playerId);
    if (!telegramId) return;

    const formattedAmount = new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(amount);

    const formattedBalance = new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(newBalance);

    const isDeposit = txType === 'deposit';
    const emoji = isDeposit ? '💵' : '📤';
    const verb = isDeposit ? 'Deposit confirmed' : 'Withdrawal processed';

    await bot.api.sendMessage(
      telegramId,
      `${emoji} ${verb}\n\nAmount: ${formattedAmount}\nNew balance: ${formattedBalance}`,
      { reply_markup: openAppKeyboard() },
    );
  } catch (err) {
    console.error(`[Bot] notifyTransaction error for player ${playerId}:`, err);
  }
}

/**
 * Notify a player that their withdrawal request was rejected and funds returned.
 *
 * @param playerId  Internal UUID of the player
 *
 * Requirements: 10.4, 14.4
 */
export async function notifyWithdrawalRejected(playerId: string): Promise<void> {
  return; // notifications disabled

  try {
    const telegramId = await getTelegramId(playerId);
    if (!telegramId) return;

    await bot.api.sendMessage(
      telegramId,
      `❌ Your withdrawal request was rejected by our team.\n\nThe requested funds have been returned to your Main Wallet. Please contact support if you have questions.`,
      { reply_markup: openAppKeyboard() },
    );
  } catch (err) {
    console.error(`[Bot] notifyWithdrawalRejected error for player ${playerId}:`, err);
  }
}
