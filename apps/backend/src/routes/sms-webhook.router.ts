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
 *  - Secondary: amount + 30-minute time window (guards against wrong-amount edge cases)
 *  - If no pending deposit found by phone, auto-creates one and marks it for admin review
 */

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { processDepositClaim, logDepositAttempt, phoneMatches } from '../bot/index.js';

const router: RouterType = Router();

// ─── Parse incoming Telebirr "received payment" SMS ──────────────────────────
// Sample (English): "You have received ETB 250.00 from 0911234567. Ref: DHD8R7PFDQ. Your new balance is ETB 1,234.56."
// Sample (Amharic): "ከ 0911234567 ETB 250.00 ተቀብለዋል። Ref: DHD8R7PFDQ"
export function parseIncomingTelebirrSms(sms: string): {
  amount: number;
  senderPhone: string;
  txNumber: string | null;
} | null {
  const n = sms.replace(/\s+/g, ' ').trim();

  // ── Amount ──────────────────────────────────────────────────────────────────
  let amount: number | null = null;

  // "received ETB 250.00" or "received ETB 1,250.00"
  const amtMatch =
    n.match(/received\s+ETB\s+([\d,]+(?:\.\d+)?)/i) ??
    n.match(/ETB\s+([\d,]+(?:\.\d+)?)\s+(?:received|ተቀብለዋል)/i) ??
    n.match(/ተቀብለዋል[^።\n]*?([\d,]+(?:\.\d+)?)\s*(?:ETB|ብር)/i) ??
    n.match(/([\d,]+(?:\.\d+)?)\s*ETB[^።\n]*?ተቀብለዋል/i);

  if (amtMatch?.[1]) {
    amount = parseFloat(amtMatch[1].replace(/,/g, ''));
  }

  if (!amount || amount <= 0) return null;

  // ── Sender phone ────────────────────────────────────────────────────────────
  let senderPhone: string | null = null;

  // "from 0911234567" or "from +251911234567" or "ከ 0911234567"
  const phoneMatch =
    n.match(/from\s+(\+?251\d{9}|0[79]\d{8})/i) ??
    n.match(/ከ\s+(\+?251\d{9}|0[79]\d{8})/);

  if (phoneMatch?.[1]) senderPhone = phoneMatch[1];

  if (!senderPhone) return null;

  // ── Transaction reference ───────────────────────────────────────────────────
  let txNumber: string | null = null;

  const refMatch =
    n.match(/(?:Ref|Reference|Txn|Transaction)[:\s]+([A-Z0-9]{6,20})/i) ??
    n.match(/\b([A-Z][A-Z0-9]{5,19})\b/); // fallback: standalone alphanumeric

  if (refMatch?.[1]) txNumber = refMatch[1].toUpperCase();

  return { amount, senderPhone, txNumber };
}

