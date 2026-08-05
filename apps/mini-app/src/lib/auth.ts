import WebApp from '@twa-dev/sdk';
import { login } from './api';

// In development, WebApp.initData may be empty. Use a mock fallback.
const DEV_MOCK_INIT_DATA = 'mock_init_data_for_development';

// In-flight promise to prevent concurrent login calls
let authPromise: Promise<void> | null = null;

/**
 * Decodes the JWT payload without verifying the signature.
 * We only use this to check the `exp` claim client-side — the server
 * still performs full verification on every request.
 */
function getJwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return decoded.exp ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns true only if we have a JWT that hasn't expired yet.
 * A 60-second buffer ensures we re-auth before the token actually expires.
 */
export function isLoggedIn(): boolean {
  const jwt = localStorage.getItem('jwt');
  const playerId = localStorage.getItem('playerId');
  if (!jwt || !playerId) return false;

  const exp = getJwtExpiry(jwt);
  if (exp === null) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  return exp - nowSeconds > 60; // re-auth if less than 60s left
}

export function clearSession(): void {
  localStorage.removeItem('jwt');
  localStorage.removeItem('playerId');
}

async function doLogin(): Promise<void> {
  const initData = WebApp.initData || DEV_MOCK_INIT_DATA;
  const startParam = (WebApp.initDataUnsafe as { start_param?: string }).start_param;

  const { token, playerId } = await login(initData, startParam);
  localStorage.setItem('jwt', token);
  localStorage.setItem('playerId', playerId);
}

export async function initAuth(): Promise<void> {
  if (isLoggedIn()) return;
  if (authPromise) return authPromise;

  authPromise = doLogin().finally(() => {
    authPromise = null;
  });

  return authPromise;
}

/**
 * Clears the current session and forces a fresh login.
 * Call this when the backend returns 404 NOT_FOUND for a player-scoped
 * endpoint, meaning the JWT is valid but the player record no longer exists.
 */
export async function reAuth(): Promise<void> {
  clearSession();
  return initAuth();
}

export function getPlayerId(): string | null {
  return localStorage.getItem('playerId');
}

export function getJwt(): string | null {
  return localStorage.getItem('jwt');
}
