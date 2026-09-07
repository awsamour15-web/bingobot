# Game Rules – Quick Reference

## Multi Hot 5 Slots

### Layout & Components
```
┌─────────────────────────────────┐
│  MUL │ REEL 1 │ REEL 2 │ REEL 3 │
│ ─────────────────────────────── │
│ [1x] │ [sym]  │ [sym]  │ [sym]  │
│ [2x] │ [sym]  │ [sym]  │ [sym]  │
│ [3x] │ [sym]  │ [sym]  │ [sym]  │
└─────────────────────────────────┘
```

### Payout Formula
```
Payout = Bet × Symbol_Multiplier × Multiplier_Reel
```

### Symbols & Multipliers
| Symbol | ×Bet |
|--------|------|
| 77 | 8 |
| $ | 5 |
| Bell | 3 |
| Watermelon | 2 |
| Other | 1 |

### Paylines (5 Fixed)
```
1. [1,1,1] - middle row
2. [0,0,0] - top row
3. [2,2,2] - bottom row
4. [0,1,2] - diagonal ↘
5. [2,1,0] - diagonal ↖
```

### Win Condition
All 3 symbols on a payline **must be identical**.

### Key Rules
- ✓ Multiple paylines can win on one spin
- ✓ Multiplier reel applies to each payline
- ✓ Payouts are summed
- ✓ House edge: 35% (RTP ~65%)
- ✓ Max win cap: 20× bet
- ✓ Gamble available on wins (double or lose)

### Example Win Calculation
```
Bet: 10 ETB
Middle line: 3× Sevens (symbol ×8) = 10 × 8 = 80 ETB
Top line: 3× Watermelons (symbol ×2) = 10 × 2 = 20 ETB
Multiplier reel: 2×

Total = (80 × 2) + (20 × 2) = 160 + 40 = 200 ETB
```

---

## Keno

### Game Setup
- 80 number pool (1–80)
- Pick 1–10 numbers
- 20 numbers drawn per round
- Payout based on matched count

### Phases
| Phase | Action |
|-------|--------|
| Idle | Waiting for next round |
| Betting | Players select numbers, place bets (countdown) |
| Drawing | 20 numbers drawn sequentially |
| Finished | Results shown, payout calculated |

### Payout Rule
```
Payout = Bet × PAYOUT_TABLE[picked_count][matched_count]
```

### Example
```
Pick 5 numbers, 3 match, bet 10 ETB
Payout = 10 × PAYOUT_TABLE[5][3] (typically ~10–50×)
```

---

## Socket Events

### Multi Hot 5
```typescript
// Spin initiated
await spinSlots(betAmount)

// Gamble available
if (totalWin > 0 && !fromAuto) {
  setShowGamble(true)
}

// Gamble result
await gambleSlots(spinId, guess) // 'red' | 'black'
```

### Keno
```typescript
socket.on('KENO_BETTING_OPEN', (payload) => {
  // roundId, endsAt — countdown started
})

socket.on('KENO_NUMBER_DRAWN', (payload) => {
  // roundId, drawnSoFar[], number — update UI
})

socket.on('KENO_ROUND_FINISHED', (payload) => {
  // roundId, drawnNumbers[] — show results
})
```

---

## Balance & Wallets

### Wallet Types
- **Main Wallet**: Primary balance (required for all games)
- **Play Wallet**: Bonus balance (Keno/Bingo only, not Slots)

### Balance Check
```
if (balance < betAmount) {
  redirect_to_deposit()
}
```

---

## Configurations

### Multi Hot 5 Adjustable Parameters

```typescript
// In spin():
export function spin(betAmount: number, houseEdgePct = 35)

// Payout adjustments:
export const PAYOUTS: Record<Symbol, number> = { /* ... */ }

// Multiplier reel distribution:
const MULTIPLIER_STRIP = [ /* 1, 1, ..., 2, 2, ..., 3 */ ]

// Bet tiers (in UI):
const BETS = [5, 8, 10, 20, 50, 100, 200, 500]

// Max win cap:
const maxWin = betAmount * 20
```

### Keno Adjustable Parameters

```typescript
// Payout table:
const PAYOUT_TABLE: Record<number, Record<number, number>> = { /* ... */ }

// Drawn count per round:
const DRAWN_COUNT = 20

// Pool size:
const POOL_SIZE = 80

// Bet tiers:
const BETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000]
```

---

## Debugging

### Multi Hot 5

**Issue: Win seems wrong**
- Check multiplier reel value
- Verify symbol matching (must be exact)
- Confirm bet amount applied
- Check house edge suppression (35% chance win is cleared)

**Issue: Gamble button not appearing**
- Verify `totalWin > 0`
- Verify `totalWin !== null`
- Verify not in auto-spin
- Verify `gambleId` is set

### Keno

**Issue: Round not advancing**
- Check socket connection
- Verify `KENO_BETTING_OPEN` event fires
- Verify `KENO_NUMBER_DRAWN` fires 20× per round
- Verify `KENO_ROUND_FINISHED` fires at round end

**Issue: Payout incorrect**
- Verify matched count calculation
- Verify PAYOUT_TABLE lookup (picked, matched)
- Check for null/undefined in table

---

## Testing Checklist

- [ ] Single payline win (77 on middle line)
- [ ] Multiple payline wins (77 + watermelon)
- [ ] Multiplier reel applied correctly
- [ ] House edge suppression observed
- [ ] Max win cap triggered (if possible)
- [ ] Gamble: correct guess → 2× win
- [ ] Gamble: incorrect guess → 0
- [ ] Auto-spin loops until stopped
- [ ] Insufficient balance → deposit redirect
- [ ] Balance updates after each action
- [ ] Keno: numbers drawn sequentially
- [ ] Keno: payout calculated correctly
- [ ] Socket events fire on time

---

## Key Files

| Purpose | File |
|---------|------|
| Backend engine | `apps/backend/src/services/slots-engine.service.ts` |
| Frontend screen | `apps/mini-app/src/screens/SlotsScreen.tsx` |
| Keno screen | `apps/mini-app/src/screens/KenoScreen.tsx` |
| API types | `apps/mini-app/src/lib/api.ts` |
| Rules display | `apps/mini-app/src/screens/SlotsScreen.tsx` (RulesScreen component) |

---

## Rules Document Locations

- **Full rules (player-facing):** `MULTI-HOT-5-RULES.md`
- **Admin guide:** `GAME-RULES-ADMIN-GUIDE.md`
- **Developer steering:** `.kiro/steering/game-rules.md`
- **This reference:** `GAME-RULES-QUICK-REF.md`