// ─── POST /api/sms-webhook ────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  // ── Auth: shared secret OR httpSMS JWT Bearer token ───────────────────────
  const secret = process.env['SMS_WEBHOOK_SECRET'];
  if (secret) {
    const xHeader = req.headers['x-sms-secret'];
    const xApiKey = req.headers['x-api-key'];
    const querySecret = req.query['secret'];
    // httpSMS sends Authorization: Bearer <jwt> — accept if it contains our secret as the token
    const bearerToken = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');

    const provided = xHeader ?? xApiKey ?? querySecret ?? (bearerToken || undefined);
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
  // Only process incoming SMS events — ignore sent/delivered/heartbeat etc.
  if (body['type'] && body['type'] !== 'message.phone.received') {
    res.json({ status: 'ignored', reason: 'NOT_INCOMING_SMS_EVENT' });
    return;
  }

  const httpsmsData = body['data'] as Record<string, unknown> | undefined;

  // Accept httpSMS format OR simple { sms/message/text: "..." }
  const rawSms: string | null =
    (typeof httpsmsData?.['content'] === 'string' ? httpsmsData['content'] : null) ??
    (typeof body['sms'] === 'string' ? body['sms'] : null) ??
    (typeof body['message'] === 'string' ? body['message'] : null) ??
    (typeof body['text'] === 'string' ? body['text'] : null);

  // httpSMS also gives us the sender phone directly — use it as a hint if SMS parsing misses it
  const httpsmsContact = typeof httpsmsData?.['contact'] === 'string'
    ? httpsmsData['contact'] as string
    : null;

  if (!rawSms) {
    res.status(400).json({ error: 'MISSING_SMS', message: 'Provide sms, message, or text field' });
    return;
  }

  console.log(`[SMSWebhook] Received SMS: ${rawSms.substring(0, 120)}`);

  // ── Parse incoming SMS ─────────────────────────────────────────────────────
  const parsed = parseIncomingTelebirrSms(rawSms);

  if (!parsed) {
    console.log('[SMSWebhook] Not a recognizable Telebirr received-payment SMS — ignoring');
    res.json({ status: 'ignored', reason: 'NOT_TELEBIRR_RECEIPT' });
    return;
  }

  const { amount, senderPhone, txNumber } = parsed;
  // Use httpSMS contact field as fallback if SMS parsing didn't extract the phone
  const resolvedPhone = senderPhone || httpsmsContact;
  if (!resolvedPhone) {
    res.json({ status: 'ignored', reason: 'NO_SENDER_PHONE' });
    return;
  }
  console.log(`[SMSWebhook] Parsed — amount: ${amount}, sender: ${resolvedPhone}, tx: ${txNumber}`);

  // ── Find player by sender phone ────────────────────────────────────────────
  const players = await prisma.player.findMany({
    where: { phone: { not: null }, is_mock: false, is_suspended: false },
    select: { id: true, username: true, phone: true },
  });

  const matchedPlayer = players.find(
    (p) => p.phone && phoneMatches(resolvedPhone, p.phone),
  );

  if (!matchedPlayer) {
    console.log(`[SMSWebhook] No player found with phone matching ${resolvedPhone}`);
    if (txNumber) {
      await createUnmatchedPendingDeposit(txNumber, amount, rawSms, resolvedPhone);
    }
    res.json({ status: 'unmatched', reason: 'NO_PLAYER_WITH_PHONE' });
    return;
  }

  // ── Find matching pending deposit ──────────────────────────────────────────
  // Look for a pending deposit for this player within the last 30 minutes
  // that matches the amount (±1 ETB tolerance).
  const windowStart = new Date(Date.now() - 30 * 60 * 1000);

  let pendingDeposit = await prisma.pendingDeposit.findFirst({
    where: {
      player_id: matchedPlayer.id,
      status: 'pending',
      amount: {
        gte: amount - 1,
        lte: amount + 1,
      },
      created_at: { gte: windowStart },
    },
    orderBy: { created_at: 'desc' },
  });

  // If no time-windowed match, try any pending deposit for this player with matching amount
  if (!pendingDeposit) {
    pendingDeposit = await prisma.pendingDeposit.findFirst({
      where: {
        player_id: matchedPlayer.id,
        status: 'pending',
        amount: {
          gte: amount - 1,
          lte: amount + 1,
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // No pending deposit found — create one automatically from the SMS and credit immediately
  if (!pendingDeposit) {
    const effectiveTxNumber = txNumber ?? `SMS-${senderPhone}-${Date.now()}`;

    // Check if this tx already exists (idempotency)
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
    } else {
      pendingDeposit = existing;
    }
  }

  // ── Claim the deposit ──────────────────────────────────────────────────────
  const result = await processDepositClaim(
    matchedPlayer.id,
    pendingDeposit.tx_number,
    { rawSms, amountParsed: amount, source: 'bot' },
  );

  if (result.success) {
    console.log(`[SMSWebhook] ✅ Credited ${result.amount} ETB (+${result.bonusAmount} bonus) to ${matchedPlayer.username}`);
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
