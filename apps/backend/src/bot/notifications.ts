// Telegram Bot notification dispatcher

import { bot } from './index.js';
import prisma from '../lib/prisma.js';
import { getConfigOrDefault } from '../lib/config-cache.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a player's telegram_id from their player UUID */
async function getPlayerTelegramId(playerId: string): Promise<bigint | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { telegram_id: true },
  });
  return player?.telegram_id ?? null;
}

/** Send a message, swallowing errors silently (best-effort notifications) */
async function trySend(_chatId: string, _text: string, _extra?: object): Promise<void> {
  // Notifications disabled
}

/** Send to a channel by its configured ID (if set) */
async function tryBroadcastToChannel(_text: string): Promise<void> {
  // Notifications disabled
}

// ─── Round start notification ─────────────────────────────────────────────────

/**
 * Notify all non-watching players in a round that it is starting.
 * Sent as a non-blocking background job — never awaited by the caller.
 */
export async function notifyRoundStarting(_roundId: string, _stake: number): Promise<void> {
  // Notifications disabled
}

// ─── Winner notification ──────────────────────────────────────────────────────

/**
 * Notify a winning player privately.
 */
export async function notifyWin(
  playerId: string,
  amount: number,
  totalWinners = 1,
): Promise<void> {
  try {
    if (!bot) return;
    const telegramId = await getPlayerTelegramId(playerId);
    if (!telegramId) return;

    const splitNote = totalWinners > 1 ? ` (${totalWinners} winners split the prize)` : '';
    const text =
      `🏆 <b>አሸነፉ!</b>\n\n` +
      `💵 ${amount} ብር ወደ ዋሌትዎ ገብቷል${splitNote}.\n\n` +
      `እንኳን ደስ ያልዎ! 🎉`;

    await trySend(telegramId.toString(), text);
  } catch (err) {
    console.error('[Notifications] notifyWin error:', err);
  }
}

/**
 * Post a public winner announcement to the configured announcement channel.
 * Called after every completed round.
 */
export async function announceWinnerPublicly(
  winners: Array<{ username: string; amount: number; cartelaNumber: number }>,
  stake: number,
  totalDerash: number,
  calledCount: number,
): Promise<void> {
  try {
    if (!bot) return;

    const botUsername = process.env['BOT_USERNAME'] ?? 'f_bingobot';

    let winnerLines: string;
    if (winners.length === 1) {
      const w = winners[0]!;
      winnerLines =
        `🏆 <b>@${w.username}</b>\n` +
        `   Cartela #${w.cartelaNumber} — <b>${w.amount} ብር</b>`;
    } else {
      winnerLines = winners
        .map(w => `🏅 @${w.username} — #${w.cartelaNumber} — <b>${w.amount}ብር</b>`)
        .join('\n');
    }

    const text =
      `🎊 <b>አሸናፊ ተገኘ!</b>\n\n` +
      winnerLines + '\n\n' +
      `📊 ${calledCount} ቁጥሮች ጠርተው | ሽልማት: ${totalDerash} ብር | Stake: ${stake} ብር\n\n` +
      `🎮 ለመጫወት: @${botUsername}`;

    await tryBroadcastToChannel(text);
  } catch (err) {
    console.error('[Notifications] announceWinnerPublicly error:', err);
  }
}

// ─── Daily bonus notification ─────────────────────────────────────────────────

export async function notifyDailyBonus(
  telegramId: bigint,
  amount: number,
  streak: number,
): Promise<void> {
  const streakEmoji = streak >= 30 ? '🔥🔥🔥' : streak >= 7 ? '🔥🔥' : streak >= 3 ? '🔥' : '⭐';
  const streakMsg   = streak > 1 ? `\n${streakEmoji} <b>${streak} ቀን streak!</b>` : '';

  await trySend(
    telegramId.toString(),
    `🎁 <b>Daily Bonus</b>\n\n` +
    `${amount} ብር ወደ play wallet ገብቷል!${streakMsg}\n\n` +
    `ነገም ተመልሰው ለተጨማሪ ቦነስ! 😊`,
  );
}

// ─── Transaction notifications ────────────────────────────────────────────────

