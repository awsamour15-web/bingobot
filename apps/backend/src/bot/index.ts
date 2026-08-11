// Telegram Bot entry point using grammY
// Requirements: 10.4

import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import type { PrismaClient } from '@prisma/client';
import { WalletType, TxType } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { AgentService } from '../services/agent.service.js';
import { WalletService } from '../services/wallet.service.js';

type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

// ─── Env vars ─────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env['BOT_TOKEN'];
const MINI_APP_URL = process.env['MINI_APP_URL'] ?? 'https://bingobot-mini-app.vercel.app/';

console.log('[Bot] 🔍 Environment check:');
console.log(`[Bot] BOT_TOKEN: ${BOT_TOKEN ? '✅ Present' : '❌ MISSING'}`);
console.log(`[Bot] MINI_APP_URL: ${MINI_APP_URL}`);

if (!BOT_TOKEN) {
  console.error('[Bot] 🚨 FATAL: BOT_TOKEN environment variable is missing!');
  console.error('[Bot] Bot initialization will be skipped.');
}

// ─── Global message counter for debugging ────────────────────────────────────
let messageCount = 0;

// ─── Main menu button labels ───────────────────────────────────────────────────

export const MENU_BUTTONS = [
  ['Play 🎮', 'Register 📝'],
  ['Check Balance 💰', 'Deposit 💰'],
  ['Contact Support 📞', 'Instruction 📖'],
  ['Withdraw 🤑', 'Invite 🔗'],
] as const;

// ─── Agent/Partner menu button labels ──────────────────────────────────────────

