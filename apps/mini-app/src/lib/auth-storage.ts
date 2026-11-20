/**
 * Namespaced localStorage helpers for auth tokens.
 * Keys are scoped per Telegram user ID so multiple accounts
 * on the same device don't share session data.
 *
 * In a web (non-Telegram) context, falls back to the prefix "web"
 * so storage keys are stable across page loads.
 *
 * Imported by both auth.ts and api.ts (no circular dependency).
 */
import WebApp from '@twa-dev/sdk';

export function getAuthPrefix(): string {
  const userId = (WebApp.initDataUnsafe as { user?: { id?: number } }).user?.id;
  if (userId) return `tg_${userId}`;
  // Web context: use a fixed prefix so the stored JWT survives page reloads
  return 'web';
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
