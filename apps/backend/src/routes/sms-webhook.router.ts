/**
 * SMS Webhook — Auto-deposit via Telebirr received-payment SMS
 *
 * Flow:
 *  1. Android phone receives Telebirr "You have received ETB X from 09XXXXXXXX. Ref: TXNXXXXXXXX"
 *  2. SMS forwarder app (e.g. HTTP SMS, SMS Forwarder) POSTs to POST /api/sms-webhook
 *  3. This handler parses the SMS, finds a pending deposit for that player (matched by phone),
 *     and calls processDepositClaim() to atomically credit the wallet.
 *
 * Security: Protected by a shared secret in the X-SMS-Secret header (set SMS_WEBHOOK_SECRET in .env)
 *
 * Matching strategy:
 *  - Primary:   sender phone → player.phone (players must register their phone)
 *  - Secondary: amount + 30-minute time window
 *  - If no pending deposit found by phone, auto-creates one for admin review (>50 ETB)
 *    or auto-credits (≤50 ETB) — matching the bot's approval threshold.
 */

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { processDepositClaim, logDepositAttempt, phoneMatches } from '../bot/index.js';

const router: RouterType = Router();

// ─── Parsed incoming payment result ──────────────────────────────────────────

export interface IncomingPayment {
  amount: number;
  senderPhone: string | null; // null for bank transfers where only account number is known
  txNumber: string | null;
  bank: 'telebirr' | 'cbe' | 'boa' | 'dashen' | 'cbebirr' | 'unknown';
}

// ─── Helper: extract amount from SMS text ─────────────────────────────────────

function extractAmount(n: string): number | null {
  const patterns = [
    // "received ETB 1,500.00" — must have space after ETB to avoid matching balance "ETB2,263.96"
    /received\s+ETB\s+([\d,]+(?:\.\d+)?)/i,
    /ETB\s+([\d,]+(?:\.\d+)?)\s+(?:received|credited|deposited)/i,
    /credited\s+(?:with\s+)?ETB\s+([\d,]+(?:\.\d+)?)/i,
    /ETB\s+([\d,]+(?:\.\d+)?)\s+(?:has been|is)\s+(?:credited|deposited|received)/i,
    /(?:amount|amt)[:\s]+ETB\s+([\d,]+(?:\.\d+)?)/i,
    /ETB\s+([\d,]+(?:\.\d+)?)\s+ተቀብለዋል/i,
    /ተቀብለዋል[^።\n]*?([\d,]+(?:\.\d+)?)\s*(?:ETB|ብር)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:ETB|ብር)\s+ከ/i,               // "250.00 ብር ከ ..."
    /([\d,]+(?:\.\d+)?)\s*ብር\s+ተቀብለዋል/i,                  // "250.00 ብር ተቀብለዋል"
    /([\d,]+(?:\.\d+)?)\s*ETB[^።\n]*?ተቀብለዋል/i,
    /Telebirr[:\s]+ETB\s+([\d,]+(?:\.\d+)?)/i,
    // CBE pattern: "You have received ETB 1,500.00 from account"
    /have\s+received\s+ETB\s+([\d,]+(?:\.\d+)?)/i,
    // generic fallback: ETB followed by space and number (not ETB immediately followed by digit like balance)
    /ETB\s+([\d,]+(?:\.\d+)?)/i,
    // Birr keyword
    /Birr\s+([\d,]+(?:\.\d+)?)/i,
  ];
  for (const pat of patterns) {
    const m = n.match(pat);
    if (m?.[1]) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(v) && v > 0) return v;
    }
  }
  return null;
}

// ─── Helper: extract sender phone ────────────────────────────────────────────

function extractSenderPhone(n: string): string | null {
  const patterns = [
    /from\s+(\+?251\d{9}|0[79]\d{8})/i,
    /ከ\s+(\+?251\d{9}|0[79]\d{8})/,
    /sent\s+by\s+(\+?251\d{9}|0[79]\d{8})/i,
    /sender[:\s]+(\+?251\d{9}|0[79]\d{8})/i,
    /\b(\+?251\d{9})\b/,
    /\b(0[79]\d{8})\b/,
  ];
  for (const pat of patterns) {
    const m = n.match(pat);
    if (m?.[1]) return m[1];
  }
  return null;
}

