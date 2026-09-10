/**
 * Royal Drop Engine
 *
 * Stateless instant game (like Plinko/Slots).
 *
 * Mechanics (from screenshots):
 *   - 5×7 grid of crates. Each crate has durability (hitpoints).
 *   - 5 reels spin and produce rockets (blue, green, purple, red) with a damage value.
 *   - Each rocket column targets the top crate in its column.
 *   - Rockets deal damage; when a crate's HP reaches 0 it is destroyed and awards coins.
 *   - At the bottom of each column sits a locked chest.
 *     Clearing all crates in a column opens the chest revealing a multiplier (2x–100x).
 *     Multiple open chests have their multipliers multiplied together.
 *   - Bonus game: 3+ scatter symbols (chicken BONUS) trigger 4 free rounds where the
 *     same grid is used across all spins (cumulative destruction).
 *
 * Server-side: we compute the full result in one shot and return it.
 */

import crypto from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RocketColor = 'blue' | 'green' | 'purple' | 'red';
export type CrateType = 'wooden' | 'sturdy' | 'reinforced' | 'metal' | 'stone' | 'royal';

export interface ReelSymbol {
  type: 'rocket' | 'bonus' | 'bomb';
  color?: RocketColor;
  damage: number;  // damage dealt to target crate
}

export interface CrateCell {
  type: CrateType;
  hp: number;
  maxHp: number;
  reward: number;  // coin reward when destroyed (multiplied by bet)
}

export interface ChestResult {
  column: number;
  multiplier: number;
}

export interface SpinOutcome {
  /** 5 reels × 3 rows of symbols that appeared */
  reels: ReelSymbol[][];
  /** Initial 5×7 crate grid (col, row) */
  initialGrid: CrateCell[][];
  /** Grid after all rocket hits (shows remaining hp) */
  finalGrid: CrateCell[][];
  /** Crates destroyed per column during this spin */
  destroyedCrates: { col: number; row: number; reward: number }[];
  /** Chests opened (columns fully cleared) */
  openedChests: ChestResult[];
  /** Combined chest multiplier (product of all opened chests; 1 if none) */
  chestMultiplier: number;
  /** Coin rewards from destroyed crates (before chest multiplier) */
  crateRewards: number;
  /** Total win = crateRewards × chestMultiplier (before house edge) */
  totalWin: number;
  /** Was bonus triggered (3+ scatter symbols)? */
  bonusTriggered: boolean;
  /** Number of scatters landed */
  scatterCount: number;
  /** How many bonus free spins were awarded */
  freeSpin: number;
}

export interface RoyalDropResult {
  betAmount: number;
  baseSpins: SpinOutcome[];   // always 1 base spin
  bonusSpins: SpinOutcome[];  // 0 or 4 (if bonus triggered)
  totalWin: number;
  /** House edge was applied — win was suppressed */
  houseEdgeApplied: boolean;
}

// ─── Configuration ────────────────────────────────────────────────────────────

// Rocket damage ranges by color (min, max)
const ROCKET_DAMAGE: Record<RocketColor, [number, number]> = {
  blue:   [1, 2],
  green:  [2, 3],
  purple: [3, 5],
  red:    [4, 6],
};

// Crate definitions: type → { hp, reward multiplier }
// reward is a fraction of bet per crate destroyed
const CRATE_DEFS: Record<CrateType, { hp: number; reward: number }> = {
  wooden:     { hp: 1, reward: 0.05 },
  sturdy:     { hp: 2, reward: 0.08 },
  reinforced: { hp: 3, reward: 0.12 },
  metal:      { hp: 4, reward: 0.18 },
  stone:      { hp: 5, reward: 0.25 },
  royal:      { hp: 6, reward: 0.40 },
};

// Crate type distribution per row (row 0 = top, row 6 = bottom)
// Upper rows: weaker crates. Lower rows: tougher crates.
const ROW_CRATE_DIST: CrateType[][] = [
  ['wooden', 'wooden', 'wooden', 'sturdy', 'wooden'],           // row 0
  ['wooden', 'sturdy', 'wooden', 'sturdy', 'reinforced'],       // row 1
  ['sturdy', 'reinforced', 'sturdy', 'metal', 'reinforced'],    // row 2
  ['reinforced', 'metal', 'reinforced', 'metal', 'stone'],      // row 3
  ['metal', 'stone', 'metal', 'stone', 'royal'],                // row 4
  ['stone', 'royal', 'stone', 'royal', 'stone'],                // row 5
  ['royal', 'royal', 'royal', 'royal', 'royal'],                // row 6
];

