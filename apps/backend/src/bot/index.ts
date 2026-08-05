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

/**
 * Fetches the player with their wallets in a single DB query.
 * Returns null if not found or not registered.
 */
async function getRegisteredPlayerWithWallets(telegramId: bigint) {
  return prisma.player.findFirst({
    where: { telegram_id: telegramId, phone_verified: true },
    select: {
      id: true,
      username: true,
      wallets: { select: { id: true, type: true, balance: true } },
    },
  });
}

// ─── Helper: Play button — inline keyboard with web_app button ───────────────

/**
 * Builds an InlineKeyboard with a single web_app button for the Play handler.
 */
export function buildPlayReplyMarkup(miniAppUrl: string): InlineKeyboard {
  return new InlineKeyboard().webApp('Open Beteseb Bingo', miniAppUrl);
}

// ─── Helper: Register button prompt text ─────────────────────────────────────

export const REGISTER_PROMPT_TEXT =
  '📱 Please share your phone number to register.\n\nTap the button below to send your contact.';

// ─── Static reply text constants ─────────────────────────────────────────────

/**
 * Builds the deposit step-2 message: shows the Telebirr number and amount,
 * then asks the player to paste the receipt.
 * Requirements: 2.1, 2.2, 2.3
 */
export async function buildDepositInstructionText(amount: number): Promise<{ text: string; telebirrNumber: string }> {
  const config = await prisma.config.findUnique({
    where: { key: 'deposit_telebirr_number' },
  });
  const telebirrNumber = config?.value ?? 'N/A (contact support)';

  const text =
    `የሚያጋጥማቹ የካፍያ ችግር:\n` +
    `@betesebbingosupport ላይ ፃፉን።\n\n` +
    `1. ከታቹ ባለው የቴሌብር አካውንት ${amount} ብር ያስገቡ\n\n` +
    `   Phone: ${telebirrNumber}\n\n` +
    `2. የካፈሉትን አጭር የደሁፍ መልዕክት(message) copy በማድረግ እዚ ላይ Past አድርገው ያስጉና ይላኩት 👇👇👇`;

  return { text, telebirrNumber };
}

// Keep legacy export for any existing callers
export async function buildDepositText(): Promise<string> {
  const { text } = await buildDepositInstructionText(0);
  return text;
}

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

// ─── Deposit conversation state ───────────────────────────────────────────────
// Tracks players mid-deposit: waiting for amount or waiting for receipt paste.

type DepositState =
  | { step: 'awaiting_amount' }
  | { step: 'awaiting_receipt'; amount: number; telebirrNumber: string };

const depositSessions = new Map<bigint, DepositState>();

/**
 * Parses a Telebirr SMS receipt text and extracts the transaction number.
 * Telebirr receipts contain "Your transaction number is <TX>."
 * Returns null if the pattern is not found.
 */
