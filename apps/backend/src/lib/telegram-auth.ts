// Telegram Mini App initData verification utility
// Requirements: 1.2, 1.3

import { createHmac, timingSafeEqual } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export class TelegramAuthError extends Error {
  constructor(
    public readonly code:
      | 'MISSING_HASH'
      | 'INVALID_SIGNATURE'
      | 'EXPIRED'
      | 'MISSING_USER'
      | 'INVALID_USER_JSON',
    message: string
  ) {
    super(message);
    this.name = 'TelegramAuthError';
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** initData is considered valid for 1 hour */
const AUTH_MAX_AGE_SECONDS = 3600;

// ─── Core verification ────────────────────────────────────────────────────────

/**
 * Verifies a Telegram Mini App `initData` string per the official specification:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Steps:
 *  1. Parse the URL-encoded initData string into key=value pairs.
 *  2. Extract and remove the `hash` field.
 *  3. Sort remaining fields alphabetically and join as "key=value\n" data-check string.
 *  4. Derive secret key: HMAC-SHA256("WebAppData", botToken).
 *  5. Compute HMAC-SHA256(data-check string, secretKey).
 *  6. Constant-time compare computed hex hash against the extracted hash.
 *  7. Validate auth_date is within AUTH_MAX_AGE_SECONDS of now.
 *  8. Parse and return the `user` object.
 *
 * @throws {TelegramAuthError} on any validation failure
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string
): TelegramUser {
  // Step 1: Parse URL-encoded string
  const params = new URLSearchParams(initData);

  // Step 2: Extract hash
  const receivedHash = params.get('hash');
  if (!receivedHash) {
    throw new TelegramAuthError('MISSING_HASH', 'initData is missing the hash field');
  }
  params.delete('hash');

  // Step 3: Sort remaining fields and build data-check string
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // Step 4: Derive secret key
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

  // Step 5: Compute expected hash
  const computedHashBuffer = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest();
  const computedHashHex = computedHashBuffer.toString('hex');

  // Step 6: Constant-time comparison
  const receivedHashBuffer = Buffer.from(receivedHash, 'hex');
  const isSameLength = receivedHashBuffer.length === computedHashBuffer.length;
  // Use timingSafeEqual only when lengths match to avoid throwing; treat mismatched
  // length as a failed comparison (still constant-time from attacker's perspective).
  const hashesMatch =
    isSameLength && timingSafeEqual(computedHashBuffer, receivedHashBuffer);

  if (!hashesMatch) {
    throw new TelegramAuthError(
      'INVALID_SIGNATURE',
      'initData hash verification failed'
    );
  }

  // Step 7: Validate auth_date freshness
  const authDateStr = params.get('auth_date');
  const authDate = authDateStr ? parseInt(authDateStr, 10) : NaN;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (isNaN(authDate) || nowSeconds - authDate > AUTH_MAX_AGE_SECONDS) {
    throw new TelegramAuthError(
      'EXPIRED',
      `initData auth_date is expired or missing (age: ${nowSeconds - authDate}s)`
    );
  }

  // Step 8: Parse user object
  const userJson = params.get('user');
  if (!userJson) {
    throw new TelegramAuthError('MISSING_USER', 'initData is missing the user field');
  }

  let user: TelegramUser;
  try {
    user = JSON.parse(userJson) as TelegramUser;
  } catch {
    throw new TelegramAuthError('INVALID_USER_JSON', 'initData user field is not valid JSON');
  }

  return user;
}

// ─── Test helper: build a valid signed initData string ───────────────────────

/**
 * Builds a properly signed initData string for testing purposes.
 * NOT for production use.
 */
export function buildSignedInitData(
  user: TelegramUser,
  botToken: string,
  authDate: number = Math.floor(Date.now() / 1000)
): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    user: JSON.stringify(user),
  });

  // Sort and build data-check string (no hash field yet)
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}
