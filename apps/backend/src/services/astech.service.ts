// AS Tech API integration service
// Handles: HMAC auth, game catalog, session launch, signature verification
// Docs: https://astechapi.cloud/docs

import crypto from 'node:crypto';

// ─── Config ───────────────────────────────────────────────────────────────────

export const ASTECH_BASE_URL      = process.env['ASTECH_BASE_URL']      ?? 'https://astechapi.cloud';
export const ASTECH_API_KEY       = process.env['ASTECH_API_KEY']       ?? '';
export const ASTECH_SECRET_KEY    = process.env['ASTECH_SECRET_KEY']    ?? '';
export const ASTECH_CURRENCY      = process.env['ASTECH_CURRENCY']      ?? 'USD';
export const ASTECH_CALLBACK_URL  = process.env['ASTECH_CALLBACK_URL']  ?? '';
export const ASTECH_EXIT_URL      = process.env['ASTECH_EXIT_URL']      ?? process.env['MINI_APP_URL'] ?? 'https://t.me/';

// ─── HMAC-SHA256 helpers ──────────────────────────────────────────────────────

/**
 * Sign a raw body string with HMAC-SHA256 using the secret key.
 * AS Tech API requires the exact raw body to be signed — do not re-serialise.
 */
export function signBody(rawBody: string): string {
  return crypto.createHmac('sha256', ASTECH_SECRET_KEY).update(rawBody, 'utf8').digest('hex');
}

/**
 * Verify X-Signature header against raw body (constant-time compare).
 */
export function verifySignature(rawBody: string, signature: string): boolean {
  if (!signature) return false;
  const expected = signBody(rawBody);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature.toLowerCase(), 'hex'),
    );
  } catch {
    return false;
  }
}

// ─── Core request helper ──────────────────────────────────────────────────────

async function astechRequest<T>(path: string, payload: object | null = null): Promise<T> {
  if (!ASTECH_API_KEY || !ASTECH_SECRET_KEY) {
    throw new Error('[ASTech] ASTECH_API_KEY and ASTECH_SECRET_KEY must be set');
  }

  const body = payload === null ? '' : JSON.stringify(payload);
  const signature = signBody(body);

  const res = await fetch(`${ASTECH_BASE_URL}${path}`, {
    method: payload === null ? 'GET' : 'POST',
    headers: {
      'X-Api-Key':      ASTECH_API_KEY,
      'X-Signature':    signature,
      'Content-Type':   'application/json',
    },
    ...(payload === null ? {} : { body }),
  });

  const json = await res.json() as { status: string; error: string; content: T };
  if (json.status !== 'success') {
    throw new Error(`[ASTech] ${path} failed: ${json.error || 'unknown error'}`);
  }
  return json.content;
}

// ─── Game Catalog ─────────────────────────────────────────────────────────────

export interface ASTechGame {
  gameId:     string;
  title:      string;
  provider:   string;
  category:   string;
  imageUrl:   string;
  currencies: string[];
}

export interface ASTechCatalogContent {
  count: number;
  games: ASTechGame[];
}

/**
 * Fetch the full game catalogue for your account.
 * Cache on your side and refresh a few times per day.
 */
export async function getGameCatalog(filters: {
  currency?: string;
  provider?: string;
  category?: string;
} = {}): Promise<ASTechGame[]> {
  const payload = { currency: ASTECH_CURRENCY, ...filters };
  const content = await astechRequest<ASTechCatalogContent>('/api/public/v1/games', payload);
  return content.games ?? [];
}

// ─── Launch a game session ─────────────────────────────────────────────────────

export interface OpenSessionOptions {
  playerLogin: string;
  gameId:      string;
  currency?:   string;
  language?:   string;
  exitUrl?:    string;
}

export interface OpenSessionResult {
  sessionId:   string;
  gameUrl:     string;
  directUrl:   string;
  branded:     boolean;
  mode:        string;
  demo:        boolean;
  category:    string;
  embeddable:  boolean;
  singleUse:   boolean;
  expiresIn:   number;
}

/**
 * Open a game session for a player.
 * Returns the single-use gameUrl (valid ~5 min) — call on every launch, never cache.
 */
export async function openSession(opts: OpenSessionOptions): Promise<OpenSessionResult> {
  const {
    playerLogin,
    gameId,
    currency  = ASTECH_CURRENCY,
    language  = 'en',
    exitUrl   = ASTECH_EXIT_URL,
  } = opts;

  return astechRequest<OpenSessionResult>('/api/public/v1/session/open', {
    player_login: playerLogin,
    game_id:      gameId,
    currency,
    language,
    exit_url:     exitUrl,
  });
}