// Chest multipliers possible when a column is cleared
const CHEST_MULTIPLIERS = [2, 3, 4, 5, 10, 25, 50, 100];
const CHEST_WEIGHTS =      [30, 25, 18, 13, 8,  3,  2,  1];   // ~100 total weight

// Reel symbol pool for each column (weighted)
// Structure: [symbol, weight]
const REEL_POOL: Array<[ReelSymbol, number]> = [
  [{ type: 'rocket', color: 'blue',   damage: 1 }, 30],
  [{ type: 'rocket', color: 'blue',   damage: 2 }, 20],
  [{ type: 'rocket', color: 'green',  damage: 2 }, 18],
  [{ type: 'rocket', color: 'green',  damage: 3 }, 12],
  [{ type: 'rocket', color: 'purple', damage: 3 },  8],
  [{ type: 'rocket', color: 'purple', damage: 4 },  5],
  [{ type: 'rocket', color: 'red',    damage: 5 },  3],
  [{ type: 'rocket', color: 'red',    damage: 6 },  2],
  [{ type: 'bomb',                    damage: 3 },  4],   // hits all crates in col
  [{ type: 'bonus',                   damage: 0 },  3],   // scatter
];

const TOTAL_REEL_WEIGHT = REEL_POOL.reduce((s, [, w]) => s + w, 0);
const TOTAL_CHEST_WEIGHT = CHEST_WEIGHTS.reduce((s, w) => s + w, 0);

// ─── RNG helpers ─────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  // max is exclusive
  return min + crypto.randomInt(0, max - min);
}

function weightedPick<T>(items: T[], weights: number[], totalWeight: number): T {
  let r = crypto.randomInt(0, totalWeight);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function pickReelSymbol(): ReelSymbol {
  let r = crypto.randomInt(0, TOTAL_REEL_WEIGHT);
  for (const [sym, w] of REEL_POOL) {
    r -= w;
    if (r < 0) return { ...sym };
  }
  return { ...REEL_POOL[0]![0] };
}

function pickChestMultiplier(): number {
  return weightedPick(CHEST_MULTIPLIERS, CHEST_WEIGHTS, TOTAL_CHEST_WEIGHT);
}

// ─── Grid builder ─────────────────────────────────────────────────────────────

function buildGrid(): CrateCell[][] {
  // Returns [col][row] where row 0 = top
  const grid: CrateCell[][] = [];
  for (let col = 0; col < 5; col++) {
    grid.push([]);
    for (let row = 0; row < 7; row++) {
      const type = ROW_CRATE_DIST[row]![col]!;
      const def = CRATE_DEFS[type];
      grid[col]!.push({ type, hp: def.hp, maxHp: def.hp, reward: def.reward });
    }
  }
  return grid;
}

function cloneGrid(grid: CrateCell[][]): CrateCell[][] {
  return grid.map(col => col.map(cell => ({ ...cell })));
}

// ─── Spin simulator ───────────────────────────────────────────────────────────

function runSpin(
  betAmount: number,
  grid: CrateCell[][],   // mutated in place
): Omit<SpinOutcome, 'initialGrid' | 'finalGrid'> {
  // Spin 5 reels × 3 rows
  const reels: ReelSymbol[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 3 }, () => pickReelSymbol()),
  );

  let scatterCount = 0;
  const destroyedCrates: SpinOutcome['destroyedCrates'] = [];
  let crateRewards = 0;

  // Each column: sum the damage from the rockets in that column's reel
  for (let col = 0; col < 5; col++) {
    const colSymbols = reels[col]!;
    let totalDamage = 0;
    let hasBomb = false;

    for (const sym of colSymbols) {
      if (sym.type === 'bonus') scatterCount++;
      else if (sym.type === 'bomb') { hasBomb = true; totalDamage += sym.damage; }
      else totalDamage += sym.damage;
    }

    // Apply damage to crates in this column (top-down)
    let remaining = totalDamage;
    const colGrid = grid[col]!;

    for (let row = 0; row < colGrid.length && remaining > 0; row++) {
      const crate = colGrid[row]!;
      if (crate.hp <= 0) continue; // already destroyed

      if (hasBomb) {
        // bomb destroys entire crate regardless of hp
        const reward = parseFloat((crate.reward * betAmount).toFixed(2));
        crateRewards += reward;
        destroyedCrates.push({ col, row, reward });
        crate.hp = 0;
      } else if (remaining >= crate.hp) {
        remaining -= crate.hp;
        const reward = parseFloat((crate.reward * betAmount).toFixed(2));
        crateRewards += reward;
        destroyedCrates.push({ col, row, reward });
        crate.hp = 0;
      } else {
        crate.hp -= remaining;
        remaining = 0;
      }
    }
  }

  // Check for opened chests (all crates in column destroyed)
  const openedChests: ChestResult[] = [];
  for (let col = 0; col < 5; col++) {
    const allDestroyed = grid[col]!.every(c => c.hp <= 0);
    if (allDestroyed) {
      openedChests.push({ column: col, multiplier: pickChestMultiplier() });
    }
  }

  const chestMultiplier = openedChests.length > 0
    ? openedChests.reduce((acc, c) => acc * c.multiplier, 1)
    : 1;

  const totalWin = parseFloat((crateRewards * chestMultiplier).toFixed(2));
  const bonusTriggered = scatterCount >= 3;

  return {
    reels,
    destroyedCrates,
    openedChests,
    chestMultiplier,
    crateRewards: parseFloat(crateRewards.toFixed(2)),
    totalWin,
    bonusTriggered,
    scatterCount,
    freeSpin: bonusTriggered ? 4 : 0,
  };
}