export function parseTelebirrReceipt(text: string): string | null {
  const match = text.match(/Your transaction number is ([A-Z0-9]+)/i);
  return match?.[1] ?? null;
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
    if (!ctx.from) return;
    if (!(await isRegistered(BigInt(ctx.from.id)))) {
      await ctx.reply(
        '⚠️ Please register first to play. Tap Register 📝 to get started.',
      );
      return;
    }
    await ctx.reply('🎮 Let\'s play!', {
      reply_markup: buildPlayReplyMarkup(MINI_APP_URL),
    });
  });

  // ─── 4.2: Register 📝 handler ─────────────────────────────────────────────
  bot.hears('Register 📝', async (ctx) => {
    if (!ctx.from) return;

    // Check if already registered
    if (await isRegistered(BigInt(ctx.from.id))) {
      await ctx.reply('✅ You are already registered!', { reply_markup: buildMainMenu() });
      return;
    }

    // Send a keyboard with a "Share Contact" button to collect phone number
    await ctx.reply(
      '📱 To register, please share your phone number by tapping the button below.',
      {
        reply_markup: new Keyboard()
          .requestContact('📲 Share Phone Number')
          .resized()
          .oneTime(),
      },
    );
  });

  // ─── Contact handler — receives phone number after Register ───────────────
  bot.on('message:contact', async (ctx) => {
    if (!ctx.from) return;
    const contact = ctx.message.contact;

    // Only accept the user's own contact
    if (contact.user_id !== ctx.from.id) {
      await ctx.reply('⚠️ Please share your own phone number.');
      return;
    }

    const telegramId = BigInt(ctx.from.id);
    const phone = contact.phone_number;

    try {
      // Find the player with their play wallet in a single query
      const player = await prisma.player.findUnique({
        where: { telegram_id: telegramId },
        select: {
          id: true,
          username: true,
          phone_verified: true,
          wallets: {
            where: { type: 'play' },
            select: { id: true },
          },
        },
      });

      if (!player) {
        await ctx.reply('⚠️ Please send /start first, then try registering again.');
        return;
      }

      if (player.phone_verified) {
        await ctx.reply('✅ You are already registered!', { reply_markup: buildMainMenu() });
        return;
      }

      const playWalletId = player.wallets[0]?.id;
      if (!playWalletId) {
        await ctx.reply('Something went wrong during registration. Please try again.');
        return;
      }

      // Run all DB updates in parallel inside a transaction
      await prisma.$transaction([
        prisma.player.update({
          where: { telegram_id: telegramId },
          data: { phone, phone_verified: true },
        }),
        prisma.wallet.update({
          where: { id: playWalletId },
          data: { balance: { increment: 20 } },
        }),
        prisma.transaction.create({
          data: {
            wallet_id: playWalletId,
            type: 'admin_credit',
            amount: 20,
            note: 'Welcome bonus',
          },
        }),
      ]);

      await ctx.reply(
        `✅ Registration successful!\n\nWelcome to Fidel Bingo, ${player.username}! 🎉\n\n🎁 You have received a 20 ETB welcome bonus in your play wallet!\n\nTap Play 🎮 to start playing.`,
        { reply_markup: buildMainMenu() },
      );
    } catch (err) {
      console.error('[Bot] Registration error:', err);
      await ctx.reply('Something went wrong during registration. Please try again.');
    }
  });

  // ─── 4.3: Check Balance 💰 handler ────────────────────────────────────────
  bot.hears('Check Balance 💰', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    // Single query: check registration + fetch wallets together
    const player = await getRegisteredPlayerWithWallets(telegramId);
    if (!player) {
      await ctx.reply(
        '⚠️ Please register first to use this feature. Tap Register 📝 to get started.',
      );
      return;
    }

    const mainWallet = player.wallets.find((w) => w.type === 'main');
    const playWallet = player.wallets.find((w) => w.type === 'play');
    const mainBalance = mainWallet?.balance.toString() ?? '0';
    const playBalance = playWallet?.balance.toString() ?? '0';

    await ctx.reply(formatBalanceReply(mainBalance, playBalance));
  });

  // ─── 4.4: Contact Support 📞 handler ──────────────────────────────────────
  bot.hears('Contact Support 📞', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    // Run both queries in parallel
    const [player, config] = await Promise.all([
      prisma.player.findFirst({
        where: { telegram_id: telegramId, phone_verified: true },
        select: { id: true },
      }),
      prisma.config.findUnique({ where: { key: 'support_contact' } }),
    ]);

    if (!player) {
      await ctx.reply(
        '⚠️ Please register first to use this feature. Tap Register 📝 to get started.',
      );
      return;
    }

    if (config) {
      await ctx.reply(formatSupportReply(config.value));
    } else {
      await ctx.reply('Support contact is not configured. Please try again later.');
    }
  });

  // ─── 5.1: /deposit command + Deposit 💰 button handler ──────────────────────

  async function handleDepositStart(ctx: { from?: { id: number }; reply: (text: string) => Promise<unknown> }) {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    if (!(await isRegistered(telegramId))) {
      await ctx.reply('⚠️ Please register first to use this feature. Tap Register 📝 to get started.');
      return;
    }
    depositSessions.set(telegramId, { step: 'awaiting_amount' });
    await ctx.reply('💰 ማስገባት የሚፈልጉትን መጠን ከ10 ብር ጀምሮ ያስጊቡ።');
  }

  bot.command('deposit', handleDepositStart);

  bot.hears('Deposit 💰', handleDepositStart);

  // ─── Deposit conversation — handle amount input and receipt paste ────────────
  bot.on('message:text', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    const text = ctx.message.text.trim();

    // Ignore bot commands — they have their own handlers
    if (text.startsWith('/')) return;

    const session = depositSessions.get(telegramId);
    if (!session) return;

    // ── Step 1: awaiting amount ───────────────────────────────────────────────
    if (session.step === 'awaiting_amount') {
      const amount = Number(text);
      if (!Number.isFinite(amount) || amount < 10) {
        await ctx.reply('⚠️ እባክዎ ትክክለኛ መጠን (ከ10 ብር ጀምሮ) ያስጊቡ።');
        return;
      }

      const { text: instructionText, telebirrNumber } = await buildDepositInstructionText(amount);
      depositSessions.set(telegramId, { step: 'awaiting_receipt', amount, telebirrNumber });
      await ctx.reply(instructionText);
      return;
    }

    // ── Step 2: awaiting receipt paste ────────────────────────────────────────
    if (session.step === 'awaiting_receipt') {
      const txNumber = parseTelebirrReceipt(text);
      if (!txNumber) {
        await ctx.reply('⚠️ ደረሰኙን ማግኘት አልተቻለም። እባክዎ የቴሌብር ደረሰኝ SMS ን ሙሉ በሙሉ ይለጥፉ።');
        return;
      }

      const player = await getRegisteredPlayerWithWallets(telegramId);
      if (!player) {
        depositSessions.delete(telegramId);
        await ctx.reply('⚠️ Please register first. Tap Register 📝 to get started.');
        return;
      }

      try {
        const deposit = await prisma.pendingDeposit.findUnique({ where: { tx_number: txNumber } });

        if (!deposit) {
          await ctx.reply('❌ Transaction number not found. Please contact support.');
          depositSessions.delete(telegramId);
          return;
        }
        if (deposit.status === 'claimed') {
          await ctx.reply('❌ This transaction has already been used. Please contact support.');
          depositSessions.delete(telegramId);
          return;
        }
        if (deposit.status === 'cancelled') {
          await ctx.reply('❌ This transaction has been cancelled. Please contact support.');
          depositSessions.delete(telegramId);
          return;
        }

        const amount = Number(deposit.amount);

        await prisma.$transaction(async (tx) => {
          await tx.pendingDeposit.update({
            where: { id: deposit.id },
            data: { status: 'claimed', player_id: player.id, claimed_at: new Date() },
          });

          const wallet = await tx.wallet.findUniqueOrThrow({
            where: { player_id_type: { player_id: player.id, type: 'main' } },
          });

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: amount } },
          });

          await tx.transaction.create({
            data: { wallet_id: wallet.id, type: 'deposit', amount, reference_id: txNumber },
          });
        });

        depositSessions.delete(telegramId);

        await ctx.reply(`✅ Your deposit of ${amount} ETB is Approved.\n\nRef: ${txNumber}`);
      } catch (err) {
        console.error('[Bot] deposit receipt handler error:', err);
        await ctx.reply('❌ Something went wrong. Please try again later or contact support.');
      }
    }
  });

  // ─── /txn command handler — deposit auto-verification ─────────────────────
  // Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2, 4.3
  bot.command('txn', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    // Guard: player must be registered
    const player = await getRegisteredPlayerWithWallets(telegramId);
    if (!player) {
      await ctx.reply(
        '⚠️ Please register first to use this feature. Tap Register 📝 to get started.',
      );
      return;
    }

    // Parse transaction number from command argument
    const txNumber = (ctx.match as string)?.trim();
    if (!txNumber) {
      await ctx.reply(
        '⚠️ Please provide a transaction number.\nUsage: /txn <transaction_number>\nExample: /txn TXN123456',
      );
      return;
    }

    try {
      // Look up PendingDeposit by tx_number (any status) so we can give a
      // meaningful response for already-claimed records too.
      const deposit = await prisma.pendingDeposit.findUnique({
        where: { tx_number: txNumber },
      });

      if (!deposit) {
        await ctx.reply(
          '❌ Transaction number not found. Please contact support.',
        );
        return;
      }

      if (deposit.status === 'claimed') {
        await ctx.reply(
          '❌ This transaction has already been used. Please contact support.',
        );
        return;
      }

      if (deposit.status === 'cancelled') {
        await ctx.reply(
          '❌ This transaction has been cancelled. Please contact support.',
        );
        return;
      }

      // deposit.status === 'pending' — proceed with atomic claim + credit
      const amount = Number(deposit.amount);

      await prisma.$transaction(async (tx) => {
        // Mark deposit as claimed
        await tx.pendingDeposit.update({
          where: { id: deposit.id },
          data: {
            status: 'claimed',
            player_id: player.id,
            claimed_at: new Date(),
          },
        });

        // Credit player's Main_Wallet — WalletService.credit handles its own
        // internal transaction; here we replicate the credit inside our outer
        // transaction so it's fully atomic.
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: { player_id_type: { player_id: player.id, type: 'main' } },
        });

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } },
        });

        await tx.transaction.create({
          data: {
            wallet_id: wallet.id,
            type: 'deposit',
            amount,
            reference_id: txNumber,
          },
        });
      });

      // Fetch updated main wallet balance for the reply
      const updatedWallet = await prisma.wallet.findUnique({
        where: { player_id_type: { player_id: player.id, type: 'main' } },
        select: { balance: true },
      });
      const newBalance = updatedWallet?.balance.toString() ?? '0';

      await ctx.reply(
        `✅ Deposit successful!\n\nCredited: ETB ${amount}\nMain Wallet Balance: ETB ${newBalance}`,
      );
    } catch (err) {
      console.error('[Bot] /txn handler error:', err);
      await ctx.reply(
        '❌ Something went wrong while processing your transaction. Please try again later or contact support.',
      );
      // PendingDeposit remains `pending` so the player can retry
    }
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

    const link = buildInviteLink(ctx.me.username, telegramId);
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
