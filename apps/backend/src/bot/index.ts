// Telegram Bot entry point using grammY
// Requirements: 10.4

import { Bot, InlineKeyboard } from 'grammy';
import prisma from '../lib/prisma.js';

// ─── Env vars ─────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env['BOT_TOKEN'];
const MINI_APP_URL = process.env['MINI_APP_URL'] ?? 'https://t.me/beteseb_bingo_bot/app';

// ─── Bot instance (null if BOT_TOKEN is not set) ──────────────────────────────

let bot: Bot | null = null;

if (BOT_TOKEN) {
  bot = new Bot(BOT_TOKEN);

  /**
   * /start command handler
   *
   * Accepts an optional deep-link parameter in the format `ref_<telegramId>`,
   * which is sent when a player clicks a referral link.
   *
   * On /start:
   *  1. Parse the optional referral parameter from the payload.
   *  2. Upsert the player in the database (create if new, update username if existing).
   *  3. For new players with a valid referrer, set the referrer_id.
   *  4. Send the Mini App inline keyboard button.
   */
  bot.command('start', async (ctx) => {
    try {
      const from = ctx.from;
      if (!from) return;

      const payload = ctx.match; // text after /start (the deep-link parameter)
      const telegramId = BigInt(from.id);
      const username = from.username ?? from.first_name ?? `user_${from.id}`;

      // Parse referral parameter: "ref_<telegramId>"
      let referrerId: string | undefined;
      if (typeof payload === 'string' && payload.startsWith('ref_')) {
        try {
          const referrerTelegramId = BigInt(payload.slice(4));
          const referrer = await prisma.player.findUnique({
            where: { telegram_id: referrerTelegramId },
            select: { id: true },
          });
          referrerId = referrer?.id;
        } catch {
          // Invalid referral param — ignore
        }
      }

      // Upsert player
      await prisma.$transaction(async (tx) => {
        const existing = await tx.player.findUnique({
          where: { telegram_id: telegramId },
          select: { id: true },
        });

        if (existing) {
          // Update username in case it changed in Telegram
          await tx.player.update({
            where: { telegram_id: telegramId },
            data: { username },
          });
        } else {
          // First-time registration
          const newPlayer = await tx.player.create({
            data: {
              telegram_id: telegramId,
              username,
              ...(referrerId ? { referrer_id: referrerId } : {}),
            },
            select: { id: true },
          });

          // Create main and play wallets
          await tx.wallet.createMany({
            data: [
              { player_id: newPlayer.id, type: 'main', balance: 0 },
              { player_id: newPlayer.id, type: 'play', balance: 0 },
            ],
          });
        }
      });

      // Send Mini App button
      const keyboard = new InlineKeyboard().webApp('🎮 Open Beteseb Bingo', MINI_APP_URL);

      await ctx.reply(
        '🎉 Welcome to Beteseb Bingo!\n\nTap the button below to open the game.',
        { reply_markup: keyboard },
      );
    } catch (err) {
      console.error('[Bot] /start handler error:', err);
      await ctx.reply('Something went wrong. Please try again later.').catch(() => {});
    }
  });

  // Global error handler — log but never crash
  bot.catch((err) => {
    console.error('[Bot] Unhandled error:', err);
  });
} else {
  console.warn('[Bot] BOT_TOKEN is not set — bot will not start.');
}

export { bot, MINI_APP_URL };
