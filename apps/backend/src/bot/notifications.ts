// Telegram Bot notification dispatcher — all notifications disabled

import { bot, MINI_APP_URL } from './index.js';
import prisma from '../lib/prisma.js';

// Unused imports kept to avoid breaking any future re-enable
void bot; void MINI_APP_URL; void prisma;

/**
 * Notify a player that their game round is about to start.
 * DISABLED — no Telegram notifications are sent.
 */
export async function notifyGameStart(_playerId: string, _roundId: string): Promise<void> {
  // notifications permanently disabled
}

/**
 * Notify a player that they won a game round.
 * DISABLED — no Telegram notifications are sent.
 */
export async function notifyWin(_playerId: string, _derash: number, _totalWinners?: number): Promise<void> {
  // notifications permanently disabled
}

/**
 * Notify a player about a completed deposit or withdrawal transaction.
 * DISABLED — no Telegram notifications are sent.
 */
export async function notifyTransaction(
  _playerId: string,
  _txType: string,
  _amount: number,
  _newBalance: number,
): Promise<void> {
  // notifications permanently disabled
}

/**
 * Notify a player that their withdrawal request was rejected.
 * DISABLED — no Telegram notifications are sent.
 */
export async function notifyWithdrawalRejected(_playerId: string): Promise<void> {
  // notifications permanently disabled
}