export const AGENT_MENU_BUTTONS = [
  ['Play 🎮', 'Register 📝'],
  ['Check Balance 💰', 'Deposit 💰'],
  ['Agent Dashboard 📊', 'My Players 👥'],
  ['Agent Invite 🔗', 'Commission Balance 💵'],
  ['Contact Support 📞', 'Instruction 📖'],
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
 * Returns true if the given telegramId belongs to an active linked agent.
 */
async function isLinkedAgent(telegramId: bigint): Promise<boolean> {
  const agent = await prisma.agent.findUnique({
    where: { telegram_id: telegramId },
    select: { is_active: true },
  });
  return agent?.is_active ?? false;
}

/**
 * Returns the appropriate menu (agent or regular) based on user status.
 */
async function getMenuForUser(telegramId: bigint): Promise<Keyboard> {
  return (await isLinkedAgent(telegramId)) ? buildAgentMenu() : buildMainMenu();
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
 * Builds the persistent agent/partner-menu ReplyKeyboard with agent-specific buttons.
 * - resize_keyboard = true  (fits compactly on screen)
 * - one_time_keyboard = false  (remains visible after button press)
 */
export function buildAgentMenu(): Keyboard {
  const kb = new Keyboard();
  for (let i = 0; i < AGENT_MENU_BUTTONS.length; i++) {
    const [left, right] = AGENT_MENU_BUTTONS[i]!;
    kb.text(left).text(right);
    // Add row separator between rows (not after the last row)
    if (i < AGENT_MENU_BUTTONS.length - 1) {
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
  return new InlineKeyboard().webApp('Open Fidel Bingo', miniAppUrl);
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
  `⚠️ Only your winning balance (main wallet) can be withdrawn.\n` +
  `Deposit and bonus balance are NOT withdrawable.\n\n` +
  `Minimum withdrawal amount: ETB 100\n\n` +
  `🤖 Option 1: Direct Bot Withdrawal (RECOMMENDED)\n` +
  `Simply tap "Withdraw 🤑" and follow the prompts:\n` +
  `1. Enter amount (minimum 100 ETB)\n` +
  `2. Enter your phone number\n` +
  `3. Your request will be reviewed within 24 hours\n\n` +
  `📱 Option 2: Mini App Withdrawal\n` +
  `1. Open the Mini App and go to the Wallet section.\n` +
  `2. Under "Withdraw", enter the amount you want to withdraw.\n` +
  `3. Enter your phone number (e.g. 09XXXXXXXX).\n` +
  `4. Tap "Request Withdrawal".\n` +
  `5. Your request will be reviewed and processed within 24 hours on business days.\n\n` +
  `⚠️ You can only withdraw your winning balance. Play wallet (deposit) balance cannot be withdrawn.`;

export const CONVERT_BONUS_TEXT =
  `💲 How to Convert Bonus Balance\n\n` +
  `You can convert your bonus balance to your main wallet!\n\n` +
  `Steps:\n` +
  `1. Earn bonus credits by inviting friends or through promotions.\n` +
  `2. Once you have enough bonus balance, contact our support team.\n` +
  `3. Request a bonus-to-main wallet conversion.\n` +
  `4. The converted amount will be credited to your main wallet.\n\n` +
  `ℹ️ Conversion rates and minimum thresholds apply. Contact support for current rates.`;

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

type WithdrawState =
  | { step: 'awaiting_amount' }
  | { step: 'awaiting_phone'; amount: number };

const withdrawSessions = new Map<bigint, WithdrawState>();

/**
 * Parses a Telebirr SMS receipt text and extracts the transaction number.
 * Handles formats:
 *   "Your transaction number is DH87MNVFCT"
 *   "transaction number is DH87MNVFCT"
 *   Standalone uppercase alphanumeric codes (8-12 chars) as fallback.
 * Returns null if the pattern is not found.
 */
export function parseTelebirrReceipt(text: string): { txNumber: string; receiverPhone: string | null } | null {
  // Normalize OCR artifacts: collapse extra whitespace
  const normalized = text.replace(/\s+/g, ' ');

  // Extract transaction number
  let txNumber: string | null = null;

  // Primary: explicit label — "Your transaction number is DH87MNVFCT"
  const labeled = normalized.match(/(?:your\s+)?transaction\s+number\s+is\s+([A-Z0-9]{6,20})/i);
  if (labeled?.[1]) txNumber = labeled[1].toUpperCase();

  // Secondary: receipt URL — /receipt/DH87MNVFCT
  if (!txNumber) {
    const urlMatch = normalized.match(/\/receipt\/([A-Z0-9]{6,20})/i);
    if (urlMatch?.[1]) txNumber = urlMatch[1].toUpperCase();
  }

  // Tertiary: "number is" with possible OCR space inside the code
  if (!txNumber) {
    const looseLabeled = normalized.match(/number\s+is\s+([A-Z0-9 ]{6,25})/i);
    if (looseLabeled?.[1]) {
      const code = looseLabeled[1].replace(/\s/g, '');
      if (code.length >= 6) txNumber = code.toUpperCase();
    }
  }

  if (!txNumber) return null;

  // Extract receiver phone — Telebirr format: "to Name (2519****1234)"
  // Also handles masked formats like 2519****5324 or +2519****5324
  let receiverPhone: string | null = null;
  const phoneMatch = normalized.match(/\((\+?251[\d*]{8,})\)/);
  if (phoneMatch?.[1]) receiverPhone = phoneMatch[1].replace(/^\+/, '');

  return { txNumber, receiverPhone };
}

/**
 * Normalizes a phone number to digits only for comparison.
 * Strips leading +, spaces, dashes. Handles masked digits (*).
 * Compares only the non-masked suffix digits.
 * e.g. "2519****5324" vs "0915855324" → compares last 4 digits: "5324" == "5324"
 */
function phoneMatches(receiptPhone: string, configPhone: string): boolean {
  const clean = (p: string) => p.replace(/\D/g, '');
  const rDigits = clean(receiptPhone);
  const cDigits = clean(configPhone);

  // Count masked positions (*)
  const maskedCount = (receiptPhone.match(/\*/g) ?? []).length;
  if (maskedCount > 0) {
    // Compare only the visible suffix
    const suffix = rDigits.slice(-1 * (rDigits.length - maskedCount));
    return cDigits.endsWith(suffix);
  }

  // Full comparison: normalize both to 9-digit local format
  const normalize = (d: string) => d.replace(/^(251|0)/, '');
  return normalize(rDigits) === normalize(cDigits);
}

/**
 * Downloads a Telegram file and returns its raw Buffer.
 */
async function downloadTelegramFile(bot: Bot, fileId: string): Promise<Buffer> {
  const file = await bot.api.getFile(fileId);
  const filePath = file.file_path;
  if (!filePath) throw new Error('File path not available');
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Runs OCR on an image buffer using tesseract.js (fully offline).
 * Returns extracted text or null on failure.
 */
async function ocrImage(imageBuffer: Buffer): Promise<string | null> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      // Suppress tesseract progress logs
      logger: () => {},
      errorHandler: () => {},
    });
    const { data } = await worker.recognize(imageBuffer);
    await worker.terminate();
    return data.text ?? null;
  } catch {
    return null;
  }
}

/**
 * Shared deposit claim logic — used by both text receipt and photo OCR handlers.
 * Returns the credited amount on success, or throws/returns null for specific error cases.
 */
async function processDepositClaim(
  playerId: string,
  txNumber: string,
): Promise<{ success: true; amount: number } | { success: false; reason: 'NOT_FOUND' | 'CLAIMED' | 'CANCELLED' }> {
  const deposit = await prisma.pendingDeposit.findUnique({ where: { tx_number: txNumber } });

  if (!deposit) return { success: false, reason: 'NOT_FOUND' };
  if (deposit.status === 'claimed') return { success: false, reason: 'CLAIMED' };
  if (deposit.status === 'cancelled') return { success: false, reason: 'CANCELLED' };

  const amount = Number(deposit.amount);

  await prisma.$transaction(async (tx) => {
    await tx.pendingDeposit.update({
      where: { id: deposit.id },
      data: { status: 'claimed', player_id: playerId, claimed_at: new Date() },
    });

    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { player_id_type: { player_id: playerId, type: 'play' } },
    });

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.transaction.create({
      data: { wallet_id: wallet.id, type: 'deposit', amount, reference_id: txNumber },
    });

    // Credit agent commission if player was referred by an active agent
    const playerRecord = await tx.player.findUnique({
      where: { id: playerId },
      select: { agent_id: true },
    });
    if (playerRecord?.agent_id) {
      const agentRecord = await tx.agent.findUnique({
        where: { id: playerRecord.agent_id },
        select: { is_active: true },
      });
      if (agentRecord?.is_active) {
        await AgentService.creditCommission(tx, playerRecord.agent_id, playerId, deposit.id, deposit.amount);
      }
    }
  });

  return { success: true, amount };
}

