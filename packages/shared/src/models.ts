// Core data model interfaces — mirror the database rows

import type { WalletType, TxType, GameStatus, AdminRole } from './enums.js';

export interface Player {
  id: string;
  telegram_id: bigint;
  username: string;
  phone?: string | undefined;
  phone_verified: boolean;
  is_suspended: boolean;
  referrer_id?: string | undefined;
  created_at: Date;
}

export interface Wallet {
  id: string;
  player_id: string;
  type: WalletType;
  balance: number;
  updated_at: Date;
}

export interface Transaction {
  id: string;
  wallet_id: string;
  type: TxType;
  amount: number;
  reference_id?: string | undefined;
  note?: string | undefined;
  created_at: Date;
}

export interface GameRound {
  id: string;
  stake: number;
  status: GameStatus;
  max_players: number;
  start_time: Date;
  ended_at?: Date | undefined;
  derash: number;
  commission_pct: number;
  winner_player_id?: string | undefined;
  winner_cartela_number?: number | undefined;
}

export interface RoundEntry {
  id: string;
  round_id: string;
  player_id: string;
  cartela_number: number;
  is_watching: boolean;
  joined_at: Date;
}

export interface CartelaDefinition {
  cartela_number: number;
  /** 25-element flat array (row-major). Index 12 = free space = 0. */
  grid: number[];
}

export interface CalledNumber {
  id: string;
  round_id: string;
  number: number;
  sequence_index: number;
  called_at: Date;
}

export interface Admin {
  id: string;
  username: string;
  password_hash: string;
  role: AdminRole;
  is_active: boolean;
  created_at: Date;
}

export interface Config {
  key: string;
  value: string;
  updated_at: Date;
}