// ─── Helper: extract transaction reference ────────────────────────────────────

function extractTxNumber(n: string): string | null {
  const patterns = [
    /(?:Ref|Reference|Txn)[.:\s]+([A-Z0-9]{6,20})/i,
    /(?:Transaction|Trans)\s*(?:No|Number|Ref)[.:\s]+([A-Z0-9]{6,20})/i,
    /Receipt\s*(?:No)?[.:\s]+([A-Z0-9]{6,20})/i,
    /የሂሳብ\s+እንቅስቃሴ\s+ቁጥርዎ\s+([A-Z0-9]{6,20})/i,
    /ቁጥር\s+([A-Z0-9]{6,20})/i,
    // Bank-specific prefixes
    /\b(FT\d{8,15})\b/i,        // CBE: FT26123456789
    /\b(BOA[A-Z0-9]{6,16})\b/i, // BOA: BOA2026XXXXXXX
    /\b(DB[A-Z0-9]{6,16})\b/i,  // Dashen: DB20260112345
    /\b(CB[A-Z0-9]{6,16})\b/i,  // CBE Birr: CB20260512345
    // CBE receipt URL: https://mbreciept.cbe.com.et/v2-XXXXXXXXXXXXXXXXXXXXXXX
    /mbreciept\.cbe\.com\.et\/([A-Za-z0-9_-]{10,40})/i,
    // Telebirr 10-char fallback (must contain a letter)
    /\b([A-Z][A-Z0-9]{9})\b/,
  ];
  for (const pat of patterns) {
    const m = n.match(pat);
    if (m?.[1]) return m[1].toUpperCase();
  }
  return null;
}

// ─── Parse incoming "you received" SMS from any supported Ethiopian bank ───────
//
// Telebirr (English):
//   "You have received ETB 250.00 from 0911234567. Ref: DHD8R7PFDQ."
//   "Telebirr: ETB 250.00 received from 0922345678. Transaction No: ABC1234567."
//
// Telebirr (Amharic):
//   "ከ 0911234567 ETB 250.00 ተቀብለዋል። Ref: DHD8R7PFDQ"
//   "250.00 ብር ከ 0911234567 ተቀብለዋል። ቁጥር DHD8R7PFDQ"
//
// CBE (Commercial Bank of Ethiopia):
//   "ETB 500.00 credited to your account from Acc No 1000XXXXX3241. Ref No: FT26123456789"
//   "Dear Customer, ETB 500.00 has been deposited to your account. Transaction Ref: FT26123456789"
//
// BOA (Bank of Abyssinia):
//   "ETB 200.00 has been credited to your BOA account. Ref: BOA2026XXXXXXX"
//   "Dear BOA Customer, you have received ETB 200.00. Reference: BOA2026XXXXXXX"
//
// Dashen Bank:
//   "ETB 300.00 credited to your account. Transaction Ref: DB20260112345"
//   "Dashen: You have received ETB 300.00 from 0911234567. Ref: DB20260112345"
//
// CBE Birr:
//   "ETB 150.00 received from 0912345678. Receipt No: CB20260512345"
//   "You have received ETB 150.00 from 0912345678 (Meron). Receipt No: CB20260512345"
//
export function parseIncomingPaymentSms(sms: string): IncomingPayment | null {
  const n = sms.replace(/\s+/g, ' ').trim();

  // ── Detect bank from SMS content ───────────────────────────────────────────
  // Priority: explicit bank name → tx reference prefix → URL domain → phone+received pattern
  let bank: IncomingPayment['bank'] = 'unknown';
  if (/telebirr|ቴሌብር/i.test(n) || /ተቀብለዋል|የሂሳብ\s+እንቅስቃሴ/i.test(n)) {
    bank = 'telebirr';
  } else if (/\bCBE\s*[-–]?\s*Birr\b/i.test(n) || /\b(CB[A-Z0-9]{6,16})\b/.test(n)) {
    bank = 'cbebirr';
  } else if (/commercial\s+bank|Banking\s+with\s+CBE|\bCBE\b|cbe\.com\.et|\bFT\d{6}/i.test(n)) {
    bank = 'cbe';
  } else if (/bank\s+of\s+abyssinia|\bBOA\b|\b(BOA[A-Z0-9]{6,16})\b/i.test(n)) {
    bank = 'boa';
  } else if (/dashen|\b(DB[A-Z0-9]{6,16})\b/i.test(n)) {
    bank = 'dashen';
  } else if (/received\s+ETB.{0,60}(?:from\s+\+?251|\bfrom\s+0[79])/i.test(n)) {
    // "received ETB ... from 09..." with a phone — Telebirr pattern
    bank = 'telebirr';
  }

  // ── Must be a "received/credited" SMS, not a "sent/debit" notification ─────
  const isReceived =
    /received|credited|deposited|ተቀብለዋል/i.test(n);
  const isSentOnly =
    !isReceived &&
    /\b(sent|transferred|debited|withdrawn|paid)\b/i.test(n);

  if (isSentOnly) return null;

  // ── Extract fields ─────────────────────────────────────────────────────────
  const amount = extractAmount(n);
  if (!amount) return null;

  const txNumber = extractTxNumber(n);
  const senderPhone = extractSenderPhone(n);

  // For CBE/BOA/Dashen, sender may be an account number, not a phone.
  // We allow senderPhone to be null for those — matching will fall back to
  // amount + time-window lookup instead.
  if (!senderPhone && bank === 'telebirr') return null; // Telebirr always has a phone

  return { amount, senderPhone, txNumber, bank };
}

