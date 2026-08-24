/**
 * Namespaced localStorage helpers for auth tokens.
 * Keys are scoped per Telegram user ID so multiple accounts
 * on the same device don't share session data.
 *
 * Imported by both auth.ts and api.ts (no circular dependency).
 */
import WebApp from '@twa-dev/sdk';

export function getAuthPrefix(): string {
  const userId = (WebApp.initDataUnsafe as { user?: { id?: number } }).user?.id;
  return userId ? `tg_${userId}` : 'dev';
}

export function authStorageKey(key: string): string {
  return `${getAuthPrefix()}:${key}`;
}

export function getJwtFromStorage(): string | null {
  return localStorage.getItem(authStorageKey('jwt'));
}

export function getAgentJwtFromStorage(): string | null {
  return localStorage.getItem(authStorageKey('agentJwt'));
}