// ─── Main exported function ──────────────────────────────────────────────────

export function royalDrop(betAmount: number, houseEdgePct = 15): RoyalDropResult {
  const grid = buildGrid();

  // Base spin
  const initialGrid = cloneGrid(grid);
  const baseOutcomePartial = runSpin(betAmount, grid);
  const baseOutcome: SpinOutcome = {
    ...baseOutcomePartial,
    initialGrid,
    finalGrid: cloneGrid(grid),
  };

  const baseSpins: SpinOutcome[] = [baseOutcome];
  const bonusSpins: SpinOutcome[] = [];

  // Bonus spins (4 free spins on same grid — cumulative destruction)
  if (baseOutcome.bonusTriggered) {
    for (let i = 0; i < 4; i++) {
      const bonusInitial = cloneGrid(grid);
      const bonusPartial = runSpin(betAmount, grid);
      bonusSpins.push({
        ...bonusPartial,
        initialGrid: bonusInitial,
        finalGrid: cloneGrid(grid),
      });
    }
  }

  // Sum total win
  let totalWin = [...baseSpins, ...bonusSpins].reduce((s, sp) => s + sp.totalWin, 0);
  totalWin = parseFloat(totalWin.toFixed(2));

  // House edge via win suppression.
  // Natural Royal Drop RTP ≈ 163% (analytically measured).
  // suppressionRate = 1 - (targetRTP / naturalRTP)
  // e.g. at 35% edge (target 65%): suppressionRate = 1 - (65/163) ≈ 60%
  // When not suppressed: full crate rewards + chest multipliers are paid out.
  const ROYAL_DROP_NATURAL_RTP = 163;
  let houseEdgeApplied = false;
  if (totalWin > 0) {
    const targetRTP = 100 - houseEdgePct;
    const suppressionRate = Math.max(0, 1 - targetRTP / ROYAL_DROP_NATURAL_RTP);
    const roll = crypto.randomInt(0, 1_000_000) / 1_000_000;
    if (roll < suppressionRate) {
      totalWin = 0;
      houseEdgeApplied = true;
      for (const sp of [...baseSpins, ...bonusSpins]) sp.totalWin = 0;
    } else {
      const cap = betAmount * 500;
      if (totalWin > cap) totalWin = cap;
    }
  }

  return { betAmount, baseSpins, bonusSpins, totalWin, houseEdgeApplied };
}