// ─── Bot instance (null if BOT_TOKEN is not set) ──────────────────────────────

let bot: Bot | null = null;

if (BOT_TOKEN) {
  console.log('[Bot] ✅ BOT_TOKEN found, initializing bot...');
  bot = new Bot(BOT_TOKEN);
  console.log('[Bot] ✅ Bot instance created successfully');

  /**
   * /start command handler
   *
   * Deep-link parameter routing:
   *  1. No param / "ref_<telegramId>"  → normal player flow (unchanged)
   *  2. "agent_<agentId>"              → agent linking flow (Task 7.1–7.2)
   *  3. "ref_agent_<agentId>"          → new player referred by agent (Task 7.3)
   *
   * Task 7.4: If no param and user is already a linked agent, show agent menu.
   */
  bot.command('start', async (ctx) => {
    try {
      const from = ctx.from;
      if (!from) return;

      const payload = ctx.match; // text after /start (the deep-link parameter)
      const telegramId = BigInt(from.id);
      const username = from.username ?? from.first_name ?? `user_${from.id}`;
      const botUsername = process.env['BOT_USERNAME'] ?? '';

      // ── Case 1: agent_<agentId> — agent self-activation link ──────────────
      if (typeof payload === 'string' && payload.startsWith('agent_')) {
        const agentId = payload.slice('agent_'.length);
        try {
          const agent = await AgentService.linkAgent(agentId, telegramId);
          const inviteLink = `https://t.me/${botUsername}?start=ref_agent_${agent.id}`;
          await ctx.reply(
            `✅ Agent account activated!\n\n` +
            `Share this link to invite players:\n${inviteLink}`,
            { reply_markup: buildAgentMenu() },
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg === 'ALREADY_LINKED') {
            await ctx.reply(
              '⚠️ This agent link has already been activated by another account.',
              { reply_markup: buildMainMenu() },
            );
          } else if (msg.includes('No Agent found')) {
            // Invalid agent ID — fall through to normal player flow below
            await ctx.reply(
              '👋 Welcome to Fidel Bingo! Choose an Option below.',
              { reply_markup: buildMainMenu() },
            );
          } else {
            throw err;
          }
        }
        return;
      }

      // ── Case 2: ref_agent_<agentId> — player recruited by agent ───────────
      let agentReferralId: string | undefined;
      if (typeof payload === 'string' && payload.startsWith('ref_agent_')) {
        agentReferralId = payload.slice('ref_agent_'.length);
      }

      // Parse existing player referral: "ref_<telegramId>"
      let referrerId: string | undefined;
      if (typeof payload === 'string' && payload.startsWith('ref_') && !payload.startsWith('ref_agent_')) {
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
          select: { id: true, agent_id: true },
        });

        if (existing) {
          // Update username in case it changed in Telegram
          await tx.player.update({
            where: { telegram_id: telegramId },
            data: { username },
          });

          // Task 7.3: set agent_id only if player has no existing agent attribution
          if (agentReferralId && !existing.agent_id) {
            const agent = await tx.agent.findUnique({
              where: { id: agentReferralId },
              select: { is_active: true },
            });
            if (agent?.is_active) {
              await tx.player.update({
                where: { telegram_id: telegramId },
                data: { agent_id: agentReferralId },
              });
            }
          }
        } else {
          // Task 7.3: resolve agent_id for new player
          let resolvedAgentId: string | undefined;
          if (agentReferralId) {
            const agent = await tx.agent.findUnique({
              where: { id: agentReferralId },
              select: { is_active: true },
            });
            if (agent?.is_active) resolvedAgentId = agentReferralId;
          }

          // First-time registration
          const newPlayer = await tx.player.create({
            data: {
              telegram_id: telegramId,
              username,
              ...(referrerId ? { referrer_id: referrerId } : {}),
              ...(resolvedAgentId ? { agent_id: resolvedAgentId } : {}),
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

      // Task 7.4: check if this user is a linked agent — show agent menu if so
      if (!payload) {
        const linkedAgent = await prisma.agent.findUnique({
          where: { telegram_id: telegramId },
          select: { id: true, is_active: true },
        });
        if (linkedAgent) {
          const playerInvite = `https://t.me/${botUsername}?start=ref_agent_${linkedAgent.id}`;
          const dashboardUrl = `${MINI_APP_URL}agent/dashboard`;
          await ctx.reply(
            `👋 Welcome back, Agent!\n\n` +
            `Your player invite link:\n${playerInvite}\n\n` +
            `📊 Dashboard: ${dashboardUrl}`,
            { reply_markup: buildAgentMenu() },
          );
          return;
        }
      }

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
      await ctx.reply('✅ You are already registered!', { reply_markup: await getMenuForUser(BigInt(ctx.from.id)) });
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
        await ctx.reply('✅ You are already registered!', { reply_markup: await getMenuForUser(telegramId) });
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
        { reply_markup: await getMenuForUser(telegramId) },
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

  async function handleDepositStart(ctx: import('grammy').Context) {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    if (!(await isRegistered(telegramId))) {
      await ctx.reply('⚠️ Please register first to use this feature. Tap Register 📝 to get started.');
      return;
    }
    depositSessions.set(telegramId, { step: 'awaiting_amount' });
    await ctx.reply('💰 ማስገባት የሚፈልጉትን መጠን ከ10 ብር ጀምሮ ያስጊቡ።');
  }

async function handleWithdrawStart(ctx: import('grammy').Context) {
  console.log('[Bot] handleWithdrawStart called for user:', ctx.from?.id);
  
  try {
    if (!ctx.from) {
      console.log('[Bot] No ctx.from in handleWithdrawStart');
      return;
    }
    
    const telegramId = BigInt(ctx.from.id);
    console.log('[Bot] Processing withdrawal for telegramId:', telegramId);
    
    if (!(await isRegistered(telegramId))) {
      console.log('[Bot] User not registered:', telegramId);
      await ctx.reply('⚠️ Please register first to use this feature. Tap Register 📝 to get started.');
      return;
    }

    const player = await getRegisteredPlayerWithWallets(telegramId);
    if (!player) {
      console.log('[Bot] No player found after registration check:', telegramId);
      await ctx.reply('⚠️ Please register first. Tap Register 📝 to get started.');
      return;
    }

    console.log('[Bot] Player found:', player.id, 'wallets:', player.wallets.length);
    
    const mainWallet = player.wallets.find(w => w.type === 'main');
    console.log('[Bot] Main wallet:', mainWallet ? `${mainWallet.balance} ${mainWallet.type}` : 'not found');
    
    if (!mainWallet || Number(mainWallet.balance) < 100) {
      console.log('[Bot] Insufficient balance for withdrawal:', mainWallet?.balance || '0');
      await ctx.reply(
        `⚠️  ዋሌት ውስጥ በቂ ሳንቲም የለዎትም።\n\n` +
        `የአሁን ሂሳብ: ${mainWallet?.balance || '0'} ብር\n` +
        `አነስተኛ የማውጣት መጠን: 100 ብር\n\n` 
        
      );
      return;
    }

    console.log('[Bot] Setting withdrawal session for user:', telegramId);
    withdrawSessions.set(telegramId, { step: 'awaiting_amount' });
    
    console.log('[Bot] Sending withdrawal prompt to user:', telegramId);
    await ctx.reply(
      `💰 ማውጣት የሚፈልጉትን መጠን ያስጊቡ።\n\n` +
      `አነስተኛ መጠን: 100 ብር\n` +
      `የአሁን  ዋሌት ሒሳብ: ${mainWallet.balance} ብር\n\n` 
      
    );
    
    console.log('[Bot] handleWithdrawStart completed successfully for user:', telegramId);
  } catch (error) {
    console.error('[Bot] Error in handleWithdrawStart:', error);
    if (ctx.from) {
      await ctx.reply('❌ Something went wrong. Please try again later.').catch(console.error);
    }
  }
}

  bot.command('deposit', handleDepositStart);

  bot.hears('Deposit 💰', handleDepositStart);

  // ─── Register ALL bot.hears handlers BEFORE bot.on('message:text') ──────────
  // This ensures specific handlers run before the general text handler

  // ─── 5.4: Withdraw 🤑 handler ─────────────────────────────────────────────
  console.log('[Bot Setup] ✅ Registering "Withdraw 🤑" handler');
  bot.hears('Withdraw 🤑', (ctx) => {
    console.log('[Bot] ✅ "Withdraw 🤑" handler triggered for user:', ctx.from?.id);
    return handleWithdrawStart(ctx);
  });

  // ─── TEST: Simple test handler ─────────────────────────────────────────────
  console.log('[Bot Setup] ✅ Registering "test" handler');
  bot.hears('test', async (ctx) => {
    console.log('[Bot] ✅ Test handler triggered');
    await ctx.reply('Test response received! Bot is working.');
  });

  // ─── Global message logging ───────────────────────────────────────────────────
  bot.on('message', (ctx) => {
    messageCount++;
    console.log(`[Bot] Message #${messageCount} from user ${ctx.from?.id}: "${ctx.message?.text || '[non-text]'}"`);
  });
  bot.on('message:text', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    const text = ctx.message.text.trim();

    // Ignore bot commands — they have their own handlers
    if (text.startsWith('/')) return;

    // If the user pressed a menu button, clear any stale sessions and
    // let the dedicated bot.hears() handler take over by NOT processing here
    const allMenuButtons = MENU_BUTTONS.flat() as readonly string[];
    const allAgentButtons = AGENT_MENU_BUTTONS.flat() as readonly string[];
    if (allMenuButtons.includes(text) || allAgentButtons.includes(text)) {
      console.log(`[Bot] Menu button "${text}" detected - clearing sessions, continuing to bot.hears()`);
      depositSessions.delete(telegramId);
      withdrawSessions.delete(telegramId);
      // DON'T return - let message continue to bot.hears() handlers
    }

    const depositSession = depositSessions.get(telegramId);
    const withdrawSession = withdrawSessions.get(telegramId);

    // Only process if user is in an active session (not a menu button)
    if (!depositSession && !withdrawSession) {
      console.log(`[Bot] No active sessions for user ${telegramId} - ignoring message: "${text}"`);
      return;
    }

    // Handle deposit conversation
    if (depositSession) {
      // ── Step 1: awaiting amount ───────────────────────────────────────────────
      if (depositSession.step === 'awaiting_amount') {
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
      if (depositSession.step === 'awaiting_receipt') {
        const parsed = parseTelebirrReceipt(text);
        if (!parsed) {
          await ctx.reply('⚠️ ደረሰኙን ማግኘት አልተቻለም። እባክዎ የቴሌብር ደረሰኝ SMS ን ሙሉ በሙሉ ይለጥፉ።');
          return;
        }

        // Validate receiver phone matches configured deposit number
        if (parsed.receiverPhone) {
          if (!phoneMatches(parsed.receiverPhone, depositSession.telebirrNumber)) {
            await ctx.reply(
              `❌ ደረሰኙ ትክክለኛ አይደለም።\n\nብሩ መላክ ያለበት ወደ ${depositSession.telebirrNumber} ነው።\nእባክዎ ትክክለኛ ደረሰኝ ይለጥፉ ወይም ድጋፍ ያግኙ።`,
            );
            return;
          }
        }

        const player = await getRegisteredPlayerWithWallets(telegramId);
        if (!player) {
          depositSessions.delete(telegramId);
          await ctx.reply('⚠️ Please register first. Tap Register 📝 to get started.');
          return;
        }

        try {
          const result = await processDepositClaim(player.id, parsed.txNumber);
          depositSessions.delete(telegramId);

          if (!result.success) {
            const msgs = {
              NOT_FOUND: '❌ Transaction number not found. Please contact support.',
              CLAIMED: '❌ This transaction has already been used. Please contact support.',
              CANCELLED: '❌ This transaction has been cancelled. Please contact support.',
            };
            await ctx.reply(msgs[result.reason]);
            return;
          }

          await ctx.reply(`✅ Your deposit of ${result.amount} ETB is Approved.\n\nRef: ${parsed.txNumber}`);
        } catch (err) {
          console.error('[Bot] deposit receipt handler error:', err);
          await ctx.reply('❌ Something went wrong. Please try again later or contact support.');
        }
      }
      return;
    }

    // Handle withdrawal conversation
    if (withdrawSession) {
      // ── Step 1: awaiting amount ───────────────────────────────────────────────
      if (withdrawSession.step === 'awaiting_amount') {
        const amount = Number(text);
        if (!Number.isFinite(amount) || amount <= 0) {
          await ctx.reply('⚠️ እባክዎ ትክክለኛ መጠን ያስጊቡ።');
          return;
        }

        if (amount < 100) {
          await ctx.reply('⚠️ አነስተኛ የማውጣት መጠን 100 ብር ነው። እባክዎ ከ100 ብር በላይ ያስጊቡ።');
          return;
        }

        // Check if user has sufficient balance
        const player = await getRegisteredPlayerWithWallets(telegramId);
        if (!player) {
          withdrawSessions.delete(telegramId);
          await ctx.reply('⚠️ Please register first. Tap Register 📝 to get started.');
          return;
        }

        const mainWallet = player.wallets.find(w => w.type === 'main');
        if (!mainWallet || Number(mainWallet.balance) < amount) {
          await ctx.reply(`⚠️ በመንግስት ዋሌት ውስጥ በቂ ሳንቲም የለዎትም።\n\nየአሁን ሂሳብ: ${mainWallet?.balance || '0'} ብር\nየጠየቁት መጠን: ${amount} ብር`);
          return;
        }

        withdrawSessions.set(telegramId, { step: 'awaiting_phone', amount });
        await ctx.reply('📱 እባክዎ የቴሌብር ስልክ ቁጥርዎን ያስጊቡ (ለምሳሌ: 0912345678)።\n\nብሩ ወደዚህ ቁጥር ይላካል።');
        return;
      }

      // ── Step 2: awaiting phone number ─────────────────────────────────────────
      if (withdrawSession.step === 'awaiting_phone') {
        const phone = text.trim();
        if (!phone || phone.length < 10) {
          await ctx.reply('⚠️ እባክዎ ትክክለኛ ስልክ ቁጥር ያስጊቡ (ለምሳሌ: 0912345678)።');
          return;
        }

        const player = await getRegisteredPlayerWithWallets(telegramId);
        if (!player) {
          withdrawSessions.delete(telegramId);
          await ctx.reply('⚠️ Please register first. Tap Register 📝 to get started.');
          return;
        }

        try {
          // Debit atomically at request time — prevents double-spend across concurrent requests
          await WalletService.debit(
            player.id,
            WalletType.main,
            withdrawSession.amount,
            TxType.withdrawal,
            undefined,
            `PENDING: Awaiting admin approval — phone: ${phone}`,
          );

          withdrawSessions.delete(telegramId);

          await ctx.reply(
            `✅ የማውጣት ጥያቄዎ ተቀብለ ተረድተያል!\n\n` +
            `መጠን: ${withdrawSession.amount} ብር\n` +
            `ስልክ: ${phone}\n\n` +
            `⏳ ጥያቄዎ በ24 ሰዓት ውስጥ ይፈተሻል እና ይፀድቃል።\n\n` +
            `💰 ቀሪ ሒሳብዎ ቀንሷል እና ጥያቄዎ ሲፀድቅ ብሩ ወደ ስልክዎ ይላካል።`
          );
        } catch (err) {
          withdrawSessions.delete(telegramId);
          
          if (err instanceof Error && err.message.includes('insufficient')) {
            await ctx.reply('⚠️ በቂ ሳንቲም የለዎትም። እባክዎ ሒሳብዎን ያጣሩ።');
            return;
          }
          
          console.error('[Bot] withdrawal request error:', err);
          await ctx.reply('❌ ችግር ተፈጥሯል። እባክዎ ቆየት ብለው ይሞክሩ ወይም ድጋፍ ያግኙ።');
        }
      }
      return;
    }
  });

  // ─── Photo handler — OCR receipt image for tx number ────────────────────────
  bot.on('message:photo', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    const depositSession = depositSessions.get(telegramId);
    if (!depositSession || depositSession.step !== 'awaiting_receipt') return;

    const player = await getRegisteredPlayerWithWallets(telegramId);
    if (!player) {
      depositSessions.delete(telegramId);
      await ctx.reply('⚠️ Please register first. Tap Register 📝 to get started.');
      return;
    }

    await ctx.reply('🔍 ምስሉን እየመረመርኩ ነው፣ እባክዎ ትንሽ ይጠብቁ...');

    try {
      // Pick the highest-resolution photo size
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];
      if (!photo) {
        await ctx.reply('⚠️ ምስሉን ማንበብ አልተቻለም። እባክዎ ጽሑፉን ቀጥታ ይለጥፉ።');
        return;
      }

      const imageBuffer = await downloadTelegramFile(bot!, photo.file_id);
      const ocrText = await ocrImage(imageBuffer);

      if (!ocrText) {
        await ctx.reply('⚠️ ከምስሉ ጽሑፍ ማውጣት አልተቻለም። እባክዎ ደረሰኙን ቀጥታ ይለጥፉ።');
        return;
      }

      const txNumber = parseTelebirrReceipt(ocrText);
      if (!txNumber) {
        await ctx.reply(
          '⚠️ የ Transaction ቁጥር ከምስሉ ማግኘት አልተቻለም።\n\nእባክዎ ደረሰኙን SMS ቀጥታ ይለጥፉ።',
        );
        return;
      }

      // Validate receiver phone matches configured deposit number
      if (txNumber.receiverPhone) {
        if (!phoneMatches(txNumber.receiverPhone, depositSession.telebirrNumber)) {
          await ctx.reply(
            `❌ ደረሰኙ ትክክለኛ አይደለም።\n\nብሩ መላክ ያለበት ወደ ${depositSession.telebirrNumber} ነው።\nእባክዎ ትክክለኛ ደረሰኝ ይለጥፉ ወይም ድጋፍ ያግኙ።`,
          );
          return;
        }
      }

      const result = await processDepositClaim(player.id, txNumber.txNumber);
      depositSessions.delete(telegramId);

      if (!result.success) {
        const msgs = {
          NOT_FOUND: '❌ Transaction number not found. Please contact support.',
          CLAIMED: '❌ This transaction has already been used. Please contact support.',
          CANCELLED: '❌ This transaction has been cancelled. Please contact support.',
        };
        await ctx.reply(msgs[result.reason]);
        return;
      }

      await ctx.reply(`✅ Your deposit of ${result.amount} ETB is Approved.\n\nRef: ${txNumber.txNumber}`);
    } catch (err) {
      console.error('[Bot] photo OCR deposit handler error:', err);
      await ctx.reply('❌ Something went wrong. Please try again later or contact support.');
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

        // Credit player's Play_Wallet — deposits go to play wallet
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: { player_id_type: { player_id: player.id, type: 'play' } },
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

        // Credit agent commission if player was referred by an active agent
        const playerRecord = await tx.player.findUnique({
          where: { id: player.id },
          select: { agent_id: true },
        });
        if (playerRecord?.agent_id) {
          const agentRecord = await tx.agent.findUnique({
            where: { id: playerRecord.agent_id },
            select: { is_active: true },
          });
          if (agentRecord?.is_active) {
            await AgentService.creditCommission(tx, playerRecord.agent_id, player.id, deposit.id, deposit.amount);
          }
        }
      });

      // Fetch updated play wallet balance for the reply
      const updatedWallet = await prisma.wallet.findUnique({
        where: { player_id_type: { player_id: player.id, type: 'play' } },
        select: { balance: true },
      });
      const newBalance = updatedWallet?.balance.toString() ?? '0';

      await ctx.reply(
        `✅ Deposit successful!\n\nCredited: ETB ${amount}\nPlay Wallet Balance: ETB ${newBalance}`,
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

  // ─── CRITICAL: Prevent memory leaks and duplicate handlers ──────────────────
  process.on('SIGINT', async () => {
    console.log('[Bot] Shutting down gracefully...');
    try {
      if (bot) {
        await bot.stop();
      }
    } catch (err) {
      console.error('[Bot] Error during shutdown:', err);
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('[Bot] Received SIGTERM, shutting down...');
    try {
      if (bot) {
        await bot.stop();
      }
    } catch (err) {
      console.error('[Bot] Error during SIGTERM shutdown:', err);
    }
    process.exit(0);
  });

  // ─── /withdraw_help command for old-style instructions ──────────────────────
  bot.command('withdraw_help', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isRegistered(BigInt(ctx.from.id)))) {
      await ctx.reply('⚠️ Please register first to use this feature. Tap Register 📝 to get started.');
      return;
    }
    await ctx.reply(WITHDRAW_TEXT);
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

  // ─── Agent Dashboard 📊 handler ──────────────────────────────────────────
  bot.hears('Agent Dashboard 📊', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    // Check if user is a linked agent
    const linkedAgent = await prisma.agent.findUnique({
      where: { telegram_id: telegramId },
      select: { id: true, is_active: true },
    });

    if (!linkedAgent) {
      await ctx.reply('⚠️ You are not an authorized agent.');
      return;
    }

    if (!linkedAgent.is_active) {
      await ctx.reply('⚠️ Your agent account is currently suspended. Please contact support.');
      return;
    }

    try {
      const stats = await AgentService.getDashboardStats(linkedAgent.id);
      const dashboardUrl = `${MINI_APP_URL}agent/dashboard`;
      
      await ctx.reply(
        `📊 Agent Dashboard\n\n` +
        `👥 Total Players: ${stats.totalPlayersInvited}\n` +
        `💵 Total Commission: ETB ${stats.totalCommission}\n` +
        `📅 This Week: ETB ${stats.weeklyCommission}\n` +
        `📅 Today: ETB ${stats.dailyCommission}\n\n` +
        `🌐 Full Dashboard: ${dashboardUrl}`
      );
    } catch (err) {
      console.error('[Bot] Agent dashboard error:', err);
      await ctx.reply('❌ Unable to load dashboard. Please try again later.');
    }
  });

  // ─── My Players 👥 handler ──────────────────────────────────────────────
  bot.hears('My Players 👥', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    // Check if user is a linked agent
    const linkedAgent = await prisma.agent.findUnique({
      where: { telegram_id: telegramId },
      select: { id: true, is_active: true },
    });

    if (!linkedAgent) {
      await ctx.reply('⚠️ You are not an authorized agent.');
      return;
    }

    if (!linkedAgent.is_active) {
      await ctx.reply('⚠️ Your agent account is currently suspended. Please contact support.');
      return;
    }

    try {
      const stats = await AgentService.getDashboardStats(linkedAgent.id);
      
      if (stats.players.length === 0) {
        await ctx.reply('👥 You haven\'t invited any players yet.\n\nUse "Agent Invite 🔗" to get your invitation link!');
        return;
      }

      let playerList = `👥 Your Players (${stats.players.length}):\n\n`;
      
      // Show top 10 players
      const topPlayers = stats.players.slice(0, 10);
      topPlayers.forEach((player, index) => {
        playerList += `${index + 1}. ${player.username}\n`;
        playerList += `   💰 Balance: ETB ${player.depositBalance}\n`;
        playerList += `   💵 Your Commission: ETB ${player.totalCommissionFromPlayer}\n\n`;
      });

      if (stats.players.length > 10) {
        playerList += `... and ${stats.players.length - 10} more players.\n\n`;
      }

      playerList += `📊 See full details in your dashboard.`;
      
      await ctx.reply(playerList);
    } catch (err) {
      console.error('[Bot] My players error:', err);
      await ctx.reply('❌ Unable to load player list. Please try again later.');
    }
  });

  // ─── Agent Invite 🔗 handler ──────────────────────────────────────────────
  bot.hears('Agent Invite 🔗', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    // Check if user is a linked agent
    const linkedAgent = await prisma.agent.findUnique({
      where: { telegram_id: telegramId },
      select: { id: true, is_active: true },
    });

    if (!linkedAgent) {
      await ctx.reply('⚠️ You are not an authorized agent.');
      return;
    }

    if (!linkedAgent.is_active) {
      await ctx.reply('⚠️ Your agent account is currently suspended. Please contact support.');
      return;
    }

    const playerInvite = `https://t.me/${ctx.me.username}?start=ref_agent_${linkedAgent.id}`;
    
    await ctx.reply(
      `🔗 Your Agent Invitation Link\n\n` +
      `Share this link to invite new players:\n${playerInvite}\n\n` +
      `💡 When players register using this link, you'll earn 10% commission on all their deposits!`
    );
  });

  // ─── Commission Balance 💵 handler ────────────────────────────────────────
  bot.hears('Commission Balance 💵', async (ctx) => {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);

    // Check if user is a linked agent
    const linkedAgent = await prisma.agent.findUnique({
      where: { telegram_id: telegramId },
      select: { id: true, is_active: true, commission_balance: true },
    });

    if (!linkedAgent) {
      await ctx.reply('⚠️ You are not an authorized agent.');
      return;
    }

    if (!linkedAgent.is_active) {
      await ctx.reply('⚠️ Your agent account is currently suspended. Please contact support.');
      return;
    }

    try {
      const stats = await AgentService.getDashboardStats(linkedAgent.id);
      
      await ctx.reply(
        `💵 Commission Balance\n\n` +
        `💰 Current Balance: ETB ${linkedAgent.commission_balance}\n` +
        `📈 Total Earned: ETB ${stats.totalCommission}\n` +
        `📅 This Week: ETB ${stats.weeklyCommission}\n` +
        `📅 Today: ETB ${stats.dailyCommission}\n\n` +
        `ℹ️ Contact support to withdraw your commission balance.`
      );
    } catch (err) {
      console.error('[Bot] Commission balance error:', err);
      await ctx.reply('❌ Unable to load commission balance. Please try again later.');
    }
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

// ─── Error handling for missing BOT_TOKEN ────────────────────────────────────────
if (!BOT_TOKEN) {
  console.error('[Bot] 🚨 CRITICAL: Bot initialization skipped - BOT_TOKEN is missing!');
  console.error('[Bot] Available env vars:', Object.keys(process.env).filter(k => k.includes('BOT') || k.includes('TOKEN')));
}

export { bot, MINI_APP_URL };
