// Keno UI shared types

export type DrawPhase = 'betting' | 'drawing' | 'finished' | 'idle';

export interface KenoUIState {
  phase: DrawPhase;
  roundId: string | null;
  bettingEndsAt: number; // unix ms
  drawnNumbers: number[];
  currentBall: number | null;
}

export interface BetFeedItem {
  username: string;
  pickedNumbers: number[];
  pickedCount: number;
  betAmount: number;
  matched: number | null;
  payout: number | null;
}

export interface HistoryRecord {
  id: string;
  drawnNumbers: number[];
  finishedAt: string;
  myBets: {
    pickedNumbers: number[];
    betAmount: number;
    matched: number | null;
    payout: number | null;
  }[];
  myBet: {
    pickedNumbers: number[];
    betAmount: number;
    matched: number | null;
    payout: number | null;
  } | null;
}

// PAYOUT_TABLE[picked][matched] = multiplier
export const PAYOUT_TABLE: Record<number, Record<number, number>> = {
  1:  { 1: 3.5 },
  2:  { 1: 1,   2: 10 },
  3:  { 2: 2,   3: 50 },
  4:  { 2: 1.5, 3: 10,  4: 80 },
  5:  { 2: 1,   3: 3,   4: 30,  5: 150 },
  6:  { 3: 2,   4: 15,  5: 60,  6: 500 },
  7:  { 0: 1,   3: 2,   4: 4,   5: 20,  6: 80,  7: 1000 },
  8:  { 0: 1,   4: 5,   5: 15,  6: 50,  7: 200, 8: 2000 },
  9:  { 0: 2,   4: 2,   5: 10,  6: 25,  7: 125, 8: 1000, 9: 5000 },
  10: { 0: 2,   5: 5,   6: 30,  7: 100, 8: 300, 9: 2000, 10: 10000 },
};

export function getMultiplier(picked: number, matched: number): number {
  return PAYOUT_TABLE[picked]?.[matched] ?? 0;
}

export function bestMultiplier(picked: number): number {
  const tbl = PAYOUT_TABLE[picked];
  if (!tbl) return 0;
  return Math.max(...Object.values(tbl));
}

export const HOT_NUMBERS = [18, 21, 24, 57, 74];
export const COLD_NUMBERS = [5, 11, 29, 56, 68];
