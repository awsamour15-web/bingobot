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
export function getAuthPrefix() {
    const userId = WebApp.initDataUnsafe.user?.id;
    if (userId)
        return `tg_${userId}`;
    // Web context: use a fixed prefix so the stored JWT survives page reloads
    return 'web';
}
export function authStorageKey(key) {
    return `${getAuthPrefix()}:${key}`;
}
export function getJwtFromStorage() {
    return localStorage.getItem(authStorageKey('jwt'));
}
export function getAgentJwtFromStorage() {
    return localStorage.getItem(authStorageKey('agentJwt'));
}
//# sourceMappingURL=auth-storage.js.map