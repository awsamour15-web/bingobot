import WebApp from '@twa-dev/sdk';
import { login } from './api';
import { authStorageKey } from './auth-storage';
// In development, WebApp.initData may be empty. Use a mock fallback.
const DEV_MOCK_INIT_DATA = 'mock_init_data_for_development';
// In-flight promise to prevent concurrent login calls
let authPromise = null;
// Alias for brevity
const storageKey = authStorageKey;
/**
 * Returns true when the app is running inside a Telegram WebView.
 * We check for a non-empty initData string — Telegram always provides it.
 */
export function isTelegramContext() {
    return !!WebApp.initData;
}
/**
 * Decodes the JWT payload without verifying the signature.
 * We only use this to check the `exp` claim client-side — the server
 * still performs full verification on every request.
 */
function getJwtExpiry(token) {
    try {
        const payload = token.split('.')[1];
        if (!payload)
            return null;
        const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        return decoded.exp ?? null;
    }
    catch {
        return null;
    }
}
/**
 * Returns true only if we have a JWT that hasn't expired yet.
 * A 60-second buffer ensures we re-auth before the token actually expires.
 */
export function isLoggedIn() {
    const jwt = localStorage.getItem(storageKey('jwt'));
    const playerId = localStorage.getItem(storageKey('playerId'));
    if (!jwt || !playerId)
        return false;
    const exp = getJwtExpiry(jwt);
    if (exp === null)
        return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    return exp - nowSeconds > 60; // re-auth if less than 60s left
}
export function clearSession() {
    localStorage.removeItem(storageKey('jwt'));
    localStorage.removeItem(storageKey('playerId'));
    localStorage.removeItem(storageKey('phoneVerified'));
    localStorage.removeItem(storageKey('agentJwt'));
    localStorage.removeItem(storageKey('agentId'));
}
async function doLogin() {
    // Web (non-Telegram) context — do NOT attempt initData login.
    // The user must authenticate via the WebLoginScreen (phone number).
    // If they already have a valid stored JWT from a previous web login, isLoggedIn()
    // will return true and this function won't be called.
    if (!WebApp.initData) {
        // No Telegram context and no stored session — throw so callers know
        // the user needs to log in via the web login screen.
        throw new Error('WEB_NO_SESSION');
    }
    const initData = WebApp.initData || DEV_MOCK_INIT_DATA;
    console.log('[Auth] Attempting Telegram login...', {
        hasInitData: !!WebApp.initData,
        initDataLength: WebApp.initData?.length || 0,
    });
    const startParam = WebApp.initDataUnsafe.start_param;
    try {
        const response = await login(initData, startParam);
        console.log('[Auth] Login successful', { playerId: response.playerId });
        localStorage.setItem(storageKey('jwt'), response.token);
        localStorage.setItem(storageKey('playerId'), response.playerId);
        localStorage.setItem(storageKey('phoneVerified'), String(response.phoneVerified ?? false));
        if (response.agentToken) {
            localStorage.setItem(storageKey('agentJwt'), response.agentToken);
        }
        if (response.agentId) {
            localStorage.setItem(storageKey('agentId'), response.agentId);
        }
    }
    catch (error) {
        console.error('[Auth] Login failed:', error);
        throw error;
    }
}
export async function initAuth() {
    // If logged in but phoneVerified is still false, force a fresh login to re-check
    const phoneVerifiedStored = localStorage.getItem(storageKey('phoneVerified'));
    if (isLoggedIn() && phoneVerifiedStored === 'true')
        return;
    if (authPromise)
        return authPromise;
    authPromise = doLogin().finally(() => {
        authPromise = null;
    });
    return authPromise;
}
/**
 * Stores a web login session (JWT + playerId) obtained from /api/auth/web-login.
 * Called by the WebLoginScreen after a successful phone login.
 */
export function storeWebSession(params) {
    localStorage.setItem(storageKey('jwt'), params.token);
    localStorage.setItem(storageKey('playerId'), params.playerId);
    localStorage.setItem(storageKey('phoneVerified'), String(params.phoneVerified));
    if (params.agentToken)
        localStorage.setItem(storageKey('agentJwt'), params.agentToken);
    if (params.agentId)
        localStorage.setItem(storageKey('agentId'), params.agentId);
}
/**
 * Clears the current session and forces a fresh login.
 */
export async function reAuth() {
    clearSession();
    return initAuth();
}
export function getPlayerId() {
    return localStorage.getItem(storageKey('playerId'));
}
export function getJwt() {
    return localStorage.getItem(storageKey('jwt'));
}
export function getAgentJwt() {
    return localStorage.getItem(storageKey('agentJwt'));
}
export function getAgentId() {
    return localStorage.getItem(storageKey('agentId'));
}
export function isPhoneVerified() {
    return localStorage.getItem(storageKey('phoneVerified')) === 'true';
}
//# sourceMappingURL=auth.js.map