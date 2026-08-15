export interface RoundStartFlowState {
  joined: boolean;
  starting: boolean;
  startRequested: boolean;
}

export function isRoundStartBlocked(state: RoundStartFlowState): boolean {
  return state.joined || state.starting || state.startRequested;
}
