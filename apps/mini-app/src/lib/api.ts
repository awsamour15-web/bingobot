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
import { parseError, errorLogger } from './error-handler';
import { getJwtFromStorage, getAgentJwtFromStorage, authStorageKey } from './auth-storage';

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

// Agent dashboard types
export interface AgentCommissionWithdrawal {
  id: string;
  amount: number;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  txNumber?: string | null;
}

export interface AgentDashboardStats {
  totalPlayersInvited: number;
  totalCommission: number;
  weeklyCommission: number;   // UTC+3 current week Mon–Sun
  dailyCommission: number;    // UTC+3 today
  commissionBalance: number;
  players: AgentPlayerRow[];
  withdrawalRequests: AgentCommissionWithdrawal[];
}

export interface AgentPlayerRow {
  playerId: string;
  username: string;
  depositBalance: number;     // play wallet balance
  totalCommissionFromPlayer: number;
  joinedAt: string;           // ISO date
}

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
  return getJwtFromStorage();
}

function getAgentJwt(): string | null {
  return getAgentJwtFromStorage();
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

function buildAgentHeaders(hasBody = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const agentJwt = getAgentJwt();
  if (agentJwt) {
    headers['Authorization'] = `Bearer ${agentJwt}`;
  }
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOnce(method: string, path: string, body?: unknown): Promise<Response> {
  const hasBody = body !== undefined;
  const headers = buildHeaders(hasBody);
  // Prevent browser from serving stale cached responses for GET requests
  if (!hasBody) headers['Cache-Control'] = 'no-cache';
  
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
  } catch (error) {
    console.error(`[API] Network error:`, error);
    throw error;
  }
}

function shouldReAuthOnNotFound(path: string, errorData: { error?: string; message?: string }): boolean {
  if (errorData.error !== 'NOT_FOUND') return false;

  const normalizedPath = path.toLowerCase();
  const message = typeof errorData.message === 'string' ? errorData.message.toLowerCase() : '';

  // Only re-auth when the backend says the player record itself is missing.
  // Other not found cases like missing rounds, cartelas, or history items should
  // surface normally without resetting the session.
  return normalizedPath.startsWith('/api/players') ||
    (message.includes('player') && message.includes('not found'));
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const maxRetries = 3;
  let lastError: Error | null = null;

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
      
      // Final attempt failed or no token available - clear and redirect
      console.error('[API] 401 Unauthorized after retries, clearing session');
      localStorage.clear();
      window.location.href = '/';
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

        if (response.ok) return response.json() as Promise<T>;

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

    return response.json() as Promise<T>;
  }

  throw lastError ?? new Error('Request failed after retries');
}

async function fetchOnceAgent(method: string, path: string, body?: unknown): Promise<Response> {
  const hasBody = body !== undefined;
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: buildAgentHeaders(hasBody),
    body: hasBody ? JSON.stringify(body) : null,
  });
}

export async function agentApiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
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

export function getSystemStats(): Promise<{ totalPlayers: number; totalGames: number }> {
  return apiRequest<{ totalPlayers: number; totalGames: number }>('GET', '/api/system/stats');
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
  // Use cartelaNumber-only key (no roundId) so admin edits to a cartela
  // are reflected on next fetch rather than serving a stale per-round entry.
  // TTL: 1 hour — cartela grids rarely change but must reflect admin edits promptly.
  const key = `cartela:${cartelaNumber}`;
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  const cached = await idbGet<{ cartela_number: number; grid: number[]; cachedAt?: number }>('cartelas', key);
  if (cached && cached.cachedAt && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { cartela_number: cached.cartela_number, grid: cached.grid };
  }
  const result = await apiRequest<{ cartela_number: number; grid: number[] }>(
    'GET',
    `/api/rounds/${roundId}/cartelas/${cartelaNumber}/grid`,
  );
  idbPut('cartelas', key, { ...result, cachedAt: Date.now() }).catch(() => {}); // fire-and-forget, quota errors silenced
  return result;
}

export async function getMyCartelas(roundId: string): Promise<{ cartelas: Array<{ cartelaNumber: number; cartelaGrid: number[] }> }> {
  const result = await apiRequest<{ cartelas: Array<{ cartelaNumber: number; cartelaGrid: number[] }> }>('GET', `/api/rounds/${roundId}/my-cartelas`);
  // Write each cartela grid to IDB with cartelaNumber-only key + timestamp so admin edits
  // are picked up after the TTL expires (see getCartelaGridCached).
  for (const c of result.cartelas) {
    const key = `cartela:${c.cartelaNumber}`;
    idbPut('cartelas', key, { cartela_number: c.cartelaNumber, grid: c.cartelaGrid, cachedAt: Date.now() }).catch(() => {});
  }
  return result;
}

export function joinRound(roundId: string, cartelaNumber: number): Promise<JoinRoundResponse> {
  return apiRequest<JoinRoundResponse>('POST', `/api/rounds/${roundId}/join`, { cartelaNumber });
}

