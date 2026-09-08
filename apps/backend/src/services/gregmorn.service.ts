// Gregmorn Hub (SoftAPI) integration service
// Handles: auth token cache, game catalog, openGame, currency conversion

import crypto from 'node:crypto';

// ─── Config ───────────────────────────────────────────────────────────────────

export const GREGMORN_OFFICE_URL = process.env['GREGMORN_OFFICE_URL'] ?? 'https://office-api-dev.gregmorn.org';
export const GREGMORN_CLIENT_URL = process.env['GREGMORN_CLIENT_URL'] ?? 'https://client-api-dev.gregmorn.org';
export const GREGMORN_TRANSFER_URL = process.env['GREGMORN_TRANSFER_URL'] ?? 'https://twalletvault.api.games-hub.net';
const GREGMORN_LOGIN = process.env['GREGMORN_LOGIN'] ?? '';
const GREGMORN_PASSWORD = process.env['GREGMORN_PASSWORD'] ?? '';
export const GREGMORN_USER_ID = process.env['GREGMORN_USER_ID'] ?? '';
export const GREGMORN_SECRET = process.env['GREGMORN_SECRET'] ?? '';
export const GREGMORN_CURRENCY = process.env['GREGMORN_CURRENCY'] ?? 'USD';
export const GREGMORN_CALLBACK_URL = process.env['GREGMORN_CALLBACK_URL'] ?? '';

// ─── HMAC-SHA256 Signature ────────────────────────────────────────────────────

/**
 * Sign raw JSON body bytes with HMAC-SHA256 using the shared secret.
 * The secret used is GREGMORN_SECRET (operator-level secret for openGame / callbacks).
 */
export function signBody(rawBody: string, secret: string = GREGMORN_SECRET): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/**
 * Verify incoming X-Signature header against the raw body.
 * Returns true only when signatures match (constant-time compare).
 */
export function verifySignature(rawBody: string, signature: string, secret: string = GREGMORN_SECRET): boolean {
  const expected = signBody(rawBody, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

// ─── Access Token Cache ───────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let tokenCache: TokenCache | null = null;

/**
 * Login to Gregmorn Hub and cache the access token.
 * Re-login automatically when token is within 5 minutes of expiry.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (tokenCache && tokenCache.expiresAt - now > 5 * 60 * 1000) {
    return tokenCache.accessToken;
  }

  if (!GREGMORN_LOGIN || !GREGMORN_PASSWORD) {
    throw new Error('[Gregmorn] GREGMORN_LOGIN and GREGMORN_PASSWORD must be set');
  }

  const body = new URLSearchParams({ login: GREGMORN_LOGIN, password: GREGMORN_PASSWORD });
  const res = await fetch(`${GREGMORN_OFFICE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`[Gregmorn] Auth login failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as { accessToken: string };
  if (!data.accessToken) throw new Error('[Gregmorn] No accessToken in login response');

  // JWT payload to extract exp (fallback: 23h from now)
  let expiresAt = now + 23 * 60 * 60 * 1000;
  try {
    const payload = JSON.parse(Buffer.from(data.accessToken.split('.')[1]!, 'base64url').toString());
    if (payload.exp) expiresAt = payload.exp * 1000;
  } catch { /* use fallback */ }

  tokenCache = { accessToken: data.accessToken, expiresAt };
  console.log('[Gregmorn] Access token refreshed, expires:', new Date(expiresAt).toISOString());
  return data.accessToken;
}

// ─── Game Catalog ─────────────────────────────────────────────────────────────

export interface GregmornGame {
  id: string;
  isEnabled: boolean;
  title: string;
  imageUrl: string;
  provider: string;
}