export async function notifyTransaction(
  playerId: string,
  txType: string,
  amount: number,
  newBalance: number,
): Promise<void> {
  try {
    if (!bot) return;
    const telegramId = await getPlayerTelegramId(playerId);
    if (!telegramId) return;

    const isDeposit  = txType === 'deposit';
    const icon  = isDeposit ? '✅' : '💸';
    const label = isDeposit ? 'ዲፖዚት ተረጋገጠ' : 'ብር ወጥቷል';

    await trySend(
      telegramId.toString(),
      `${icon} <b>${label}</b>\n\n` +
      `💵 ${amount} ብር\n` +
      `💰 ቀሪ ሒሳብ: ${newBalance} ብር`,
    );
  } catch (err) {
    console.error('[Notifications] notifyTransaction error:', err);
  }
}

// ─── Withdrawal notifications ─────────────────────────────────────────────────

export async function notifyWithdrawalApproved(
  playerId: string,
  amount: number,
  phone: string,
): Promise<void> {
  try {
    if (!bot) return;
    const telegramId = await getPlayerTelegramId(playerId);
    if (!telegramId) return;

    await trySend(
      telegramId.toString(),
      `✅ <b>የማውጣት ጥያቄዎ ተፈቅዷል!</b>\n\n` +
      `💵 መጠን: ${amount} ብር\n` +
      `📱 ስልክ: ${phone}\n\n` +
      `ብሩ ወደ ቴሌብር ቁጥርዎ ተልኳል። ❤️`,
    );
  } catch (err) {
    console.error('[Notifications] notifyWithdrawalApproved error:', err);
  }
}

export async function notifyWithdrawalRejected(
  playerId: string,
  amount?: number,
): Promise<void> {
  try {
    if (!bot) return;
    const telegramId = await getPlayerTelegramId(playerId);
    if (!telegramId) return;

    const amountText = amount ? `💵 መጠን: ${amount} ብር\n\n` : '';

    await trySend(
      telegramId.toString(),
      `❌ <b>የማውጣት ጥያቄዎ ውድቅ ተደርጓል።</b>\n\n` +
      amountText +
      `ሂሳብዎ ወደ ዋሌትዎ ተመልሷል። ለተጨማሪ መረጃ ድጋፍ ያግኙ።`,
    );
  } catch (err) {
    console.error('[Notifications] notifyWithdrawalRejected error:', err);
  }
}

// ─── Jackpot announcement ─────────────────────────────────────────────────────

export async function tryBroadcastJackpot(stake: number): Promise<void> {
  try {
    if (!bot) return;
    const botUsername = process.env['BOT_USERNAME'] ?? 'f_bingobot';
    const text =
      `🏆 <b>JACKPOT ROUND ዛሬ!</b>\n\n` +
      `💰 Stake: <b>${stake} ብር</b>\n` +
      `🎯 አሸናፊው ትልቅ ሽልማት ያገኛል!\n\n` +
      `ዛሬ ምሽት ይቀላቀሉ 👇\n` +
      `🎮 @${botUsername}`;

    await tryBroadcastToChannel(text);
  } catch (err) {
    console.error('[Notifications] tryBroadcastJackpot error:', err);
  }
}

// ─── Auto-rejoin prompt ───────────────────────────────────────────────────────

/**
 * After a round ends, ask the winner/participants if they want to auto-rejoin next round.
 * Shows an inline keyboard with their last cartela as the quick-rejoin option.
 */
export async function notifyAutoRejoinPrompt(
  playerId: string,
  lastCartelaNumber: number,
  nextRoundId: string,
): Promise<void> {
  try {
    if (!bot) return;
    const telegramId = await getPlayerTelegramId(playerId);
    if (!telegramId) return;

    const botUsername = process.env['BOT_USERNAME'] ?? 'f_bingobot';
    const miniAppUrl  = process.env['MINI_APP_URL']  ?? 'https://bingobot-mini-app.vercel.app/';

    const keyboard = {
      inline_keyboard: [[
        { text: `▶️ Rejoin #${lastCartelaNumber}`, url: `https://t.me/${botUsername}` },
        { text: '🎮 Open Game', url: miniAppUrl },
      ]],
    };

    await trySend(
      telegramId.toString(),
      `🔄 ሌላ ዙር ይጀምራል!\n\n` +
      `Cartela #${lastCartelaNumber} ዳግም ለመቀላቀል 👇`,
      { reply_markup: keyboard },
    );
  } catch (err) {
    console.error('[Notifications] notifyAutoRejoinPrompt error:', err);
  }
}
