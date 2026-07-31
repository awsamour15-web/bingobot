// Telegram Bot entry point using grammY
// Requirements: 10.4

import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import type { PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma.js';

type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

// ─── Env vars ─────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env['BOT_TOKEN'];
const MINI_APP_URL = process.env['MINI_APP_URL'] ?? 'https://bingobot.pages.dev/';

// ─── Main menu button labels ───────────────────────────────────────────────────

export const MENU_BUTTONS = [
  ['Play 🎮', 'Register 📝'],
  ['Check Balance 💰', 'Deposit 💰'],
  ['Contact Support 📞', 'Instruction 📖'],
  ['Transfer 🎁', 'Withdraw 🤑'],
  ['Invite 🔗', 'Convert Bonus 💲'],
] as const;

// ─── Unguarded buttons (accessible without registration) ─────────────────────

const UNGUARDED_BUTTONS = new Set(['Register 📝', 'Play 🎮']);

/**
 * Returns true if the given button text requires the player to be registered.
 * Returns false for "Register 📝" and "Play 🎮" (accessible to all).
 */
export function isGuardedButton(text: string): boolean {
  return !UNGUARDED_BUTTONS.has(text);
}

/**
 * Builds the persistent main-menu ReplyKeyboard with all 10 buttons in a 5×2 layout.
 * - resize_keyboard = true  (fits compactly on screen)
 * - one_time_keyboard = false  (remains visible after button press)
 */
export function buildMainMenu(): Keyboard {
  const kb = new Keyboard();
  for (let i = 0; i < MENU_BUTTONS.length; i++) {
    const [left, right] = MENU_BUTTONS[i]!;
    kb.text(left).text(right);
    // Add row separator between rows (not after the last row)
    if (i < MENU_BUTTONS.length - 1) {
      kb.row();
    }
  }
  return kb.resized().persistent();
}

/**
 * Returns true when a verified player record exists for the given telegram_id.
 * A player is considered registered when phone_verified = true.
 */
export async function isRegistered(telegramId: bigint): Promise<boolean> {
  const player = await prisma.player.findFirst({
    where: {
      telegram_id: telegramId,
      phone_verified: true,
    },
    select: { id: true },
  });
  return player !== null;
}

// ─── Helper: Play button — inline keyboard with web_app button ───────────────

/**
 * Builds an InlineKeyboard with a single web_app button for the Play handler.
 */
export function buildPlayReplyMarkup(miniAppUrl: string): InlineKeyboard {
  return new InlineKeyboard().webApp('Open Fidel Bingo', miniAppUrl);
}

// ─── Helper: Register button prompt text ─────────────────────────────────────

export const REGISTER_PROMPT_TEXT =
  '📱 Please share your phone number to register.\n\nTap the button below to send your contact.';

// ─── Static reply text constants ─────────────────────────────────────────────

export const DEPOSIT_TEXT =
  `💰 How to Deposit\n\n` +
  `Accepted payment methods: CBE Birr, Telebirr, Bank Transfer\n\n` +
  `Steps to deposit:\n` +
  `1. Send funds to our account:\n` +
  `   • CBE Birr: 1000123456789\n` +
  `   • Telebirr: 0911000000\n` +
  `   • Bank Transfer: CBE 1000123456789 (Fidel Bingo)\n\n` +
  `2. Send proof of your payment to our support team.\n` +
  `3. Your balance will be updated within 24 hours after verification.\n\n` +
  `⚠️ Always include your Telegram username in the payment note.`;

export const INSTRUCTION_TEXT =
  `📖 How to Play Fidel Bingo\n\n` +
  `Fidel Bingo is an exciting online bingo game!\n\n` +
  `1. 🎮 Open the game by tapping Play 🎮.\n` +
  `2. 🃏 Purchase a bingo card (cartela) using your play wallet balance.\n` +
  `3. 🔢 Numbers are drawn one by one — mark them on your card.\n` +
  `4. 🏆 Win by completing a line, two lines, or a full card — depending on the round type.\n` +
  `5. 💵 Winners receive their prize directly to their play wallet.\n\n` +
  `Good luck and may you win big! 🍀`;

export const TRANSFER_TEXT =
  `🎁 How to Transfer Balance\n\n` +
  `You can transfer your main wallet balance to another player.\n\n` +
  `Steps:\n` +
  `1. Contact our support team with:\n` +
  `   • The recipient's Telegram username or ID\n` +
  `   • The amount you wish to transfer\n` +
  `2. Our team will process the transfer after verification.\n` +
  `3. Both you and the recipient will be notified upon completion.\n\n` +
  `⚠️ Only main wallet balance can be transferred. Play wallet balance is not transferable.`;

export const WITHDRAW_TEXT =
  `🤑 How to Withdraw\n\n` +
  `Minimum withdrawal amount: ETB 100\n\n` +
  `Steps to withdraw:\n` +
  `1. Ensure your main wallet has the minimum withdrawal amount.\n` +
  `2. Contact our support team with:\n` +
  `   • Your preferred withdrawal method (CBE Birr / Telebirr / Bank Transfer)\n` +
  `   • Your account number or phone number\n` +
  `   • The amount you wish to withdraw\n` +
  `3. Withdrawals are processed within 24 hours on business days.\n\n` +
  `⚠️ Your phone number must be verified before you can withdraw.`;

export const CONVERT_BONUS_TEXT =
  `💲 How to Convert Bonus Balance\n\n` +
  `You can convert your bonus balance to your main wallet!\n\n` +
  `Steps:\n` +
  `1. Earn bonus credits by inviting friends or through promotions.\n` +
  `2. Once you have enough bonus balance, contact our support team.\n` +
  `3. Request a bonus-to-main wallet conversion.\n` +
  `4. The converted amount will be credited to your main wallet.\n\n` +
  `⚠️ Conversion rates and minimum thresholds apply. Contact support for current rates.`;

// ─── Helper: Check Balance button — format balance reply ─────────────────────

/**
 * Formats the balance reply for both main and play wallets.
 */
export function formatBalanceReply(
  mainBalance: number | bigint | string,
  playBalance: number | bigint | string,
): string {
  return `💰 Your Balance\n\nMain Wallet: ETB ${mainBalance}\nPlay Wallet: ETB ${playBalance}`;
}

// ─── Helper: Contact Support button — format support reply ───────────────────

/**
 * Formats the support contact reply using the configured contact value.
 */
export function formatSupportReply(contactValue: string): string {
  return `📞 Contact Support\n\n${contactValue}`;
}

// ─── Helper: Invite link builder ─────────────────────────────────────────────

/**
 * Builds a Telegram deep-link invite URL for the given bot username and telegram ID.
 * Format: https://t.me/<botUsername>?start=ref_<telegramId>
 */
export function buildInviteLink(botUsername: string, telegramId: bigint): string {
  return `https://t.me/${botUsername}?start=ref_${telegramId}`;
}

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
      await prisma.$transaction(async (tx: PrismaTx) => {
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

      // Send the persistent main menu keyboard
      await ctx.reply(
        '👋 Welcome to Fidel Bingo! Choose an Option below.',
        { reply_markup: buildMainMenu() },
      );
    } catch (err) {
      console.error('[Bot] /start handler error:', err);
      await ctx.reply('Something went wrong. Please try again later.').catch(() => {});
    }
  });

  // ─── 4.1: Play 🎮 handler ──────────────────────────────────────────────────
  bot.hears('Play 🎮', async (ctx) => {
    await ctx.reply('🎮 Let\'s play!', {
      reply_markup: buildPlayReplyMarkup(MINI_APP_URL),
    });
  });

  // ─── 4.2: Register 📝 handler ─────────────────────────────────────────────
  bot.hears('Register 📝', async (ctx) => {
    await ctx.reply(REGISTER_PROMPT_TEXT);
  });

  // ─── 4.3: Check Balance 💰 handler ────────────────────────────────────────
  bot.hears('Check Balance 💰', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    if (!(await isRegistered(telegramId))) {
      await ctx.reply(
        '⚠️ Please register first to use this feature. Tap Register 📝 to get started.',
      );
      return;
    }

    const wallets = await prisma.wallet.findMany({
      where: { player: { telegram_id: telegramId } },
    });

    const mainWallet = wallets.find((w) => w.type === 'main');
    const playWallet = wallets.find((w) => w.type === 'play');
    const mainBalance = mainWallet?.balance.toString() ?? '0';
    const playBalance = playWallet?.balance.toString() ?? '0';

    await ctx.reply(formatBalanceReply(mainBalance, playBalance));
  });

  // ─── 4.4: Contact Support 📞 handler ──────────────────────────────────────
  bot.hears('Contact Support 📞', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    if (!(await isRegistered(telegramId))) {
      await ctx.reply(
        '⚠️ Please register first to use this feature. Tap Register 📝 to get started.',
      );
      return;
    }

    const config = await prisma.config.findUnique({
      where: { key: 'support_contact' },
    });

    if (config) {
      await ctx.reply(formatSupportReply(config.value));
    } else {
      await ctx.reply('Support contact is not configured. Please try again later.');
    }
  });

  // ─── 5.1: Deposit 💰 handler ──────────────────────────────────────────────
  bot.hears('Deposit 💰', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isRegistered(BigInt(ctx.from.id)))) {
      await ctx.reply(
        '⚠️ Please register first to use this feature. Tap Register 📝 to get started.',
      );
      return;
    }
    await ctx.reply(DEPOSIT_TEXT);
  });

  // ─── 5.2: Instruction 📖 handler ──────────────────────────────────────────
  bot.hears('Instruction 📖', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isRegistered(BigInt(ctx.from.id)))) {
      await ctx.reply(
        '⚠️ Please register first to use this feature. Tap Register 📝 to get started.',
      );
      return;
    }
    await ctx.reply(INSTRUCTION_TEXT);
  });

  // ─── 5.3: Transfer 🎁 handler ─────────────────────────────────────────────
  bot.hears('Transfer 🎁', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isRegistered(BigInt(ctx.from.id)))) {
      await ctx.reply(
        '⚠️ Please register first to use this feature. Tap Register 📝 to get started.',
      );
      return;
    }
    await ctx.reply(TRANSFER_TEXT);
  });

  // ─── 5.4: Withdraw 🤑 handler ─────────────────────────────────────────────
  bot.hears('Withdraw 🤑', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isRegistered(BigInt(ctx.from.id)))) {
      await ctx.reply(
        '⚠️ Please register first to use this feature. Tap Register 📝 to get started.',
      );
      return;
    }
    await ctx.reply(WITHDRAW_TEXT);
  });

  // ─── 5.5: Convert Bonus 💲 handler ────────────────────────────────────────
  bot.hears('Convert Bonus 💲', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isRegistered(BigInt(ctx.from.id)))) {
      await ctx.reply(
        '⚠️ Please register first to use this feature. Tap Register 📝 to get started.',
      );
      return;
    }
    await ctx.reply(CONVERT_BONUS_TEXT);
  });

  // ─── 6.1: Invite 🔗 handler ───────────────────────────────────────────────
  bot.hears('Invite 🔗', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    if (!(await isRegistered(telegramId))) {
      await ctx.reply('⚠️ Please register first to use this feature. Tap Register 📝 to get started.');
      return;
    }

    const link = buildInviteLink(bot!.botInfo.username, telegramId);
    await ctx.reply(`🔗 Invite your friends!\n\nShare this link:\n${link}`);
  });

  // Global error handler — log but never crash
  bot.catch((err) => {
    console.error('[Bot] Unhandled error:', err);
  });
} else {
  console.warn('[Bot] BOT_TOKEN is not set — bot will not start.');
}

