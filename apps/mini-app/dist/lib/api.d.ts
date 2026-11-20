import type { LoginResponse, PlayerProfile, RoundListItem, RoundDetail, CartelaAvailability, JoinRoundResponse, HistoryEntry, HistoryDetail, TransactionListItem, DepositResponse, ReferralStats, PaginatedResponse } from '@mada/shared';
export type { LoginResponse, PlayerProfile, RoundListItem, RoundDetail, CartelaAvailability, JoinRoundResponse, HistoryEntry, HistoryDetail, TransactionListItem, DepositResponse, ReferralStats, PaginatedResponse, };
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
    weeklyCommission: number;
    dailyCommission: number;
    commissionBalance: number;
    players: AgentPlayerRow[];
    withdrawalRequests: AgentCommissionWithdrawal[];
}
export interface AgentPlayerRow {
    playerId: string;
    username: string;
    depositBalance: number;
    totalCommissionFromPlayer: number;
    joinedAt: string;
}
export type { NumberCalledPayload, RoundStartedPayload, RoundWonPayload, RoundBonusPayload, RoundVoidPayload, RoundCancelledPayload, PlayerJoinedPayload, WinRejectedPayload, } from '@mada/shared';
export declare function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T>;
export declare function agentApiRequest<T>(method: string, path: string, body?: unknown): Promise<T>;
export declare function login(initData: string, start?: string): Promise<LoginResponse>;
export interface WebLoginResponse {
    token: string;
    playerId: string;
    phoneVerified: boolean;
    username: string;
    agentToken?: string;
    agentId?: string;
}
export declare function webLogin(phone: string): Promise<WebLoginResponse>;
export declare function getProfile(): Promise<PlayerProfile>;
export declare function getRounds(): Promise<RoundListItem[]>;
export declare function getSystemStats(): Promise<{
    totalPlayers: number;
    totalGames: number;
}>;
export declare function getRound(id: string): Promise<RoundDetail>;
export declare function getCalledNumbers(roundId: string): Promise<number[]>;
export declare function getCartelaAvailability(roundId: string): Promise<CartelaAvailability>;
export declare function getCartelaGrid(roundId: string, cartelaNumber: number): Promise<{
    cartela_number: number;
    grid: number[];
}>;
export declare function getCartelaGridCached(roundId: string, cartelaNumber: number): Promise<{
    cartela_number: number;
    grid: number[];
}>;
export declare function getMyCartelas(roundId: string): Promise<{
    cartelas: Array<{
        cartelaNumber: number;
        cartelaGrid: number[];
    }>;
}>;
export declare function joinRound(roundId: string, cartelaNumber: number): Promise<JoinRoundResponse>;
export declare function joinRoundBatch(roundId: string, cartelaNumbers: number[]): Promise<{
    cartelaNumbers: number[];
    mainWalletBalance: number;
    playWalletBalance: number;
}>;
export declare function leaveRound(roundId: string, cartelaNumber: number): Promise<{
    ok: boolean;
    mainWalletBalance: number;
    playWalletBalance: number;
}>;
export interface SystemState {
    phase: 'cartela' | 'live' | 'idle';
    roundId: string | null;
    stake: number | null;
}
export declare function getSystemState(): Promise<SystemState>;
export declare function getHistory(page?: number): Promise<PaginatedResponse<HistoryEntry>>;
export declare function getHistoryDetail(roundId: string): Promise<HistoryDetail>;
export declare function getDepositTotal(): Promise<{
    total: number;
}>;
export declare function getWalletTransactions(page?: number, pageSize?: number): Promise<PaginatedResponse<TransactionListItem>>;
export interface DepositAccountOption {
    phone: string;
    name: string;
    bank?: string;
}
export interface ManualDepositResponse {
    success: boolean;
    amount: number;
    txNumber: string;
    message: string;
}
export declare function depositFunds(amount: number): Promise<DepositResponse>;
export declare function getDepositAccounts(): Promise<{
    accounts: DepositAccountOption[];
}>;
export declare function verifyManualDeposit(amount: number, receipt: string): Promise<ManualDepositResponse>;
export declare function withdrawFunds(amount: number, phone: string, receiverName?: string): Promise<void>;
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
export declare function getPendingRequests(): Promise<{
    deposits: PendingDepositItem[];
    withdrawals: PendingWithdrawalItem[];
}>;
export declare function getReferralLink(): Promise<ReferralStats>;
export declare function verifyPhone(phone: string): Promise<void>;
export declare function getAgentDashboard(): Promise<AgentDashboardStats>;
export declare function getAgentInviteLink(): Promise<{
    playerInviteLink: string;
}>;
export declare function getAgentWithdrawals(): Promise<AgentCommissionWithdrawal[]>;
export declare function requestAgentWithdrawal(amount: number, phone: string): Promise<{
    success: boolean;
    message: string;
    withdrawal: AgentCommissionWithdrawal;
}>;
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
    currentPlayerRank: {
        rank: number;
        wins: number;
        totalPrize: number;
    } | null;
}
export declare function getLeaderboard(): Promise<LeaderboardResponse>;
export declare function redeemCoupon(code: string): Promise<{
    success: boolean;
    amount: number;
    message: string;
}>;
export interface AvailableCoupon {
    code: string;
    amount: number;
    wallet: 'main' | 'play';
    description: string;
    remaining: number | null;
}
export declare function getAvailableCoupons(): Promise<AvailableCoupon[]>;
export interface SpinPrize {
    label: string;
    amount: number;
}
export interface DailySpinStatus {
    canSpin: boolean;
    lastSpinDate: string | null;
    prize: SpinPrize;
}
export interface DailySpinResult {
    success: boolean;
    prize: SpinPrize;
}
export declare function getDailySpinStatus(): Promise<DailySpinStatus>;
export declare function claimDailySpin(): Promise<DailySpinResult>;
//# sourceMappingURL=api.d.ts.map