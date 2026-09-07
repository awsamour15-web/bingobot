# Game Rules & Configuration – Admin Guide

This guide explains the core game mechanics and how admins can configure and monitor them.

---

## Multi Hot 5 Slots

### Backend Implementation
Located in: `apps/backend/src/services/slots-engine.service.ts`

#### Core Configuration

**House Edge (Default: 35%)**
```typescript
export function spin(betAmount: number, houseEdgePct = 35): SpinResult
```
- Controls long-term RTP (return-to-player) at ~65%
- Applied probabilistically on wins (if roll < houseEdgePct, win is suppressed)
- Can be adjusted per spin via API parameter

**Maximum Win Cap (20× bet)**
- Hard limit to prevent outlier losses
- If total win exceeds this, individual paylines are reduced proportionally
- Maintains sustainable house advantage

#### Reel Configuration

**Symbol Distribution**
- 3 reel strips (columns) with weighted distributions
- Column 0: fewer premiums (left)
- Column 1: moderate premiums (middle)
- Column 2: moderate premiums (right)

**Multiplier Reel**
```typescript
const MULTIPLIER_STRIP = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 3, 1];
```
- 20 values total
- Distribution: 1x (12), 2x (3), 3x (1), 4x (0), 5x (0)
- Roughly 60% 1x, 15% 2x, 5% 3x, 20% other

#### Payout Table

```typescript
export const PAYOUTS: Record<Symbol, number> = {
  seven:         8,
  double_dollar: 5,
  bell:           3,
  watermelon:     2,
  orange:         1,
  lemon:          1,
  cherry:         1,
};
```

Each value is applied as: **Bet × Symbol Multiplier × Multiplier Reel Value**

#### Payline System

```typescript
export const PAYLINES: [number, number, number][] = [
  [1, 1, 1], // line 1 — middle row
  [0, 0, 0], // line 2 — top row
  [2, 2, 2], // line 3 — bottom row
  [0, 1, 2], // line 4 — diagonal top-left to bottom-right
  [2, 1, 0], // line 5 — diagonal bottom-left to top-right
];
```

**Win Rule:** All three symbols on a payline must be identical.

**Multiple Paylines:** All winning paylines on a single spin are paid out individually, with the multiplier reel applied to each, and totals combined.

### API Integration

**Spin Endpoint**
```
POST /api/slots/spin
Body: { betAmount: number }
Response: {
  spinId: string;
  reels: Symbol[][];
  multiplierReel: number;
  paylineWins: PaylineWin[];
  totalWin: number;
  balance: number;
  canGamble: boolean;
}
```

**Gamble Endpoint**
```
POST /api/slots/gamble
Body: { spinId: string; guess: 'red' | 'black' }
Response: {
  spinId: string;
  guess: 'red' | 'black';
  actual: 'red' | 'black';
  won: boolean;
  payout: number;
  balance: number;
}
```

### Monitoring & Analytics

**Track:**
- Average bet size
- Win rate percentage
- Average payout per spin
- Gamble participation rate
- Gamble win rate
- House edge realized vs. theoretical

**Formula to Verify House Edge:**
```
Actual_RTP = (Sum of All Payouts) / (Sum of All Bets)
Target_RTP = 1 - (houseEdgePct / 100)
```

If actual RTP deviates significantly from target, check:
1. Reel weight distribution
2. Payout multipliers
3. House edge parameter accuracy
4. Multiplier reel distribution

---

## Keno

### Backend Implementation
Located in: `apps/backend/src/services/keno-engine.service.ts` (if separate) or game service

#### Game Flow

1. **Betting Phase**
   - Players select 1–10 numbers from 80
   - Place bet amount
   - Betting window closes at countdown 0

2. **Drawing Phase**
   - 20 numbers drawn sequentially from pool
   - Each draw triggers socket event: `KENO_NUMBER_DRAWN`
   - Current ball displayed in UI

3. **Finished Phase**
   - All 20 numbers revealed
   - Payouts calculated based on matched count
   - Results stored in history

#### Payout Table Structure

```typescript
const PAYOUT_TABLE: Record<number, Record<number, number>> = {
  // PAYOUT_TABLE[picked][matched] = multiplier
  1:  { 1: 3.5 },
  2:  { 2: 10 },
  3:  { 2: 2, 3: 42 },
  // ... continues
  10: { 0: 0, 1: 0, 2: 0, /* ... */ 7: 1000 },
};
```

