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
): Promise<T> {
  const hasBody = body !== undefined;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: buildAdminHeaders(hasBody),
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  });

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
  return adminApiRequest<WithdrawalRequest[]>('GET', '/api/admin/withdrawals');
}

export function approveWithdrawal(id: string): Promise<void> {
  return adminApiRequest<void>('POST', `/api/admin/withdrawals/${id}/approve`);
}

export function rejectWithdrawal(id: string): Promise<void> {
  return adminApiRequest<void>('POST', `/api/admin/withdrawals/${id}/reject`);
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

export function createAgent(telegramUsername: string): Promise<{ agent: AgentSummary & { agentInviteLink: string } }> {
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
  status: PromotionStatus;
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

export function listPromotions(): Promise<Promotion[]> {
  return adminApiRequest('GET', '/api/admin/promotions');
}

export function createPromotion(data: {
  title: string;
  content_type: PromotionContentType;
  text_content?: string;
  media_file_id?: string;
}): Promise<Promotion> {
  return adminApiRequest('POST', '/api/admin/promotions', data);
}

export function updatePromotion(id: string, data: Partial<{
  title: string;
  content_type: PromotionContentType;
  text_content: string;
  media_file_id: string;
}>): Promise<Promotion> {
  return adminApiRequest('PATCH', `/api/admin/promotions/${id}`, data);
}

export function setPromotionStatus(id: string, status: PromotionStatus): Promise<Promotion> {
  return adminApiRequest('PATCH', `/api/admin/promotions/${id}/status`, { status });
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

export function getPromotionLogs(promotionId?: string): Promise<PromotionLog[]> {
  const query = promotionId ? `?promotionId=${promotionId}` : '';
  return adminApiRequest('GET', `/api/admin/promotions/logs${query}`);
}
