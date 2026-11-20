import { idbGet, idbPut } from './idb';
import { parseError, errorLogger } from './error-handler';
import { getJwtFromStorage, getAgentJwtFromStorage, authStorageKey } from './auth-storage';
const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://madabingobot.onrender.com';
// Imported lazily to avoid circular dependency (auth.ts imports login() from here)
async function getReAuth() {
    const { reAuth } = await import('./auth');
    return reAuth;
}
// Deduplicate concurrent reAuth calls so multiple simultaneous 404s
// don't race to clear/reset the session at the same time.
let reAuthPromise = null;
async function deduplicatedReAuth() {
    if (reAuthPromise)
        return reAuthPromise;
    const reAuth = await getReAuth();
    reAuthPromise = reAuth().finally(() => { reAuthPromise = null; });
    return reAuthPromise;
}
function getJwt() {
    return getJwtFromStorage();
}
function getAgentJwt() {
    return getAgentJwtFromStorage();
}
function buildHeaders(hasBody = false) {
    const headers = {};
    const jwt = getJwt();
    if (jwt) {
        headers['Authorization'] = `Bearer ${jwt}`;
    }
    if (hasBody) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}
function buildAgentHeaders(hasBody = false) {
    const headers = {};
    const agentJwt = getAgentJwt();
    if (agentJwt) {
        headers['Authorization'] = `Bearer ${agentJwt}`;
    }
    if (hasBody) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function fetchOnce(method, path, body) {
    const hasBody = body !== undefined;
    const headers = buildHeaders(hasBody);
    // Prevent browser from serving stale cached responses for GET requests
    if (!hasBody)
        headers['Cache-Control'] = 'no-cache';
    console.log(`[API] ${method} ${BASE_URL}${path}`, { headers: Object.keys(headers) });
    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            body: hasBody ? JSON.stringify(body) : null,
        });
        console.log(`[API] Response:`, {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
        });
        return response;
    }
    catch (error) {
        console.error(`[API] Network error:`, error);
        throw error;
    }
}
function shouldReAuthOnNotFound(path, errorData) {
    if (errorData.error !== 'NOT_FOUND')
        return false;
    const normalizedPath = path.toLowerCase();
    const message = typeof errorData.message === 'string' ? errorData.message.toLowerCase() : '';
    // Only re-auth when the backend says the player record itself is missing.
    // Other not found cases like missing rounds, cartelas, or history items should
    // surface normally without resetting the session.
    return normalizedPath.startsWith('/api/players') ||
        (message.includes('player') && message.includes('not found'));
}
export async function apiRequest(method, path, body) {
    const maxRetries = 3;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let response = await fetchOnce(method, path, body);
        // 401 handling: wait for auth to complete on first 2 attempts, then clear on final attempt
        if (response.status === 401) {
            if (attempt < maxRetries) {
                // Auth might still be initializing - wait and retry with exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt), 4000); // 1s, 2s, 4s max
                console.log(`[API] 401 on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${delay}ms...`);
                await sleep(delay);
                // Check if auth completed during our wait
                const jwt = getJwt();
                if (jwt) {
                    continue; // Retry with the new token
                }
            }
            // Final attempt failed or no token available - clear session and reload
            // so RegistrationGate picks up the cleared state and shows the login screen.
            console.error('[API] 401 Unauthorized after retries, clearing session');
            // Only clear auth keys, not all of localStorage (preserves settings like soundOn)
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.endsWith(':jwt') || k.endsWith(':playerId') || k.endsWith(':phoneVerified') || k.endsWith(':agentJwt') || k.endsWith(':agentId'))) {
                    keysToRemove.push(k);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            window.location.reload();
            throw new Error('Unauthorized');
        }
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            // Log the error for debugging
            console.error(`API Error [${method} ${path}]:`, {
                status: response.status,
                error: errorData,
                url: `${BASE_URL}${path}`,
                attempt: attempt + 1,
            });
            // Stale JWT pointing at a deleted/reset player — re-auth and retry once.
            // Avoid retrying for unrelated 404s such as missing rounds or cartelas.
            if (response.status === 404 && shouldReAuthOnNotFound(path, errorData)) {
                await deduplicatedReAuth();
                response = await fetchOnce(method, path, body);
                if (response.ok)
                    return response.json();
                // If still failing after re-auth, fall through to throw
                const retryError = await response.json().catch(() => ({ message: response.statusText }));
                throw Object.assign(new Error(retryError.message ?? 'Request failed'), {
                    status: response.status,
                    code: retryError.error,
                });
            }
            lastError = Object.assign(new Error(errorData.message ?? 'Request failed'), {
                status: response.status,
                code: errorData.error,
                statusCode: response.status,
            });
            // Log structured error
            const appError = parseError(lastError);
            errorLogger.log(appError, { method, path, attempt: attempt + 1 });
            // Don't retry 4xx errors other than 401 (client errors are permanent)
            if (response.status >= 400 && response.status < 500 && response.status !== 401) {
                throw lastError;
            }
            // Retry 5xx errors with exponential backoff
            if (attempt < maxRetries && response.status >= 500) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
                console.log(`[API] Server error, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
                await sleep(delay);
                continue;
            }
            throw lastError;
        }
        return response.json();
    }
    throw lastError ?? new Error('Request failed after retries');
}
async function fetchOnceAgent(method, path, body) {
    const hasBody = body !== undefined;
    return fetch(`${BASE_URL}${path}`, {
        method,
        headers: buildAgentHeaders(hasBody),
        body: hasBody ? JSON.stringify(body) : null,
    });
}
export async function agentApiRequest(method, path, body) {
    const response = await fetchOnceAgent(method, path, body);
    if (response.status === 401) {
        // Clear agent session but don't redirect - just throw error
        localStorage.removeItem(authStorageKey('agentJwt'));
        localStorage.removeItem(authStorageKey('agentId'));
        throw new Error('Agent session expired');
    }
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw Object.assign(new Error(errorData.message ?? 'Request failed'), {
            status: response.status,
            code: errorData.error,
        });
    }
    return response.json();
}
// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export function login(initData, start) {
    return apiRequest('POST', '/api/auth/login', { initData, start });
}
export function webLogin(phone) {
    return apiRequest('POST', '/api/auth/web-login', { phone });
}
// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
export function getProfile() {
    return apiRequest('GET', '/api/players/me');
}
// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------
export function getRounds() {
    return apiRequest('GET', '/api/rounds');
}
export function getSystemStats() {
    return apiRequest('GET', '/api/system/stats');
}
export function getRound(id) {
    return apiRequest('GET', `/api/rounds/${id}`);
}
export function getCalledNumbers(roundId) {
    return apiRequest('GET', `/api/rounds/${roundId}/called-numbers`);
}
export function getCartelaAvailability(roundId) {
    return apiRequest('GET', `/api/rounds/${roundId}/cartelas`);
}
export function getCartelaGrid(roundId, cartelaNumber) {
    return apiRequest('GET', `/api/rounds/${roundId}/cartelas/${cartelaNumber}/grid`);
}
export async function getCartelaGridCached(roundId, cartelaNumber) {
    // Use cartelaNumber-only key (no roundId) so admin edits to a cartela
    // are reflected on next fetch rather than serving a stale per-round entry.
    // TTL: 1 hour — cartela grids rarely change but must reflect admin edits promptly.
    const key = `cartela:${cartelaNumber}`;
    const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
    const cached = await idbGet('cartelas', key);
    if (cached && cached.cachedAt && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return { cartela_number: cached.cartela_number, grid: cached.grid };
    }
    const result = await apiRequest('GET', `/api/rounds/${roundId}/cartelas/${cartelaNumber}/grid`);
    idbPut('cartelas', key, { ...result, cachedAt: Date.now() }).catch(() => { }); // fire-and-forget, quota errors silenced
    return result;
}
export async function getMyCartelas(roundId) {
    const result = await apiRequest('GET', `/api/rounds/${roundId}/my-cartelas`);
    // Write each cartela grid to IDB with cartelaNumber-only key + timestamp so admin edits
    // are picked up after the TTL expires (see getCartelaGridCached).
    for (const c of result.cartelas) {
        const key = `cartela:${c.cartelaNumber}`;
        idbPut('cartelas', key, { cartela_number: c.cartelaNumber, grid: c.cartelaGrid, cachedAt: Date.now() }).catch(() => { });
    }
    return result;
}
export function joinRound(roundId, cartelaNumber) {
    return apiRequest('POST', `/api/rounds/${roundId}/join`, { cartelaNumber });
}
export function joinRoundBatch(roundId, cartelaNumbers) {
    return apiRequest('POST', `/api/rounds/${roundId}/join-batch`, { cartelaNumbers });
}
export function leaveRound(roundId, cartelaNumber) {
    return apiRequest('DELETE', `/api/rounds/${roundId}/leave/${cartelaNumber}`);
}
export function getSystemState() {
    return apiRequest('GET', '/api/system/state');
}
// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
export function getHistory(page = 1) {
    return apiRequest('GET', `/api/history?page=${page}`);
}
export function getHistoryDetail(roundId) {
    const key = `history:${roundId}`;
    return idbGet('cartelas', key).then(async (cached) => {
        if (cached)
            return cached;
        const detail = await apiRequest('GET', `/api/history/${roundId}`);
        // History detail is immutable once the round is over — cache indefinitely
        idbPut('cartelas', key, detail).catch(() => { });
        return detail;
    });
}
// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------
export function getDepositTotal() {
    return apiRequest('GET', '/api/wallet/deposit-total');
}
export function getWalletTransactions(page = 1, pageSize = 20) {
    return apiRequest('GET', `/api/wallet/transactions?page=${page}&pageSize=${pageSize}`);
}
export function depositFunds(amount) {
    return apiRequest('POST', '/api/wallet/deposit', { amount });
}
export function getDepositAccounts() {
    return apiRequest('GET', '/api/wallet/deposit/accounts');
}
export function verifyManualDeposit(amount, receipt) {
    return apiRequest('POST', '/api/wallet/deposit/manual', { amount, receipt });
}
export function withdrawFunds(amount, phone, receiverName) {
    return apiRequest('POST', '/api/wallet/withdraw', { amount, phone, receiverName });
}
export function getPendingRequests() {
    return apiRequest('GET', '/api/wallet/pending');
}
// ---------------------------------------------------------------------------
// Referral
// ---------------------------------------------------------------------------
export function getReferralLink() {
    return apiRequest('GET', '/api/referral/link');
}
// ---------------------------------------------------------------------------
// Phone verification
// ---------------------------------------------------------------------------
export function verifyPhone(phone) {
    return apiRequest('POST', '/api/players/verify-phone', { phone });
}
// ---------------------------------------------------------------------------
// Agent API
// ---------------------------------------------------------------------------
export function getAgentDashboard() {
    return agentApiRequest('GET', '/api/agent/dashboard');
}
export function getAgentInviteLink() {
    return agentApiRequest('GET', '/api/agent/invite-link');
}
export function getAgentWithdrawals() {
    return agentApiRequest('GET', '/api/agent/withdrawals');
}
export function requestAgentWithdrawal(amount, phone) {
    return agentApiRequest('POST', '/api/agent/withdrawals', { amount, phone });
}
export function getLeaderboard() {
    return apiRequest('GET', '/api/leaderboard');
}
// ─── Coupon redemption ────────────────────────────────────────────────────────
export function redeemCoupon(code) {
    return apiRequest('POST', '/api/wallet/redeem-coupon', { code });
}
export function getAvailableCoupons() {
    return apiRequest('GET', '/api/wallet/available-coupons');
}
export function getDailySpinStatus() {
    return apiRequest('GET', '/api/wallet/daily-spin/status');
}
export function claimDailySpin() {
    return apiRequest('POST', '/api/wallet/daily-spin/claim');
}
//# sourceMappingURL=api.js.map