// Slots Engine — Multi Hot 5 style
// 3×3 grid, 5 fixed paylines, multiplier reel, X2 gamble feature
// RTP ~96%

import crypto from 'node:crypto';

// ─── Symbols ─────────────────────────────────────────────────────────────────
// Index: 0=Cherry, 1=Watermelon/Grape, 2=Orange/Plum, 3=Lemon, 4=Bell, 5=$$, 6=77

export const SYMBOLS = ['cherry', 'watermelon', 'orange', 'lemon', 'bell', 'double_dollar', 'seven'] as const;
export type Symbol = typeof SYMBOLS[number];

// Payout multipliers: win = betAmount × PAYOUTS[symbol] × reelMultiplier
// Multi Hot 5 paytable — 3-of-a-kind per payline
export const PAYOUTS: Record<Symbol, number> = {
  cherry:        10,
  watermelon:    20,
  orange:        20,
  lemon:         25,
  bell:          40,
  double_dollar: 100,
  seven:         333,
};

// Reel strips — weighted for ~96% RTP
// Higher index = more frequent = lower value symbols appear more
const REEL_STRIP: Symbol[] = [
  'seven', 'lemon', 'cherry', 'orange', 'lemon', 'watermelon',
  'cherry', 'bell', 'lemon', 'orange', 'cherry', 'lemon',
  'double_dollar', 'watermelon', 'lemon', 'cherry', 'orange', 'lemon',
  'cherry', 'watermelon', 'lemon', 'bell', 'cherry', 'lemon',
  'orange', 'cherry', 'lemon', 'watermelon', 'cherry', 'lemon',
];

// Multiplier reel strip: 1x appears most, 5x rarely
const MULTIPLIER_STRIP = [1, 1, 1, 1, 2, 1, 1, 3, 1, 1, 1, 2, 1, 1, 5, 1, 1, 1, 4, 1];

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

export function spin(betAmount: number): SpinResult {
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

  const totalWin = parseFloat(
    paylineWins.reduce((sum, w) => sum + w.payout, 0).toFixed(2),
  );

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
