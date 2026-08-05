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

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const hasBody = body !== undefined;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: buildHeaders(hasBody),
    body: hasBody ? JSON.stringify(body) : null,
  });

  if (response.status === 401) {
    localStorage.clear();
    window.location.href = '/';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    // Stale JWT pointing at a deleted/reset player — treat as session expired
    if (response.status === 404 && errorData.error === 'NOT_FOUND' && path === '/api/players/me') {
      localStorage.clear();
      window.location.href = '/';
      throw new Error('Session expired');
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

export function joinRound(roundId: string, cartelaNumber: number): Promise<JoinRoundResponse> {
  return apiRequest<JoinRoundResponse>('POST', `/api/rounds/${roundId}/join`, { cartelaNumber });
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export function getHistory(page = 1): Promise<PaginatedResponse<HistoryEntry>> {
  return apiRequest<PaginatedResponse<HistoryEntry>>('GET', `/api/history?page=${page}`);
}

export function getHistoryDetail(roundId: string): Promise<HistoryDetail> {
  return apiRequest<HistoryDetail>('GET', `/api/history/${roundId}`);
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
