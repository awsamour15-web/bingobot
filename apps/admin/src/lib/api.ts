import type {
  AdminPlayer,
  AdminCreditRequest,
  AdminRound,
  CreateRoundRequest,
  WithdrawalRequest,
  RevenueStats,
  ConfigEntry,
  AdminAccount,
  CreateAdminRequest,
  UpdateAdminRequest,
  PaginatedResponse,
} from '@fidel/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://bingobot-vpif.onrender.com';

export function getAdminJwt(): string | null {
  return localStorage.getItem('adminJwt');
}

function buildAdminHeaders(hasBody = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const jwt = getAdminJwt();
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export async function adminApiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  _retries = 3,
): Promise<T> {
  const hasBody = body !== undefined;

  for (let attempt = 0; attempt < _retries; attempt++) {
    let response: Response;

    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: buildAdminHeaders(hasBody),
        ...(hasBody ? { body: JSON.stringify(body) } : {}),
      });
    } catch (networkErr) {
      // Network-level failure (e.g. Render waking up, CORS blocked on 503)
      if (attempt < _retries - 1) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw networkErr;
    }

    if (response.status === 503 && attempt < _retries - 1) {
      // Server sleeping on Render free tier — wait and retry
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }

    if (response.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
      throw new Error('Unauthorized');
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

  throw new Error('Request failed after retries');
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function adminLogin(
  username: string,
  password: string,
): Promise<{ token: string; adminId: string; role: import('@fidel/shared').AdminRole }> {
  return adminApiRequest('POST', '/api/admin/auth/login', { username, password });
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export function getPlayers(
  page: number,
  search?: string,
): Promise<PaginatedResponse<AdminPlayer>> {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  return adminApiRequest<PaginatedResponse<AdminPlayer>>('GET', `/api/admin/players?${params}`);
}

export function getPlayer(id: string): Promise<AdminPlayer> {
  return adminApiRequest<AdminPlayer>('GET', `/api/admin/players/${id}`);
}

export function suspendPlayer(id: string): Promise<void> {
  return adminApiRequest<void>('PATCH', `/api/admin/players/${id}/suspend`);
}

export function restorePlayer(id: string): Promise<void> {
  return adminApiRequest<void>('PATCH', `/api/admin/players/${id}/restore`);
}

export function creditPlayer(id: string, body: AdminCreditRequest): Promise<void> {
  return adminApiRequest<void>('POST', `/api/admin/players/${id}/credit`, body);
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export function getAdminRounds(page = 1): Promise<PaginatedResponse<AdminRound>> {
  return adminApiRequest<PaginatedResponse<AdminRound>>(
    'GET',
    `/api/admin/rounds?page=${page}`,
  );
}

export function createRound(body: CreateRoundRequest): Promise<AdminRound> {
  return adminApiRequest<AdminRound>('POST', '/api/admin/rounds', body);
}

export function startRound(id: string): Promise<void> {
  return adminApiRequest<void>('POST', `/api/admin/rounds/${id}/start`);
}

export function cancelRound(id: string): Promise<void> {
  return adminApiRequest<void>('DELETE', `/api/admin/rounds/${id}`);
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------

export function getWithdrawals(): Promise<WithdrawalRequest[]> {
  console.log('[API] Calling GET /api/admin/withdrawals');
  return adminApiRequest<WithdrawalRequest[]>('GET', '/api/admin/withdrawals');
}

export function approveWithdrawal(id: string, txNumber: string): Promise<{ success: boolean; tx_number: string }> {
  return adminApiRequest<{ success: boolean; tx_number: string }>('POST', `/api/admin/withdrawals/${id}/approve`, { tx_number: txNumber });
}

export function rejectWithdrawal(id: string): Promise<{ success: boolean }> {
  return adminApiRequest<{ success: boolean }>('POST', `/api/admin/withdrawals/${id}/reject`);
}

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

export function getRevenue(startDate?: string, endDate?: string): Promise<RevenueStats> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();
  return adminApiRequest<RevenueStats>('GET', `/api/admin/revenue${query ? `?${query}` : ''}`);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getConfig(): Promise<ConfigEntry[]> {
  return adminApiRequest<ConfigEntry[]>('GET', '/api/admin/config');
}

export function updateConfig(key: string, value: string): Promise<ConfigEntry> {
  return adminApiRequest<ConfigEntry>('PUT', `/api/admin/config/${key}`, { value });
}

// ---------------------------------------------------------------------------
// Deposit Accounts
// ---------------------------------------------------------------------------

export interface DepositAccount {
  id: string;
  phone: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function getDepositAccounts(): Promise<DepositAccount[]> {
  return adminApiRequest('GET', '/api/admin/deposit-accounts');
}

export function createDepositAccount(phone: string, name: string): Promise<DepositAccount> {
  return adminApiRequest('POST', '/api/admin/deposit-accounts', { phone, name });
}

export function updateDepositAccount(id: string, data: Partial<{ phone: string; name: string; is_active: boolean }>): Promise<DepositAccount> {
  return adminApiRequest('PATCH', `/api/admin/deposit-accounts/${id}`, data);
}

export function deleteDepositAccount(id: string): Promise<{ success: boolean }> {
  return adminApiRequest('DELETE', `/api/admin/deposit-accounts/${id}`);
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

export interface AdminDeposit {
  id: string;
  tx_number: string;
  amount: number;
  status: 'pending' | 'claimed' | 'cancelled';
  player_username: string | null;
  claimed_at: string | null;
  created_at: string;
}

export interface DepositsResponse {
  summary: { pending: number; claimed: number; cancelled: number };
  items: AdminDeposit[];
}

export function getDeposits(): Promise<DepositsResponse> {
  return adminApiRequest<DepositsResponse>('GET', '/api/admin/deposits');
}

export function createDeposit(tx_number: string, amount: number): Promise<AdminDeposit> {
  return adminApiRequest<AdminDeposit>('POST', '/api/admin/deposits', { tx_number, amount });
}

export function cancelDeposit(id: string): Promise<{ success: boolean }> {
  return adminApiRequest<{ success: boolean }>('POST', `/api/admin/deposits/${id}/cancel`);
}

// ---------------------------------------------------------------------------
// Admin accounts
// ---------------------------------------------------------------------------

export function getAdmins(): Promise<AdminAccount[]> {
  return adminApiRequest<AdminAccount[]>('GET', '/api/admin/admins');
}

export function createAdmin(body: CreateAdminRequest): Promise<AdminAccount> {
  return adminApiRequest<AdminAccount>('POST', '/api/admin/admins', body);
}

export function updateAdmin(id: string, body: UpdateAdminRequest): Promise<AdminAccount> {
  return adminApiRequest<AdminAccount>('PATCH', `/api/admin/admins/${id}`, body);
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export interface AgentSummary {
  id: string;
  telegramUsername: string;
  agentInviteLink: string;
  playerInviteLink: string;
  totalPlayersInvited: number;
  totalCommission: number;
  isActive: boolean;
  approvalStatus: string;
  createdAt: string;
}

export interface AgentPlayerRow {
  playerId: string;
  username: string;
  depositBalance: number;
  totalCommissionFromPlayer: number;
  joinedAt: string;
}

export interface AgentDetail extends AgentSummary {
  players: AgentPlayerRow[];
}

export function createAgent(telegramUsername: string): Promise<{ agent: AgentSummary }> {
  return adminApiRequest('POST', '/api/admin/agents', { telegramUsername });
}

export function listAgents(): Promise<{ agents: AgentSummary[] }> {
  return adminApiRequest('GET', '/api/admin/agents');
}

export function getAgentDetail(id: string): Promise<{ agent: AgentDetail }> {
  return adminApiRequest('GET', `/api/admin/agents/${id}`);
}

export function suspendAgent(id: string): Promise<{ ok: boolean }> {
  return adminApiRequest('PATCH', `/api/admin/agents/${id}/suspend`);
}

export function restoreAgent(id: string): Promise<{ ok: boolean }> {
  return adminApiRequest('PATCH', `/api/admin/agents/${id}/restore`);
}

export interface PendingAgent {
  id: string;
  telegramUsername: string;
  telegramId: string | null;
  createdAt: string;
  playerCount: number;
}

export function getPendingAgents(): Promise<{ agents: PendingAgent[] }> {
  return adminApiRequest('GET', '/api/admin/agents/pending');
}

export function approveAgent(id: string): Promise<{ ok: boolean }> {
  return adminApiRequest('POST', `/api/admin/agents/${id}/approve`);
}

export function rejectAgent(id: string): Promise<{ ok: boolean }> {
  return adminApiRequest('POST', `/api/admin/agents/${id}/reject`);
}

export interface AgentWithdrawalRequest {
  id: string;
  agentId: string;
  telegramUsername: string;
  telegramId: string | null;
  amount: number;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  txNumber?: string | null;
}

export function getPendingAgentWithdrawals(): Promise<{ withdrawals: AgentWithdrawalRequest[] }> {
  return adminApiRequest<{ withdrawals: AgentWithdrawalRequest[] }>('GET', '/api/admin/agents/withdrawals');
}

export function approveAgentCommissionWithdrawal(id: string, txNumber: string): Promise<{ success: boolean; withdrawal: AgentWithdrawalRequest }> {
  return adminApiRequest<{ success: boolean; withdrawal: AgentWithdrawalRequest }>('POST', `/api/admin/agents/withdrawals/${id}/approve`, { txNumber });
}

export function rejectAgentCommissionWithdrawal(id: string): Promise<{ success: boolean }> {
  return adminApiRequest<{ success: boolean }>('POST', `/api/admin/agents/withdrawals/${id}/reject`);
}

// ---------------------------------------------------------------------------
// Broadcast Targets
// ---------------------------------------------------------------------------

export interface BroadcastTarget {
  id: string;
  name: string;
  type: 'channel' | 'bot_broadcast';
  channel_id: string | null;
  is_active: boolean;
  created_at: string;
}

export function listBroadcastTargets(): Promise<BroadcastTarget[]> {
  return adminApiRequest('GET', '/api/admin/broadcast-targets');
}

export function createBroadcastTarget(data: { name: string; type: 'channel' | 'bot_broadcast'; channel_id?: string }): Promise<BroadcastTarget> {
  return adminApiRequest('POST', '/api/admin/broadcast-targets', data);
}

export function updateBroadcastTarget(id: string, data: Partial<{ name: string; channel_id: string; is_active: boolean }>): Promise<BroadcastTarget> {
  return adminApiRequest('PATCH', `/api/admin/broadcast-targets/${id}`, data);
}

export function deleteBroadcastTarget(id: string): Promise<{ success: boolean }> {
  return adminApiRequest('DELETE', `/api/admin/broadcast-targets/${id}`);
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export type PromotionContentType = 'text' | 'image' | 'video' | 'gif';
export type PromotionStatus = 'active' | 'inactive';
export type PromotionScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

export interface Promotion {
  id: string;
  title: string;
  content_type: PromotionContentType;
  text_content: string | null;
  media_file_id: string | null;
  caption: string | null;
  status: PromotionStatus;
  bonus_amount: number | null;
  bonus_wallet: 'main' | 'play' | null;
  bonus_criteria: BonusCriteria | null;
  created_at: string;
  updated_at: string;
}

export interface PromotionSchedule {
  id: string;
  promotion_id: string;
  channel_ids: string[];
  frequency: PromotionScheduleFrequency;
  send_at: string;
  next_run_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PromotionLog {
  id: string;
  promotion_id: string;
  schedule_id: string | null;
  channel_id: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  sent_at: string;
}

export interface PromotionStats {
  total_sent: number;
  total_failed: number;
  unique_channels: number;
  last_sent_at: string | null;
}

export interface GlobalPromotionStats {
  totalSent: number;
  totalFailed: number;
  activeSchedules: number;
}

export function listPromotions(): Promise<Promotion[]> {
  return adminApiRequest('GET', '/api/admin/promotions');
}

export function createPromotion(data: {
  title: string;
  content_type: PromotionContentType;
  text_content?: string;
  media_file_id?: string;
  caption?: string;
  bonus_amount?: number;
  bonus_wallet?: 'main' | 'play';
  bonus_criteria?: BonusCriteria;
}): Promise<Promotion> {
  return adminApiRequest('POST', '/api/admin/promotions', data);
}

export function updatePromotion(id: string, data: Partial<{
  title: string;
  text_content: string;
  media_file_id: string;
  caption: string;
  bonus_amount: number;
  bonus_wallet: 'main' | 'play';
  bonus_criteria: BonusCriteria;
}>): Promise<Promotion> {
  return adminApiRequest('PATCH', `/api/admin/promotions/${id}`, data);
}

export function setPromotionStatus(id: string, status: PromotionStatus): Promise<Promotion> {
  return adminApiRequest('PATCH', `/api/admin/promotions/${id}/status`, { status });
}

export function duplicatePromotion(id: string): Promise<Promotion> {
  return adminApiRequest('POST', `/api/admin/promotions/${id}/duplicate`);
}

export function sendPromotionNow(id: string, targets: BroadcastTarget[]): Promise<{ sent: number; failed: number }> {
  return adminApiRequest('POST', `/api/admin/promotions/${id}/send-now`, { targets });
}

export function retryFailedDeliveries(id: string): Promise<{ sent: number; failed: number }> {
  return adminApiRequest('POST', `/api/admin/promotions/${id}/retry-failed`);
}

export function getPromotionStats(id: string): Promise<PromotionStats> {
  return adminApiRequest('GET', `/api/admin/promotions/${id}/stats`);
}

export function getGlobalPromotionStats(): Promise<GlobalPromotionStats> {
  return adminApiRequest('GET', '/api/admin/promotions/stats/global');
}

export function listSchedules(promotionId: string): Promise<PromotionSchedule[]> {
  return adminApiRequest('GET', `/api/admin/promotions/${promotionId}/schedules`);
}

export function createSchedule(promotionId: string, data: {
  channel_ids: string[];
  frequency: PromotionScheduleFrequency;
  send_at: string;
}): Promise<PromotionSchedule> {
  return adminApiRequest('POST', `/api/admin/promotions/${promotionId}/schedules`, data);
}

export function cancelSchedule(scheduleId: string): Promise<{ success: boolean }> {
  return adminApiRequest('DELETE', `/api/admin/promotions/schedules/${scheduleId}`);
}

export function getPromotionLogs(promotionId?: string, limit = 200): Promise<PromotionLog[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (promotionId) params.set('promotionId', promotionId);
  return adminApiRequest('GET', `/api/admin/promotions/logs?${params}`);
}

// ---------------------------------------------------------------------------
// Promotion Bonus
// ---------------------------------------------------------------------------

export interface BonusCriteria {
  minBalance?: number;
  maxBalance?: number;
  minDeposits?: number;
  hasPlayedRounds?: boolean;
  daysRegistered?: number;
  agentId?: string;
}

export interface EligibilityResult {
  eligible: { id: string; telegram_id: string; username: string }[];
  total: number;
  bonus_amount: number;
  bonus_wallet: 'main' | 'play';
}

export interface BonusApplyResult {
  applied: number;
  failed: number;
  errors: { player_id: string; error: string }[];
}

export interface BonusDistribution {
  id: string;
  promotion_id: string;
  player_id: string;
  amount: number;
  wallet: 'main' | 'play';
  distributed_at: string;
  player: { username: string; telegram_id: string };
}

export function getEligiblePlayers(promotionId: string): Promise<EligibilityResult> {
  return adminApiRequest('GET', `/api/admin/promotions/${promotionId}/bonus/eligible`);
}

export function applyPromotionBonus(promotionId: string): Promise<BonusApplyResult> {
  return adminApiRequest('POST', `/api/admin/promotions/${promotionId}/bonus/apply`);
}

export function getBonusDistributions(promotionId: string): Promise<BonusDistribution[]> {
  return adminApiRequest('GET', `/api/admin/promotions/${promotionId}/bonus/distributions`);
}

// ---------------------------------------------------------------------------
// Cartelas
// ---------------------------------------------------------------------------

export interface CartelaDefinition {
  cartela_number: number;
  grid: number[];
}

export interface CartelasResponse {
  items: CartelaDefinition[];
  total: number;
  page: number;
  pageSize: number;
}

export function getCartelas(page = 1, search?: string): Promise<CartelasResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  return adminApiRequest<CartelasResponse>('GET', `/api/admin/cartelas?${params}`);
}

export function getCartela(num: number): Promise<CartelaDefinition> {
  return adminApiRequest<CartelaDefinition>('GET', `/api/admin/cartelas/${num}`);
}

export function createCartela(cartela_number: number, grid: number[]): Promise<CartelaDefinition> {
  return adminApiRequest<CartelaDefinition>('POST', '/api/admin/cartelas', { cartela_number, grid });
}

export function updateCartela(num: number, grid: number[]): Promise<CartelaDefinition> {
  return adminApiRequest<CartelaDefinition>('PUT', `/api/admin/cartelas/${num}`, { grid });
}

export function deleteCartela(num: number): Promise<{ success: boolean }> {
  return adminApiRequest<{ success: boolean }>('DELETE', `/api/admin/cartelas/${num}`);
}

// ---------------------------------------------------------------------------
// Mock Players
// ---------------------------------------------------------------------------

export interface MockPlayer {
  id: string;
  username: string;
  telegram_id: string;
  is_suspended: boolean;
  main_wallet_balance: number;
  play_wallet_balance: number;
  total_games: number;
}

export interface MockJoinResult {
  joined: Array<{ playerId: string; username: string; cartelaNumber: number }>;
  errors: Array<{ playerId: string; error: string }>;
}

export function seedMockPlayers(): Promise<{ message: string; players: Array<{ id: string; username: string; created: boolean }> }> {
  return adminApiRequest('POST', '/api/admin/mock-players/seed');
}

export function getMockPlayers(): Promise<MockPlayer[]> {
  return adminApiRequest<MockPlayer[]>('GET', '/api/admin/mock-players');
}

export function creditMockPlayer(id: string, amount: number, walletType: 'main' | 'play'): Promise<{ success: boolean }> {
  return adminApiRequest('POST', `/api/admin/mock-players/${id}/credit`, { amount, walletType });
}

export function joinRoundWithMockPlayers(roundId: string, playerIds: string[], balance: number): Promise<MockJoinResult> {
  return adminApiRequest('POST', '/api/admin/mock-players/join-round', { roundId, playerIds, balance });
}
