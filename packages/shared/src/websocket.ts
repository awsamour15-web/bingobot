// WebSocket event payload types (Socket.IO)

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
}

/** Events emitted by the client and received by the server */
export interface ClientToServerEvents {
  JOIN_ROUND: (event: JoinRoundEvent) => void;
  LEAVE_ROUND: (event: { roundId: string }) => void;
  CLAIM_WIN: (event: ClaimWinEvent) => void;
  CARTELA_RESERVE: (event: { roundId: string; cartelaNumbers: number[] }) => void;
  CARTELA_UNRESERVE: (event: { roundId: string; cartelaNumbers: number[] }) => void;
}