// Keep old export name as alias so existing tests don't break
export function parseIncomingTelebirrSms(sms: string): {
  amount: number;
  senderPhone: string;
  txNumber: string | null;
} | null {
  const result = parseIncomingPaymentSms(sms);
  if (!result || !result.senderPhone) return null;
  return { amount: result.amount, senderPhone: result.senderPhone, txNumber: result.txNumber };
}

// ─── POST /api/sms-webhook ────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  // ── Auth: shared secret ───────────────────────────────────────────────────
  // Accept the secret via: X-SMS-Secret header, X-Api-Key header, ?secret= query param,
  // or Authorization: Bearer <secret> (httpSMS default).
  // Check all sources explicitly so one wrong header doesn't shadow the right one.
  const secret = process.env['SMS_WEBHOOK_SECRET'];
  if (secret) {
    const xHeader = req.headers['x-sms-secret'];
    const xApiKey = req.headers['x-api-key'];
    const querySecret = req.query['secret'];
    const bearerToken = typeof req.headers['authorization'] === 'string'
      ? req.headers['authorization'].replace(/^Bearer\s+/i, '').trim()
      : null;

    const provided =
      (typeof xHeader === 'string' && xHeader) ||
      (typeof xApiKey === 'string' && xApiKey) ||
      (typeof querySecret === 'string' && querySecret) ||
      bearerToken ||
      null;

    if (provided !== secret) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
  } else {
    console.warn('[SMSWebhook] SMS_WEBHOOK_SECRET not set — endpoint is unprotected!');
  }

  const body = req.body as Record<string, unknown>;

  // ── httpSMS CloudEvents format ─────────────────────────────────────────────
  // httpSMS sends: { type: "message.phone.received", data: { content: "...", contact: "09..." } }
  // Ignore non-incoming-SMS events (sent/delivered/heartbeat/etc.)
  if (typeof body['type'] === 'string' && body['type'] !== 'message.phone.received') {
    res.json({ status: 'ignored', reason: 'NOT_INCOMING_SMS_EVENT' });
    return;
  }

  const httpsmsData = body['data'] as Record<string, unknown> | undefined;

  // Accept httpSMS CloudEvent format OR common simple formats from other forwarder apps.
  // Field priority: httpSMS data.content → body.sms → body.message → body.text → body.body → body.content
  const rawSms: string | null =
    (typeof httpsmsData?.['content'] === 'string' ? httpsmsData['content'] : null) ??
    (typeof body['sms'] === 'string' ? body['sms'] : null) ??
    (typeof body['message'] === 'string' ? body['message'] : null) ??
    (typeof body['text'] === 'string' ? body['text'] : null) ??
    (typeof body['body'] === 'string' ? body['body'] : null) ??
    (typeof body['content'] === 'string' ? body['content'] : null);

  // httpSMS also gives us the sender phone directly in data.contact
  const httpsmsContact = typeof httpsmsData?.['contact'] === 'string'
    ? (httpsmsData['contact'] as string)
    : null;

  if (!rawSms) {
    res.status(400).json({
      error: 'MISSING_SMS',
      message: 'No SMS text found. Provide one of: data.content (httpSMS), sms, message, text, body, or content field.',
    });
    return;
  }

  console.log(`[SMSWebhook] Received SMS: ${rawSms.substring(0, 120)}`);

  // ── Parse incoming SMS ─────────────────────────────────────────────────────
  const parsed = parseIncomingPaymentSms(rawSms);

  if (!parsed) {
    console.log('[SMSWebhook] Not a recognizable received-payment SMS — ignoring');
    res.json({ status: 'ignored', reason: 'NOT_PAYMENT_RECEIPT' });
    return;
  }

  const { amount, senderPhone, txNumber, bank } = parsed;
  console.log(`[SMSWebhook] Parsed — bank: ${bank}, amount: ${amount}, sender: ${senderPhone ?? 'n/a'}, tx: ${txNumber ?? 'n/a'}`);

  // Use httpSMS contact field as fallback sender phone (Telebirr only)
  const resolvedPhone = senderPhone || httpsmsContact;

  // ── Find player by sender phone (Telebirr / CBE Birr / Dashen) ───────────
  // CBE and BOA don't include the sender's phone in the received SMS —
  // for those we fall back to tx_number matching only.
  let matchedPlayer: { id: string; username: string; phone: string | null } | null = null;

  if (resolvedPhone) {
    const players = await prisma.player.findMany({
      where: { phone: { not: null }, is_mock: false, is_suspended: false },
      select: { id: true, username: true, phone: true },
    });
    matchedPlayer = players.find(
      (p) => p.phone && phoneMatches(resolvedPhone, p.phone),
    ) ?? null;
  }

  // For bank transfers without a sender phone, try to match via tx_number directly
  if (!matchedPlayer && txNumber) {
    const txDeposit = await prisma.pendingDeposit.findUnique({
      where: { tx_number: txNumber },
      include: { player: { select: { id: true, username: true, phone: true } } },
    });
    if (txDeposit?.player) {
      matchedPlayer = txDeposit.player;
      console.log(`[SMSWebhook] Matched player ${matchedPlayer.username} via tx_number ${txNumber}`);
    }
  }

  if (!matchedPlayer) {
    console.log(`[SMSWebhook] No player matched — phone: ${resolvedPhone ?? 'none'}, tx: ${txNumber ?? 'none'}`);
    if (txNumber) {
      await createUnmatchedPendingDeposit(txNumber, amount, rawSms, resolvedPhone ?? 'unknown');
    }
    res.json({ status: 'unmatched', reason: resolvedPhone ? 'NO_PLAYER_WITH_PHONE' : 'NO_PLAYER_FOR_TX' });
    return;
  }

  // ── Find matching pending deposit ──────────────────────────────────────────
  // Try tx_number first (most precise match) — avoids any amount-based ambiguity.
  // Fetch regardless of status so we can detect already-claimed/cancelled duplicates.
  const txDeposit = txNumber
    ? await prisma.pendingDeposit.findUnique({ where: { tx_number: txNumber } })
    : null;

  if (txDeposit?.status === 'claimed') {
    res.status(409).json({ status: 'failed', reason: 'ALREADY_CLAIMED' });
    return;
  }
  if (txDeposit?.status === 'cancelled') {
    res.status(409).json({ status: 'failed', reason: 'CANCELLED' });
    return;
  }

  let pendingDeposit = txDeposit?.status === 'pending' ? txDeposit : null;

  // If tx_number matched but belongs to a different player — reject (fraud guard)
  if (pendingDeposit && pendingDeposit.player_id && pendingDeposit.player_id !== matchedPlayer.id) {
    console.warn(
      `[SMSWebhook] tx ${txNumber} belongs to player ${pendingDeposit.player_id}, ` +
      `but SMS sender is player ${matchedPlayer.id} — rejecting`,
    );
    res.status(409).json({ status: 'failed', reason: 'TX_BELONGS_TO_ANOTHER_PLAYER' });
    return;
  }
  // Link player to deposit if not yet linked (admin pre-created it without a player)
  if (pendingDeposit && !pendingDeposit.player_id) {
    pendingDeposit = await prisma.pendingDeposit.update({
      where: { id: pendingDeposit.id },
      data: { player_id: matchedPlayer.id },
    });
  }

  // Fallback: match by player + amount within a 30-minute window (no tx_number)
  if (!pendingDeposit) {
    const windowStart = new Date(Date.now() - 30 * 60 * 1000);
    pendingDeposit = await prisma.pendingDeposit.findFirst({
      where: {
        player_id: matchedPlayer.id,
        status: 'pending',
        // Tight tolerance: exact match only — ±0.01 for floating point safety
        amount: { gte: amount - 0.01, lte: amount + 0.01 },
        created_at: { gte: windowStart },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // Broader fallback: any pending for this player + amount (no time window)
  if (!pendingDeposit) {
    pendingDeposit = await prisma.pendingDeposit.findFirst({
      where: {
        player_id: matchedPlayer.id,
        status: 'pending',
        amount: { gte: amount - 0.01, lte: amount + 0.01 },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ── No pending deposit found — create one ─────────────────────────────────
  if (!pendingDeposit) {
    const effectiveTxNumber = txNumber ?? `SMS-${resolvedPhone ?? bank}-${Date.now()}`;

    // Idempotency: don't create a duplicate
    const existing = await prisma.pendingDeposit.findUnique({
      where: { tx_number: effectiveTxNumber },
    });

    if (!existing) {
      pendingDeposit = await prisma.pendingDeposit.create({
        data: {
          tx_number: effectiveTxNumber,
          amount,
          status: 'pending',
          player_id: matchedPlayer.id,
        },
      });
      console.log(`[SMSWebhook] Created new pending deposit ${effectiveTxNumber} for player ${matchedPlayer.username}`);
    } else if (existing.status === 'claimed') {
      res.status(409).json({ status: 'failed', reason: 'ALREADY_CLAIMED' });
      return;
    } else if (existing.status === 'cancelled') {
      res.status(409).json({ status: 'failed', reason: 'CANCELLED' });
      return;
    } else {
      pendingDeposit = existing;
    }
  }

  // ── Claim the deposit — webhook is the primary auto-credit path ──────────
  // No amount threshold here: the webhook fires when Telebirr delivers the SMS,
  // which is the primary confirmation. Admin approval is only a fallback for
  // cases where the webhook never fires (phone unregistered, forwarder down, etc.).
  const result = await processDepositClaim(
    matchedPlayer.id,
    pendingDeposit.tx_number,
    { rawSms, amountParsed: amount, source: 'bot' },
  );

  if (result.success) {
    console.log(`[SMSWebhook] ✅ Credited ${result.amount} ETB (+${result.bonusAmount ?? 0} bonus) to ${matchedPlayer.username}`);
    res.json({
      status: 'credited',
      player: matchedPlayer.username,
      amount: result.amount,
      bonusAmount: result.bonusAmount,
    });
  } else {
    console.log(`[SMSWebhook] ⚠️ Deposit claim failed: ${result.reason} for ${matchedPlayer.username}`);
    res.json({ status: 'failed', reason: result.reason });
  }
});

// ─── Helper: store unmatched SMS as a pending deposit for admin review ────────
async function createUnmatchedPendingDeposit(
  txNumber: string,
  amount: number,
  rawSms: string,
  senderPhone: string,
): Promise<void> {
  try {
    const existing = await prisma.pendingDeposit.findUnique({ where: { tx_number: txNumber } });
    if (!existing) {
      await prisma.pendingDeposit.create({
        data: {
          tx_number: txNumber,
          amount,
          status: 'pending',
          player_id: null,
        },
      });
      void logDepositAttempt({
        txNumberParsed: txNumber,
        rawSms,
        outcome: 'pending_approval',
        failureReason: `UNMATCHED_PHONE:${senderPhone}`,
        amountParsed: amount,
        source: 'bot',
      });
      console.log(`[SMSWebhook] Stored unmatched deposit ${txNumber} (${amount} ETB) from ${senderPhone} for admin review`);
    }
  } catch (err) {
    console.error('[SMSWebhook] Failed to store unmatched deposit:', err);
  }
}

export default router;
