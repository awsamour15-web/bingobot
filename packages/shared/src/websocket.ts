// WebSocket event payload types (Socket.IO)

import type { WinPattern } from './enums.js';

// ---------------------------------------------------------------------------
// Server → Client events
// ---------------------------------------------------------------------------

export interface NumberCalledPayload {
  number: number;
  sequenceIndex: number;
  calledAt: Date;
}

export interface RoundStartedPayload {
  roundId: string;
  playerCount: number;
  derash: number;
  winningPattern: WinPattern;
}

export interface RoundWonPayload {
  winners: Array<{
    playerId: string;
    username: string;
    cartelaNumber: number;
    amount: number;
  }>;
  totalDerash: number;
  winnerCount: number;
  /** Complete ordered list of called numbers at the time the round ended */
  calledNumbers?: number[];
}

export interface RoundVoidPayload {
  roundId: string;
  refundAmount: number;
}

export interface RoundCancelledPayload {
  roundId: string;
  refundAmount: number;
}

export interface PlayerJoinedPayload {
  playerCount: number;
}

export interface CartelaTakenPayload {
  cartelaNumbers: number[];
  playerCount: number;
}

export interface CartelaReservedPayload {
  cartelaNumbers: number[];
}

export interface WinRejectedPayload {
  reason: string;
}

// ---------------------------------------------------------------------------
// Crash game payloads
// ---------------------------------------------------------------------------

export interface CrashBettingOpenPayload {
  roundId: string;
  countdownMs: number;
}

export interface CrashStartedPayload {
  roundId: string;
  startedAt: number; // unix ms timestamp — client computes elapsed multiplier from this
}

export interface CrashTickPayload {
  multiplier: number; // current multiplier, e.g. 1.23
}

export interface CrashCashedOutPayload {
  playerId: string;
  username: string;
  multiplier: number;
  payout: number;
}

export interface CrashEndedPayload {
  roundId: string;
  crashPoint: number;
}

export interface CrashBetPlacedPayload {
  playerId: string;
  betAmount: number;
}

export interface CrashCashoutAckPayload {
  multiplier: number;
  payout: number;
}

// ---------------------------------------------------------------------------
// Keno game payloads
// ---------------------------------------------------------------------------

export interface KenoBettingOpenPayload {
  roundId: string;
  bettingEndsAt: string; // ISO timestamp
  endsAt: number;        // unix ms — used by the countdown timer in KenoScreen
}

export interface KenoNumberDrawnPayload {
  roundId: string;
  number: number;
  drawnSoFar: number[];
}

export interface KenoRoundFinishedPayload {
  roundId: string;
  drawnNumbers: number[];
  results: Array<{
    username: string;
    picked: number;
    matched: number;
    payout: number;
  }>;
}

// ---------------------------------------------------------------------------
// Client → Server events
// ---------------------------------------------------------------------------

export interface JoinRoundEvent {
  roundId: string;
  token: string;
}

export interface ClaimWinEvent {
  roundId: string;
  cartelaId: number;
}

// ---------------------------------------------------------------------------
// Typed event maps for Socket.IO (server-side and client-side)
// ---------------------------------------------------------------------------

/** Events emitted by the server and received by the client */
export interface ServerToClientEvents {
  NUMBER_CALLED: (payload: NumberCalledPayload) => void;
  ROUND_STARTED: (payload: RoundStartedPayload) => void;
  ROUND_WON: (payload: RoundWonPayload) => void;
  ROUND_VOID: (payload: RoundVoidPayload) => void;
  ROUND_CANCELLED: (payload: RoundCancelledPayload) => void;
  PLAYER_JOINED: (payload: PlayerJoinedPayload) => void;
  CARTELA_TAKEN: (payload: CartelaTakenPayload) => void;
  CARTELA_RESERVED: (payload: CartelaReservedPayload) => void;
  CARTELA_UNRESERVED: (payload: CartelaReservedPayload) => void;
  WIN_REJECTED: (payload: WinRejectedPayload) => void;
  // Crash game
  CRASH_BETTING_OPEN: (payload: CrashBettingOpenPayload) => void;
  CRASH_STARTED: (payload: CrashStartedPayload) => void;
  CRASH_TICK: (payload: CrashTickPayload) => void;
  CRASH_CASHED_OUT: (payload: CrashCashedOutPayload) => void;
  CRASH_ENDED: (payload: CrashEndedPayload) => void;
  CRASH_BET_PLACED: (payload: CrashBetPlacedPayload) => void;
  CRASH_CASHOUT_ACK: (payload: CrashCashoutAckPayload) => void;
  // Keno game
  KENO_BETTING_OPEN: (payload: KenoBettingOpenPayload) => void;
  KENO_NUMBER_DRAWN: (payload: KenoNumberDrawnPayload) => void;
  KENO_ROUND_FINISHED: (payload: KenoRoundFinishedPayload) => void;
}

/** Events emitted by the client and received by the server */
export interface ClientToServerEvents {
  JOIN_ROUND: (event: JoinRoundEvent) => void;
  LEAVE_ROUND: (event: { roundId: string }) => void;
  CLAIM_WIN: (event: ClaimWinEvent) => void;
  CARTELA_RESERVE: (event: { roundId: string; cartelaNumbers: number[] }) => void;
  CARTELA_UNRESERVE: (event: { roundId: string; cartelaNumbers: number[] }) => void;
  // Crash game
  CRASH_BET: (event: { roundId: string; betAmount: number }) => void;
  CRASH_CASHOUT: (event: { roundId: string }) => void;
}