export function joinRoundBatch(roundId: string, cartelaNumbers: number[]): Promise<{ cartelaNumbers: number[]; mainWalletBalance: number; playWalletBalance: number }> {
  return apiRequest('POST', `/api/rounds/${roundId}/join-batch`, { cartelaNumbers });
}

export function leaveRound(roundId: string, cartelaNumber: number): Promise<{ ok: boolean; mainWalletBalance: number; playWalletBalance: number }> {
  return apiRequest<{ ok: boolean; mainWalletBalance: number; playWalletBalance: number }>('DELETE', `/api/rounds/${roundId}/leave/${cartelaNumber}`);
}

// ---------------------------------------------------------------------------
// System state
// ---------------------------------------------------------------------------

export interface SystemState {
  phase: 'cartela' | 'live' | 'idle';
  roundId: string | null;
  stake: number | null;
}

export function getSystemState(): Promise<SystemState> {
  return apiRequest<SystemState>('GET', '/api/system/state');
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

export interface DepositAccountOption {
  phone: string;
  name: string;
}

export interface ManualDepositResponse {
  success: boolean;
  amount: number;
  txNumber: string;
  message: string;
}

export function depositFunds(amount: number): Promise<DepositResponse> {
  return apiRequest<DepositResponse>('POST', '/api/wallet/deposit', { amount });
}

export function getDepositAccounts(): Promise<{ accounts: DepositAccountOption[] }> {
  return apiRequest<{ accounts: DepositAccountOption[] }>('GET', '/api/wallet/deposit/accounts');
}

export function verifyManualDeposit(amount: number, receipt: string): Promise<ManualDepositResponse> {
  return apiRequest<ManualDepositResponse>('POST', '/api/wallet/deposit/manual', { amount, receipt });
}

export function withdrawFunds(amount: number, phone: string, receiverName?: string): Promise<void> {
  return apiRequest<void>('POST', '/api/wallet/withdraw', { amount, phone, receiverName });
}

export interface PendingDepositItem {
  id: string;
  type: 'deposit';
  amount: number;
  status: string;
  tx_number: string | null;
  created_at: string;
}

export interface PendingWithdrawalItem {
  id: string;
  type: 'withdrawal';
  amount: number;
  status: string;
  phone: string;
  created_at: string;
}

export function getPendingRequests(): Promise<{ deposits: PendingDepositItem[]; withdrawals: PendingWithdrawalItem[] }> {
  return apiRequest('GET', '/api/wallet/pending');
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

// ---------------------------------------------------------------------------
// Agent API
// ---------------------------------------------------------------------------

export function getAgentDashboard(): Promise<AgentDashboardStats> {
  return agentApiRequest<AgentDashboardStats>('GET', '/api/agent/dashboard');
}

export function getAgentInviteLink(): Promise<{ playerInviteLink: string }> {
  return agentApiRequest<{ playerInviteLink: string }>('GET', '/api/agent/invite-link');
}

export function getAgentWithdrawals(): Promise<AgentCommissionWithdrawal[]> {
  return agentApiRequest<AgentCommissionWithdrawal[]>('GET', '/api/agent/withdrawals');
}

export function requestAgentWithdrawal(amount: number, phone: string): Promise<{
  success: boolean;
  message: string;
  withdrawal: AgentCommissionWithdrawal;
}> {
  return agentApiRequest<{ success: boolean; message: string; withdrawal: AgentCommissionWithdrawal }>(
    'POST',
    '/api/agent/withdrawals',
    { amount, phone },
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  wins: number;
  totalPrize: number;
  isCurrentPlayer: boolean;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  currentPlayerRank: { rank: number; wins: number; totalPrize: number } | null;
}

export function getLeaderboard(): Promise<LeaderboardResponse> {
  return apiRequest<LeaderboardResponse>('GET', '/api/leaderboard');
}

// ---------------------------------------------------------------------------
// Crash Game
// ---------------------------------------------------------------------------

export interface CrashBetEntry {
  username: string;
  betAmount: number;
  cashoutAt: number | null;
  payout: number | null;
}

export interface CrashState {
  phase: 'waiting' | 'running' | 'crashed' | 'idle';
  round: {
    id: string;
    status: string;
    startedAt: string | null;
    crashPoint: number | null;
    currentMultiplier: number | null;
  } | null;
  myBet: {
    betAmount: number;
    cashoutAt: number | null;
    payout: number | null;
  } | null;
  myBet2: {
    betAmount: number;
    cashoutAt: number | null;
    payout: number | null;
  } | null;
  bets: CrashBetEntry[];
}

export interface CrashHistoryEntry {
  id: string;
  crashPoint: number | null;
  crashedAt: string | null;
}

export function getCrashState(): Promise<CrashState> {
  return apiRequest<CrashState>('GET', '/api/crash/state');
}

export function placeCrashBet(betAmount: number, slot: 1 | 2 = 1, autoCashoutAt?: number, walletType?: 'main' | 'play'): Promise<{ roundId: string; betAmount: number; slot: number }> {
  return apiRequest('POST', '/api/crash/bet', { betAmount, slot, autoCashoutAt, walletType });
}

export function getCrashHistory(): Promise<CrashHistoryEntry[]> {
  return apiRequest<CrashHistoryEntry[]>('GET', '/api/crash/history');
}

// ---------------------------------------------------------------------------
// Slots Game
// ---------------------------------------------------------------------------

export type SlotSymbol = 'cherry' | 'watermelon' | 'orange' | 'lemon' | 'bell' | 'double_dollar' | 'seven';

export interface PaylineWin {
  line: number;
  symbols: SlotSymbol[];
  payout: number;
}

export interface SpinResponse {
  spinId: string;
  reels: SlotSymbol[][];   // 3 columns × 3 rows
  multiplierReel: number;
  paylineWins: PaylineWin[];
  totalWin: number;
  balance: number;
  canGamble: boolean;
}

export interface GambleResponse {
  guess: 'red' | 'black';
  actual: 'red' | 'black';
  won: boolean;
  payout: number;
  balance: number;
}

export interface SlotHistoryEntry {
  id: string;
  betAmount: number;
  totalWin: number;
  multiplierReel: number;
  status: 'win' | 'loss';
  createdAt: string;
}

export function spinSlots(betAmount: number): Promise<SpinResponse> {
  return apiRequest<SpinResponse>('POST', '/api/slots/spin', { betAmount });
}

export function gambleSlots(spinId: string, guess: 'red' | 'black'): Promise<GambleResponse> {
  return apiRequest<GambleResponse>('POST', '/api/slots/gamble', { spinId, guess });
}

export function getSlotsHistory(): Promise<SlotHistoryEntry[]> {
  return apiRequest<SlotHistoryEntry[]>('GET', '/api/slots/history');
}

// ---------------------------------------------------------------------------
// Keno Game
// ---------------------------------------------------------------------------

export interface KenoState {
  phase: 'betting' | 'drawing' | 'finished' | 'idle';
  round: {
    id: string;
    status: string;
    bettingEndsAt: string;
    drawnNumbers: number[];
  } | null;
  myBet: {
    id: string;
    pickedNumbers: number[];
    betAmount: number;
    matched: number | null;
    payout: number | null;
  } | null;
  myBets: {
    id: string;
    pickedNumbers: number[];
    betAmount: number;
    matched: number | null;
    payout: number | null;
  }[];
  bets: {
    username: string;
    pickedNumbers: number[];
    pickedCount: number;
    betAmount: number;
    matched: number | null;
    payout: number | null;
  }[];
}

export function getKenoState(): Promise<KenoState> {
  return apiRequest<KenoState>('GET', '/api/keno/state');
}

export function placeKenoBet(betAmount: number, pickedNumbers: number[]): Promise<{ betId: string; roundId: string; bettingEndsAt: string }> {
  return apiRequest('POST', '/api/keno/bet', { betAmount, pickedNumbers });
}

export function getKenoHistory(): Promise<{
  id: string;
  drawnNumbers: number[];
  finishedAt: string;
  myBet: { pickedNumbers: number[]; betAmount: number; matched: number | null; payout: number | null } | null;
}[]> {
  return apiRequest('GET', '/api/keno/history');
}

export function checkKenoAccess(): Promise<{ allowed: boolean }> {
  return apiRequest<{ allowed: boolean }>('GET', '/api/keno/access');
}

export function getKenoLeaderboard(): Promise<LeaderboardResponse> {
  return apiRequest<LeaderboardResponse>('GET', '/api/keno/leaderboard');
}

// ─── Plinko ──────────────────────────────────────────────────────────────────

export function checkPlinkoAccess(): Promise<{ allowed: boolean }> {
  return apiRequest<{ allowed: boolean }>('GET', '/api/plinko/access');
}

export function dropPlinko(betAmount: number, rows: 8 | 12 | 16, risk: 'low' | 'medium' | 'high', walletType?: 'main' | 'play'): Promise<{
  id: string; path: number[]; slot: number; multiplier: number; payout: number; betAmount: number; totalBalance: number;
}> {
  return apiRequest('POST', '/api/plinko/drop', { betAmount, rows, risk, walletType });
}

export function getPlinkoHistory(): Promise<{
  id: string; betAmount: number; rows: number; risk: string; slot: number; multiplier: number; payout: number; createdAt: string;
}[]> {
  return apiRequest('GET', '/api/plinko/history');
}

// ─── Coupon redemption ────────────────────────────────────────────────────────

export function redeemCoupon(code: string): Promise<{ success: boolean; amount: number; message: string }> {
  return apiRequest('POST', '/api/wallet/redeem-coupon', { code });
}
