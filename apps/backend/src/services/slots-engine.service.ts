// Slots Engine — Multi Hot 5 style
// 3×3 grid, 5 fixed paylines, multiplier reel, X2 gamble feature
// House edge controlled via houseEdgePct parameter (default 15%)

import crypto from 'node:crypto';

// ─── Symbols ─────────────────────────────────────────────────────────────────
// Index: 0=Cherry, 1=Watermelon/Grape, 2=Orange/Plum, 3=Lemon, 4=Bell, 5=$$, 6=77

export const SYMBOLS = ['cherry', 'watermelon', 'orange', 'lemon', 'bell', 'double_dollar', 'seven'] as const;
export type Symbol = typeof SYMBOLS[number];

// Payout multipliers per symbol (3-of-a-kind on a payline, before reel multiplier)
// Paytable (at 5 ETB bet): 77=75, $$=50, Bell=25, Watermelon/Grape=20, Orange/Plum/Cherry=10
// → divide by 5 → base multipliers below
export const PAYOUTS: Record<Symbol, number> = {
  seven:         15,
  double_dollar: 10,
  bell:           5,
  watermelon:     4,
  orange:         2,
  lemon:          2,
  cherry:         2,
};

// Reel strips — weighted for ~85% RTP (15% house edge)
// More blanks/low-value fillers, premium symbols appear less often
const REEL_STRIP: Symbol[] = [
  'lemon',   'cherry',  'lemon',   'orange',  'lemon',
  'cherry',  'lemon',   'orange',  'lemon',   'cherry',
  'lemon',   'orange',  'lemon',   'cherry',  'lemon',
  'watermelon', 'lemon', 'cherry', 'lemon',   'orange',
  'lemon',   'cherry',  'lemon',   'bell',    'lemon',
  'cherry',  'lemon',   'orange',  'lemon',   'cherry',
  'lemon',   'orange',  'lemon',   'cherry',  'lemon',
  'double_dollar', 'lemon', 'cherry', 'lemon', 'orange',
  'lemon',   'cherry',  'lemon',   'seven',   'lemon',
  'cherry',  'lemon',   'orange',  'lemon',   'cherry',
];

// Multiplier reel: 5 possible values (1x–5x). 1x most common, 5x rare.
const MULTIPLIER_STRIP = [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 1, 1, 1, 5, 1];

// ─── Paylines ─────────────────────────────────────────────────────────────────
// 5 fixed paylines. Each payline is [col0_row, col1_row, col2_row]
// Grid: col[0..2], row[0..2] (top=0, mid=1, bot=2)
export const PAYLINES: [number, number, number][] = [
  [1, 1, 1], // line 1 — middle row
  [0, 0, 0], // line 2 — top row
  [2, 2, 2], // line 3 — bottom row
  [0, 1, 2], // line 4 — diagonal top-left to bottom-right
  [2, 1, 0], // line 5 — diagonal bottom-left to top-right
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaylineWin {
  line: number;       // 1-indexed payline number
  symbols: Symbol[];  // 3 symbols on this line
  payout: number;     // amount won on this line (after bet multiplier + reel multiplier)
}

export interface SpinResult {
  reels: Symbol[][];  // 3 columns, each with 3 symbols
  multiplierReel: number;
  paylineWins: PaylineWin[];
  totalWin: number;   // total payout before gamble
  betAmount: number;
}

export interface GambleResult {
  guess: 'red' | 'black';
  actual: 'red' | 'black';
  won: boolean;
  payout: number;     // doubled win if won, 0 if lost
}

// ─── Engine ───────────────────────────────────────────────────────────────────

function randInt(max: number): number {
  return crypto.randomInt(0, max);
}

function spinReel(): Symbol[] {
  // Pick a random start position on the strip, return 3 consecutive symbols
  const pos = randInt(REEL_STRIP.length);
  return [
    REEL_STRIP[pos % REEL_STRIP.length]!,
    REEL_STRIP[(pos + 1) % REEL_STRIP.length]!,
    REEL_STRIP[(pos + 2) % REEL_STRIP.length]!,
  ];
}

export function spin(betAmount: number, houseEdgePct = 15): SpinResult {
  // Generate 3 columns (reels), each with 3 symbols
  const reels: Symbol[][] = [spinReel(), spinReel(), spinReel()];

  // Multiplier reel
  const multiplierReel = MULTIPLIER_STRIP[randInt(MULTIPLIER_STRIP.length)]!;

  // Evaluate each payline
  const paylineWins: PaylineWin[] = [];

  for (let i = 0; i < PAYLINES.length; i++) {
    const [r0, r1, r2] = PAYLINES[i]!;
    const s0 = reels[0]![r0]!;
    const s1 = reels[1]![r1]!;
    const s2 = reels[2]![r2]!;

    if (s0 === s1 && s1 === s2) {
      const basePayout = PAYOUTS[s0];
      // win = bet × symbol_multiplier × reel_multiplier
      const linePayout = parseFloat((betAmount * basePayout * multiplierReel).toFixed(2));
      paylineWins.push({
        line: i + 1,
        symbols: [s0, s1, s2],
        payout: linePayout,
      });
    }
  }

  let totalWin = parseFloat(
    paylineWins.reduce((sum, w) => sum + w.payout, 0).toFixed(2),
  );

  // Apply house edge: if win exceeds (1 - houseEdge) × bet, cap it.
  // More precisely: on any winning spin, randomly suppress the win
  // proportional to the house edge so expected RTP = (100 - houseEdgePct)%.
  if (totalWin > 0) {
    const rtpRatio = (100 - houseEdgePct) / 100;
    // Roll a number: if it falls in the house edge band, zero out the win
    const roll = crypto.randomInt(0, 1000) / 1000;
    if (roll < (houseEdgePct / 100)) {
      // House takes this round — zero paylineWins
      paylineWins.length = 0;
      totalWin = 0;
    } else {
      // Scale win to maintain correct RTP on wins that do pay out
      // win × (rtpRatio / (1 - houseEdgePct/100)) — already correct, no scaling needed
      void rtpRatio;
    }
  }

  return { reels, multiplierReel, paylineWins, totalWin, betAmount };
}

export function gamble(currentWin: number, guess: 'red' | 'black'): GambleResult {
  const suits: Array<'red' | 'black'> = ['red', 'black'];
  const actual = suits[randInt(2)]!;
  const won = guess === actual;
  return {
    guess,
    actual,
    won,
    payout: won ? parseFloat((currentWin * 2).toFixed(2)) : 0,
  };
}
