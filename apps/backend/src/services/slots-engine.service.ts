// Slots Engine — Multi Hot 5 style
// 3×3 grid, 5 fixed paylines, multiplier reel, X2 gamble feature
// House edge controlled via houseEdgePct parameter (default 15%)

import crypto from 'node:crypto';

// ─── Symbols ─────────────────────────────────────────────────────────────────
// Index: 0=Cherry, 1=Watermelon/Grape, 2=Orange/Plum, 3=Lemon, 4=Bell, 5=$$, 6=77

export const SYMBOLS = ['cherry', 'watermelon', 'orange', 'lemon', 'bell', 'double_dollar', 'seven'] as const;
export type Symbol = typeof SYMBOLS[number];

// Payout multipliers per symbol (3-of-a-kind on a payline, before reel multiplier)
// Reduced to keep RTP reasonable even when wins land
export const PAYOUTS: Record<Symbol, number> = {
  seven:         8,
  double_dollar: 5,
  bell:           3,
  watermelon:     2,
  orange:         1,
  lemon:          1,
  cherry:         1,
};

// Reel strips per column — weighted for controlled hit frequency
// Column 0 (left): fewer premiums
const REEL_0: Symbol[] = [
  'lemon','cherry','lemon','orange','lemon','cherry','lemon','orange','lemon','cherry',
  'lemon','orange','lemon','cherry','lemon','watermelon','lemon','cherry','lemon','orange',
  'lemon','cherry','lemon','bell','lemon','cherry','lemon','orange','lemon','cherry',
  'lemon','orange','lemon','cherry','lemon','double_dollar','lemon','cherry','lemon','orange',
  'lemon','cherry','lemon','seven','lemon','cherry','lemon','orange','lemon','cherry',
];
// Column 1 (middle): moderate premiums
const REEL_1: Symbol[] = [
  'lemon','orange','lemon','cherry','lemon','orange','lemon','cherry','lemon','lemon',
  'orange','lemon','cherry','lemon','orange','lemon','watermelon','lemon','cherry','lemon',
  'orange','lemon','cherry','lemon','bell','lemon','orange','lemon','cherry','lemon',
  'orange','lemon','cherry','lemon','orange','lemon','double_dollar','lemon','cherry','lemon',
  'orange','lemon','cherry','lemon','seven','lemon','orange','lemon','cherry','lemon',
];
// Column 2 (right): also moderate
const REEL_2: Symbol[] = [
  'orange','lemon','cherry','lemon','orange','lemon','cherry','lemon','orange','lemon',
  'cherry','lemon','orange','lemon','watermelon','lemon','cherry','lemon','orange','lemon',
  'cherry','lemon','orange','lemon','cherry','bell','lemon','orange','lemon','cherry',
  'lemon','orange','lemon','cherry','lemon','orange','lemon','double_dollar','cherry','lemon',
  'orange','lemon','cherry','lemon','orange','lemon','seven','lemon','cherry','lemon',
];

const REELS = [REEL_0, REEL_1, REEL_2] as const;

// Multiplier reel: mostly 1x, max 3x
const MULTIPLIER_STRIP = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 3, 1];

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

// Each reel column picks 3 independent positions (not consecutive)
function spinColumn(strip: readonly Symbol[]): Symbol[] {
  return [
    strip[randInt(strip.length)]!,
    strip[randInt(strip.length)]!,
    strip[randInt(strip.length)]!,
  ];
}

export function spin(betAmount: number, houseEdgePct = 35): SpinResult {
  // Each column spins independently from its own strip
  const reels: Symbol[][] = [
    spinColumn(REELS[0]),
    spinColumn(REELS[1]),
    spinColumn(REELS[2]),
  ];

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

  // Apply house edge: suppress wins to maintain target RTP.
  // houseEdgePct = 35 means players get back ~65% on average.
  // On each winning spin, roll to decide if house takes it.
  // Also cap max win at 50× bet to prevent outlier losses.
  if (totalWin > 0) {
    const roll = crypto.randomInt(0, 1000) / 1000;
    if (roll < (houseEdgePct / 100)) {
      paylineWins.length = 0;
      totalWin = 0;
    } else {
      // Cap win at 20× bet
      const maxWin = betAmount * 20;
      if (totalWin > maxWin) {
        // Compute ratio BEFORE overwriting totalWin
        const ratio = maxWin / totalWin;
        totalWin = maxWin;
        // Reduce individual payline amounts proportionally
        for (const w of paylineWins) w.payout = parseFloat((w.payout * ratio).toFixed(2));
      }
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