export async function getGameCatalog(currency: string = GREGMORN_CURRENCY): Promise<GregmornGame[]> {
  const token = await getAccessToken();
  const res = await fetch(
    `${GREGMORN_OFFICE_URL}/users/${GREGMORN_USER_ID}/getUserGames/${currency}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`[Gregmorn] getGameCatalog failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<GregmornGame[]>;
}

// ─── Open Game ────────────────────────────────────────────────────────────────

export interface OpenGameOptions {
  gameId: string;
  playerLogin: string;
  currency?: string;
  language?: string;
  demo?: '0' | '1';
  exitUrl?: string;
  playerIp?: string;
}

export interface OpenGameResult {
  gameUrl: string;
  sessionId: string;
}

export async function openGame(opts: OpenGameOptions): Promise<OpenGameResult> {
  const {
    gameId,
    playerLogin,
    currency = GREGMORN_CURRENCY,
    language = 'en',
    demo = '0',
    exitUrl = process.env['MINI_APP_URL'] ?? 'https://t.me/',
    playerIp,
  } = opts;

  if (!GREGMORN_USER_ID || !GREGMORN_SECRET) {
    throw new Error('[Gregmorn] GREGMORN_USER_ID and GREGMORN_SECRET must be set');
  }

  const payload: Record<string, unknown> = {
    currency,
    demo,
    exitUrl,
    gameId,
    language,
    player_login: playerLogin,
    user_id: GREGMORN_USER_ID,
  };

  if (playerIp) payload['ip'] = playerIp;
  if (GREGMORN_CALLBACK_URL) payload['callbackUrl'] = GREGMORN_CALLBACK_URL;

  const rawBody = JSON.stringify(payload);
  const signature = signBody(rawBody);

  const res = await fetch(`${GREGMORN_CLIENT_URL}/games/openGame`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
    },
    body: rawBody,
  });

  const data = await res.json() as {
    status: string;
    error: string;
    content?: { game: { url: string }; gameRes: { sessionId: string } };
    message?: string;
  };

  if (data.status !== 'success' || !data.content) {
    throw new Error(`[Gregmorn] openGame failed: ${data.error ?? data.message ?? 'unknown'}`);
  }

  return {
    gameUrl: data.content.game.url,
    sessionId: data.content.gameRes.sessionId,
  };
}

// ─── Currency Conversion (CurrencyFreaks) ────────────────────────────────────

// Cache rate for 30 minutes
let rateCache: { rate: number; fetchedAt: number } | null = null;
const RATE_TTL_MS = 30 * 60 * 1000;

/**
 * Returns how many game-currency units 1 ETB equals.
 * e.g. if ETB/USD = 0.0083 → 100 ETB ≈ 0.83 USD
 */
export async function getEtbToGameCurrencyRate(gameCurrency: string = GREGMORN_CURRENCY): Promise<number> {
  const now = Date.now();
  if (rateCache && now - rateCache.fetchedAt < RATE_TTL_MS) {
    return rateCache.rate;
  }

  const apiKey = process.env['CURRENCYFREAKS_API_KEY'];
  if (!apiKey) {
    console.warn('[Gregmorn] CURRENCYFREAKS_API_KEY not set — using fallback rate 1:1');
    return 1;
  }

  try {
    const res = await fetch(
      `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}&symbols=ETB,${gameCurrency}`,
    );
    const data = await res.json() as { rates?: Record<string, string> };
    const rates = data.rates ?? {};

    // CurrencyFreaks rates are relative to USD base
    const etbPerUsd = parseFloat(rates['ETB'] ?? '0');
    const gamePerUsd = gameCurrency === 'USD' ? 1 : parseFloat(rates[gameCurrency] ?? '0');

    if (!etbPerUsd || !gamePerUsd) throw new Error('Missing rate data');

    // ETB → gameCurrency: divide ETB/USD by gameCurrency/USD
    const rate = gamePerUsd / etbPerUsd;
    rateCache = { rate, fetchedAt: now };
    console.log(`[Gregmorn] Rate 1 ETB = ${rate.toFixed(6)} ${gameCurrency}`);
    return rate;
  } catch (err) {
    console.error('[Gregmorn] Rate fetch failed:', err);
    return rateCache?.rate ?? 1; // use stale if available
  }
}

/**
 * Convert ETB amount to game currency amount.
 */
export async function etbToGameCurrency(etbAmount: number, gameCurrency?: string): Promise<number> {
  const rate = await getEtbToGameCurrencyRate(gameCurrency);
  return parseFloat((etbAmount * rate).toFixed(2));
}

/**
 * Convert game currency amount to ETB.
 */
export async function gameCurrencyToEtb(gameAmount: number, gameCurrency?: string): Promise<number> {
  const rate = await getEtbToGameCurrencyRate(gameCurrency);
  if (rate === 0) return gameAmount;
  return parseFloat((gameAmount / rate).toFixed(2));
}
