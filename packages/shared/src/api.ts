// API payload shapes for all REST endpoints

import type { WalletType, TxType, GameStatus, AdminRole } from './enums.js';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface LoginRequest {
  /** Raw Telegram Web App initData string */
  initData: string;
  /** Optional referral parameter from /start deep link (e.g. "ref_123456") */
  start?: string;
}

export interface LoginResponse {
  token: string;
  playerId: string;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface PlayerProfile {
  id: string;
  username: string;
  phone?: string | undefined;
  phone_verified: boolean;
  is_suspended: boolean;
  created_at: string;
  mainWallet: WalletBalance;
  playWallet: WalletBalance;
}

export interface WalletBalance {
  id: string;
  type: WalletType;
  balance: number;
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export interface RoundListItem {
  id: string;
  stake: number;
  status: GameStatus;
  player_count: number;
  max_players: number;
  derash: number;
  start_time: string;
}

export interface RoundDetail extends RoundListItem {
  called_numbers_count: number;
  ended_at?: string | undefined;
  winner_player_id?: string | undefined;
  winner_cartela_number?: number | undefined;
}

export interface JoinRoundRequest {
  cartelaNumber: number;
}

export interface JoinRoundResponse {
  cartelaNumber: number;
  mainWalletBalance: number;
  playWalletBalance: number;
}

// ---------------------------------------------------------------------------
// Cartela
// ---------------------------------------------------------------------------

export interface CartelaAvailability {
  available: number[];
  taken: number[];
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  roundId: string;
  gameId: string;
  date: string;
  stake: number;
  result: 'win' | 'loss' | 'void' | 'cancelled';
  prize: number;
  cartelaNumber: number;
}

export interface HistoryDetail extends HistoryEntry {
  calledNumbers: Array<{ number: number; sequence_index: number }>;
  cartelaGrid: number[];
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export interface TransactionListItem {
  id: string;
  type: TxType;
  amount: number;
  walletType: WalletType;
  note?: string | undefined;
  reference_id?: string | undefined;
  created_at: string;
}

export interface DepositRequest {
  amount: number;
}

export interface DepositResponse {
  checkoutUrl: string;
  transactionId: string;
}

export interface WithdrawRequest {
  amount: number;
  phone: string;
}

// ---------------------------------------------------------------------------
// Referral
// ---------------------------------------------------------------------------

export interface ReferralStats {
  referralLink: string;
  totalReferrals: number;
  totalEarnings: number;
}

// ---------------------------------------------------------------------------
// Admin — Player management
// ---------------------------------------------------------------------------

export interface AdminPlayer {
  id: string;
  username: string;
  telegram_id: string;
  phone?: string | undefined;
  phone_verified: boolean;
  is_suspended: boolean;
  main_wallet_balance: number;
  play_wallet_balance: number;
  created_at: string;
  total_games: number;
  total_referrals: number;
}

export interface AdminCreditRequest {
  walletType: WalletType;
  amount: number;
  note: string;
}

// ---------------------------------------------------------------------------
// Admin — Round management
// ---------------------------------------------------------------------------

export interface AdminRound {
  id: string;
  stake: number;
  status: GameStatus;
  player_count: number;
  max_players: number;
  derash: number;
  called_numbers_count: number;
  start_time: string;
  ended_at?: string | undefined;
  winner_player_id?: string | undefined;
  winner_cartela_number?: number | undefined;
  commission_pct: number;
  winners?: Array<{
    playerId: string;
    username: string;
    cartelaNumber: number;
    splitAmount: number;
  }>;
}

export interface CreateRoundRequest {
  stake: number;
  startTime: string;
  maxPlayers: number;
}

// ---------------------------------------------------------------------------
// Admin — Withdrawals
// ---------------------------------------------------------------------------

export interface WithdrawalRequest {
  id: string;
  player_id: string;
  username: string;
  amount: number;
  phone: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
}

// ---------------------------------------------------------------------------
// Admin — Revenue
// ---------------------------------------------------------------------------

export interface RevenueStats {
  totalStakesCollected: number;
  totalPrizesPaid: number;
  platformCommissionEarned: number;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

// ---------------------------------------------------------------------------
// Admin — Config
// ---------------------------------------------------------------------------

export interface ConfigEntry {
  key: string;
  value: string;
  updated_at: string;
}

export interface UpdateConfigRequest {
  value: string;
}

// ---------------------------------------------------------------------------
// Admin — Admin account management
// ---------------------------------------------------------------------------

export interface AdminAccount {
  id: string;
  username: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
}

export interface CreateAdminRequest {
  username: string;
  password: string;
  role: AdminRole;
}

export interface UpdateAdminRequest {
  role?: AdminRole | undefined;
  is_active?: boolean | undefined;
  password?: string | undefined;
}

// ---------------------------------------------------------------------------
// Generic API error response
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