**Key Rules:**
- Multiplier only applies if matched ≥ threshold for that pick count
- Higher pick counts have exponentially higher payouts
- Minimum match threshold varies by pick count

#### Socket Events

| Event | Payload | When |
|-------|---------|------|
| `KENO_BETTING_OPEN` | `{ roundId, endsAt }` | Betting phase starts |
| `KENO_NUMBER_DRAWN` | `{ roundId, drawnSoFar[], number }` | Each number drawn |
| `KENO_ROUND_FINISHED` | `{ roundId, drawnNumbers[] }` | All 20 drawn |

#### Admin Configuration

**Round Timing**
- Betting window duration (configurable)
- Drawing interval between each number
- Delay before next betting opens

**Payout Control**
- Modify `PAYOUT_TABLE` to adjust house edge
- Higher multipliers = lower RTP
- Typical target: 85–90% RTP for Keno

---

## Bonus & Promotions

### Admin Panel Configuration

**BonusPage Fields:**
- Bonus amount
- Rollover requirement
- Game eligibility (Keno, Slots, etc.)
- Expiration date
- Maximum win cap (optional)

**Tracking:**
- Real-time rollover progress
- Wagering contribution per game
- Bonus balance vs. real balance

### Bonus Distribution Logic

```
If bonus balance > 0 AND rollover not met:
  - Use bonus funds first on each bet
  - Track contribution toward rollover
  - Once rollover met, convert to real balance
  
If bonus expires:
  - Remaining bonus revoked
  - Real winnings retained
```

---

## Key Rules Summary for Admins

### House Edge Control

| Game | Default Edge | RTP | Control Method |
|------|--------------|-----|----------------|
| Multi Hot 5 | 35% | ~65% | houseEdgePct parameter, win suppression |
| Keno | Varies | 85–90% | Payout table multipliers |

### Bet Limits

**Multi Hot 5 Slots**
- Min: 5 ETB
- Max: 500 ETB
- 8 fixed tiers

**Keno**
- Min: 1 ETB (or configurable)
- Max: 1000 ETB (or configurable)

### Win Caps

| Game | Cap |
|------|-----|
| Multi Hot 5 | 20× bet (hard limit) |
| Keno | Varies by configuration |

### Balance Management

- All payouts go to appropriate wallet (main or play)
- Insufficient balance check before spin/bet
- Real-time balance updates after each outcome
- Deposit redirect on insufficient funds

---

## Troubleshooting

### Multi Hot 5 Issues

**Q: Wins are too frequent**
A: Increase houseEdgePct or reduce payout multipliers

**Q: Wins are too rare**
A: Decrease houseEdgePct or increase payout multipliers

**Q: Max win cap too aggressive**
A: Increase from 20× to 25× or 30× (adjust with caution)

### Keno Issues

**Q: Payout too high**
A: Reduce multipliers in PAYOUT_TABLE

**Q: Players not matching threshold**
A: Check reel weight distribution (if random), verify draw logic

### General Issues

**Q: Balance not updating**
A: Verify wallet type (main vs. play), check transaction logs

**Q: Socket events not firing**
A: Verify WebSocket connection, check event emitters in backend

---

## Recommended Monitoring

**Daily:**
- Total bets placed
- Total winnings paid out
- Realized RTP (should track to target)
- Unique active players

**Weekly:**
- Average session duration
- Return player rate
- Top performing games
- Support tickets related to payouts

**Monthly:**
- Revenue vs. target
- Player acquisition cost ROI
- House edge accuracy per game
- Feature feedback from players

---

## Configuration Examples

### Adjust Multi Hot 5 House Edge

```typescript
// In spin API endpoint:
const result = await spin(betAmount, 40); // Increase from 35 to 40 (higher edge)
```

### Adjust Keno Payout

```typescript
// Reduce 10-spot, 7-match payout from 1000x to 800x:
PAYOUT_TABLE[10][7] = 800;
```

### Set Custom Bet Limits

```typescript
const BETS = [10, 25, 50, 100, 250, 500, 1000]; // Custom tiers
const MAX_BET = 1000; // Dynamic max
```

---

## Compliance Notes

- All random number generation uses cryptographically secure `crypto.randomInt()`
- House edge is transparent in rules display
- Payout tables are displayed in-game
- All transactions logged for audit
- Player balances reconcilable from ledger

Ensure all changes to house edge, payouts, or limits are documented and communicated to compliance/legal teams before deployment.