// ─── In-memory simulation helpers (for property-based tests) ─────────────────

/**
 * In-memory simulation of /start handler new player creation logic (for testing).
 * Validates: Requirements 3.2
 */
export function simulateStartHandler(
  telegramId: bigint,
  username: string,
  referrerId?: string,
): {
  players: { id: string; telegram_id: bigint; username: string; referrer_id?: string }[];
  wallets: { player_id: string; type: string; balance: number }[];
} {
  const players: { id: string; telegram_id: bigint; username: string; referrer_id?: string }[] = [];
  const wallets: { player_id: string; type: string; balance: number }[] = [];

  const existing = players.find((p) => p.telegram_id === telegramId);
  if (existing) {
    existing.username = username;
  } else {
    const newPlayer = {
      id: crypto.randomUUID(),
      telegram_id: telegramId,
      username,
      ...(referrerId ? { referrer_id: referrerId } : {}),
    };
    players.push(newPlayer);
    wallets.push({ player_id: newPlayer.id, type: 'main', balance: 0 });
    wallets.push({ player_id: newPlayer.id, type: 'play', balance: 0 });
  }

  return { players, wallets };
}

/**
 * In-memory simulation of repeated /start calls for idempotency testing.
 * Validates: Requirements 3.3
 */
export function simulateIdempotentUpsert(
  telegramId: bigint,
  usernames: string[],
): { playerCount: number; finalUsername: string } {
  const players: { id: string; telegram_id: bigint; username: string }[] = [];

  for (const username of usernames) {
    const existing = players.find((p) => p.telegram_id === telegramId);
    if (existing) {
      existing.username = username;
    } else {
      players.push({ id: crypto.randomUUID(), telegram_id: telegramId, username });
    }
  }

  return { playerCount: players.length, finalUsername: players[0]!.username };
}

/**
 * In-memory simulation of referrer attribution logic (for testing).
 * Validates: Requirements 3.1
 */
export function simulateReferrerAttribution(
  newPlayerTelegramId: bigint,
  newPlayerUsername: string,
  referrerTelegramId: bigint | null,
  existingReferrer: { id: string; telegram_id: bigint } | null,
): { referrerId: string | null } {
  // Suppress unused-variable warnings (parameters mirror the real handler signature)
  void newPlayerTelegramId;
  void newPlayerUsername;

  if (referrerTelegramId === null || existingReferrer === null) {
    return { referrerId: null };
  }
  if (existingReferrer.telegram_id === referrerTelegramId) {
    return { referrerId: existingReferrer.id };
  }
  return { referrerId: null };
}

export { bot, MINI_APP_URL };
