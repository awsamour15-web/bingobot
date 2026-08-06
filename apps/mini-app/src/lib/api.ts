import type {
  LoginResponse,
  PlayerProfile,
  RoundListItem,
  RoundDetail,
  CartelaAvailability,
  JoinRoundResponse,
  HistoryEntry,
  HistoryDetail,
  TransactionListItem,
  DepositResponse,
  ReferralStats,
  PaginatedResponse,
} from '@fidel/shared';
import { idbGet, idbPut } from './idb';

// Re-export types for screens that can't resolve the workspace package directly
export type {
  LoginResponse,
  PlayerProfile,
  RoundListItem,
  RoundDetail,
  CartelaAvailability,
  JoinRoundResponse,
  HistoryEntry,
  HistoryDetail,
  TransactionListItem,
  DepositResponse,
  ReferralStats,
  PaginatedResponse,
};

// Re-export WebSocket payload types
export type {
  NumberCalledPayload,
  RoundStartedPayload,
  RoundWonPayload,
  RoundVoidPayload,
  RoundCancelledPayload,
  PlayerJoinedPayload,
  WinRejectedPayload,
} from '@fidel/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://bingobot-vpif.onrender.com';

// Imported lazily to avoid circular dependency (auth.ts imports login() from here)
async function getReAuth(): Promise<() => Promise<void>> {
  const { reAuth } = await import('./auth');
  return reAuth;
}

// Deduplicate concurrent reAuth calls so multiple simultaneous 404s
// don't race to clear/reset the session at the same time.
let reAuthPromise: Promise<void> | null = null;
async function deduplicatedReAuth(): Promise<void> {
  if (reAuthPromise) return reAuthPromise;
  const reAuth = await getReAuth();
  reAuthPromise = reAuth().finally(() => { reAuthPromise = null; });
  return reAuthPromise;
}

function getJwt(): string | null {
  return localStorage.getItem('jwt');
}

function buildHeaders(hasBody = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const jwt = getJwt();
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function fetchOnce(method: string, path: string, body?: unknown): Promise<Response> {
  const hasBody = body !== undefined;
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: buildHeaders(hasBody),
    body: hasBody ? JSON.stringify(body) : null,
  });
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response = await fetchOnce(method, path, body);

  if (response.status === 401) {
    localStorage.clear();
    window.location.href = '/';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));

    // Stale JWT pointing at a deleted/reset player — re-auth and retry once
    if (response.status === 404 && errorData.error === 'NOT_FOUND') {
      await deduplicatedReAuth();
      response = await fetchOnce(method, path, body);

      if (response.ok) return response.json() as Promise<T>;

      // If still failing after re-auth, fall through to throw
      const retryError = await response.json().catch(() => ({ message: response.statusText }));
      throw Object.assign(new Error(retryError.message ?? 'Request failed'), {
        status: response.status,
        code: retryError.error,
      });
    }

    throw Object.assign(new Error(errorData.message ?? 'Request failed'), {
      status: response.status,
      code: errorData.error,
    });
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function login(initData: string, start?: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('POST', '/api/auth/login', { initData, start });
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export function getProfile(): Promise<PlayerProfile> {
  return apiRequest<PlayerProfile>('GET', '/api/players/me');
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export function getRounds(): Promise<RoundListItem[]> {
  return apiRequest<RoundListItem[]>('GET', '/api/rounds');
}

export function getRound(id: string): Promise<RoundDetail> {
  return apiRequest<RoundDetail>('GET', `/api/rounds/${id}`);
}

export function getCalledNumbers(roundId: string): Promise<number[]> {
  return apiRequest<number[]>('GET', `/api/rounds/${roundId}/called-numbers`);
}

export function getCartelaAvailability(roundId: string): Promise<CartelaAvailability> {
  return apiRequest<CartelaAvailability>('GET', `/api/rounds/${roundId}/cartelas`);
}

export function getCartelaGrid(roundId: string, cartelaNumber: number): Promise<{ cartela_number: number; grid: number[] }> {
  return apiRequest<{ cartela_number: number; grid: number[] }>('GET', `/api/rounds/${roundId}/cartelas/${cartelaNumber}/grid`);
}

export async function getCartelaGridCached(
  roundId: string,
  cartelaNumber: number,
): Promise<{ cartela_number: number; grid: number[] }> {
  const key = `${roundId}:${cartelaNumber}`;
  const cached = await idbGet<{ cartela_number: number; grid: number[] }>('cartelas', key);
  if (cached) return cached;
  const result = await apiRequest<{ cartela_number: number; grid: number[] }>(
    'GET',
    `/api/rounds/${roundId}/cartelas/${cartelaNumber}/grid`,
  );
  idbPut('cartelas', key, result).catch(() => {}); // fire-and-forget, quota errors silenced
  return result;
}

export async function getMyCartelas(roundId: string): Promise<{ cartelas: Array<{ cartelaNumber: number; cartelaGrid: number[] }> }> {
  const result = await apiRequest<{ cartelas: Array<{ cartelaNumber: number; cartelaGrid: number[] }> }>('GET', `/api/rounds/${roundId}/my-cartelas`);
  // Write each cartela grid to IDB so a mid-game reload can skip the API call
  for (const c of result.cartelas) {
    const key = `${roundId}:${c.cartelaNumber}`;
    idbPut('cartelas', key, { cartela_number: c.cartelaNumber, grid: c.cartelaGrid }).catch(() => {});
  }
  return result;
}

export function joinRound(roundId: string, cartelaNumber: number): Promise<JoinRoundResponse> {
  return apiRequest<JoinRoundResponse>('POST', `/api/rounds/${roundId}/join`, { cartelaNumber });
}

export function joinRoundBatch(roundId: string, cartelaNumbers: number[]): Promise<{ cartelaNumbers: number[]; mainWalletBalance: number; playWalletBalance: number }> {
  return apiRequest('POST', `/api/rounds/${roundId}/join-batch`, { cartelaNumbers });
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export function getHistory(page = 1): Promise<PaginatedResponse<HistoryEntry>> {
  return apiRequest<PaginatedResponse<HistoryEntry>>('GET', `/api/history?page=${page}`);
}

export function getHistoryDetail(roundId: string): Promise<HistoryDetail> {
  const key = `history:${roundId}`;
  return idbGet<HistoryDetail>('cartelas', key).then(async (cached) => {
    if (cached) return cached;
    const detail = await apiRequest<HistoryDetail>('GET', `/api/history/${roundId}`);
    // History detail is immutable once the round is over — cache indefinitely
    idbPut('cartelas', key, detail).catch(() => {});
    return detail;
  });
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export function getWalletTransactions(page = 1): Promise<PaginatedResponse<TransactionListItem>> {
  return apiRequest<PaginatedResponse<TransactionListItem>>('GET', `/api/wallet/transactions?page=${page}`);
}

export function depositFunds(amount: number): Promise<DepositResponse> {
  return apiRequest<DepositResponse>('POST', '/api/wallet/deposit', { amount });
}

export function withdrawFunds(amount: number, phone: string): Promise<void> {
  return apiRequest<void>('POST', '/api/wallet/withdraw', { amount, phone });
}

// ---------------------------------------------------------------------------
// Referral
// ---------------------------------------------------------------------------

export function getReferralLink(): Promise<ReferralStats> {
  return apiRequest<ReferralStats>('GET', '/api/referral/link');
}

// ---------------------------------------------------------------------------
// Phone verification
// ---------------------------------------------------------------------------

export function verifyPhone(phone: string): Promise<void> {
  return apiRequest<void>('POST', '/api/players/verify-phone', { phone });
}
