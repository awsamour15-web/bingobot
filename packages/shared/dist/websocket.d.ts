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
    winnerUsername: string;
    cartelaNumber: number;
    derash: number;
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
export interface WinRejectedPayload {
    reason: string;
}
export interface JoinRoundEvent {
    roundId: string;
    token: string;
}
export interface ClaimWinEvent {
    roundId: string;
    cartelaId: number;
}
/** Events emitted by the server and received by the client */
export interface ServerToClientEvents {
    NUMBER_CALLED: (payload: NumberCalledPayload) => void;
    ROUND_STARTED: (payload: RoundStartedPayload) => void;
    ROUND_WON: (payload: RoundWonPayload) => void;
    ROUND_VOID: (payload: RoundVoidPayload) => void;
    ROUND_CANCELLED: (payload: RoundCancelledPayload) => void;
    PLAYER_JOINED: (payload: PlayerJoinedPayload) => void;
    WIN_REJECTED: (payload: WinRejectedPayload) => void;
}
/** Events emitted by the client and received by the server */
export interface ClientToServerEvents {
    JOIN_ROUND: (event: JoinRoundEvent) => void;
    CLAIM_WIN: (event: ClaimWinEvent) => void;
}
//# sourceMappingURL=websocket.d.ts.map