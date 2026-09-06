# Multi Hot 5 – Game Rules & Mechanics

## Overview
Multi Hot 5 is a classic 3×3 slots game with 5 fixed paylines, a multiplier reel, and a gamble feature. Players spin to match symbols across paylines and can use the multiplier reel to increase their winnings.

---

## Game Layout

### Grid Structure
- **3 columns × 3 rows** (9 symbol positions total)
- **Multiplier reel** on the left side with options: 1x, 2x, 3x, 4x, 5x
- **5 fixed paylines** that determine winning combinations

### Symbol Payouts (Per 3-of-a-Kind Match)
| Symbol | Payout Multiplier | Appearance |
|--------|-------------------|-----------|
| 🔴 Seven (77) | 8× bet | Red/gold 77 |
| 💰 Double Dollar ($) | 5× bet | Gold currency symbol |
| 🔔 Bell | 3× bet | Yellow bell |
| 🍉 Watermelon | 2× bet | Watermelon slice |
| 🍊 Orange | 1× bet | Orange fruit |
| 🍋 Lemon | 1× bet | Yellow lemon |
| 🍒 Cherry | 1× bet | Paired cherries |

---

## Payline System

### The 5 Fixed Paylines
Each payline spans left to right across the 3 columns and specifies which row in each column to evaluate:

1. **Middle line** (row 1-1-1) – Center row across all columns
2. **Top line** (row 0-0-0) – Top row across all columns
3. **Bottom line** (row 2-2-2) – Bottom row across all columns
4. **Diagonal ↘** (row 0-1-2) – Top-left to bottom-right
5. **Diagonal ↖** (row 2-1-0) – Bottom-left to top-right

### Win Conditions
A payline wins when the same symbol appears on all three positions in that payline (e.g., all three are Sevens). Multiple paylines can win on a single spin, and their payouts are **combined**.

---

## Multiplier Reel Mechanics

### How It Works
The multiplier reel is a separate spin column on the left side that generates a multiplier value (1, 2, 3, 4, or 5).

### Payout Formula
```
Payout = Bet Amount × Symbol Multiplier × Multiplier Reel Value
```

**Example:**
- Bet: 10 ETB
- Three Sevens on middle line (symbol payout = 8×)
- Multiplier reel shows: 2×
- **Result:** 10 × 8 × 2 = **160 ETB**

### Multiple Paylines with Multiplier
When multiple paylines win on a single spin, the multiplier reel value is applied to each winning payline, then totals are combined.

**Example:**
- Bet: 10 ETB
- Middle line wins with three Sevens: 10 × 8 = 80 ETB
- Top line wins with three Watermelons: 10 × 2 = 20 ETB
- Multiplier reel shows: 3×
- **Result:** (80 × 3) + (20 × 3) = 240 + 60 = **300 ETB**

---

## House Edge & Payouts

### House Edge
- Default house edge: **35%** (players receive ~65% RTP on average)
- House edge is applied probabilistically on winning spins to maintain target RTP

### Win Suppression
- On any winning spin, there is a chance (~35%) that the win is suppressed (converted to zero)
- This keeps the overall game fair and sustainable

### Maximum Win Cap
- **Maximum single spin win:** 20× the bet amount
- If calculated wins exceed this cap, individual payline payouts are reduced proportionally
- This prevents outlier losses to the house

---

## Gamble Feature (2x Button)

### Activation
- The gamble button activates only when a win is present (totalWin > 0)
- Disabled during spins or when there is no active win

### How to Play
1. After a winning spin, click the **2x** button
2. A card appears face-down in the gamble modal
3. Choose **RED** or **BLACK**
4. The card is revealed:
   - **Correct guess:** Winnings are **doubled**
   - **Incorrect guess:** **Lose all winnings**

### Gamble Multiplier Progression
While the displayed multiplier reel shows 1x, 2x, and 5x in the UI for illustration, the actual gamble always applies:
- **Win guess:** 2× the current win amount
- **Lose guess:** 0 ETB (all winnings lost)

### Risk & Reward
- Players can choose to take their winnings and skip the gamble with the "Take Win" button
- The gamble is optional—no pressure to double or lose

---

## Spin Mechanics

### Auto-Spin
- **Auto toggle** enables continuous spinning
- Each auto-spin goes through the full spin animation cycle
- Auto stops if:
  - A win occurs (player must manually handle gamble or collect)
  - Insufficient balance
  - Player manually toggles auto off

### Bet Selection
- **8 bet tiers:** 5, 8, 10, 20, 50, 100, 200, 500 ETB
- Use **-** and **+** buttons to adjust bet size
- Bet size changes between spins, not during a spin

### Spin Animation
- Reels and multiplier reel scramble for ~900ms
- Final result is revealed and locked
- Winning symbols are highlighted with a glow effect

---

## Winning Display

### Visual Feedback
- **Winning cells** are highlighted with golden borders and glow
- The payline number and symbols are shown above the grid
- Individual payline wins are displayed with their respective payout amounts

### Winning Symbols
When a payline matches, all three matching symbols are highlighted simultaneously across their respective columns.

---

## Wallet & Balance

### Wallet Types
- **Main Wallet** (👜) – Primary account balance for slots
- **Play Wallet** (🏆) – Bonus/play balance (Bingo only, not applicable to slots)
- **Last Win** (◉) – Most recent spin outcome

### Balance Updates
- Balances are updated immediately after a spin result
- If insufficient balance, the spin is rejected with an error message
- Players are redirected to deposit if balance falls below the bet amount

---

## House Edge & RTPs

### Payable Symbols (Theoretical)
| Symbol | Payout | Hit Frequency |
|--------|--------|---------------|
| 77 | 8× | Low (premium) |
| $ | 5× | Low |
| Bell | 3× | Medium |
| Watermelon | 2× | Medium |
| Orange, Lemon, Cherry | 1× | High (frequent) |

### Effective RTP
With the 35% house edge and win suppression, the expected long-term payout is approximately **65%** of total wagered.

---

## Special Rules & Edge Cases

### Multiple Paylines on One Spin
- All matching paylines win simultaneously
- Payouts are summed together
- The multiplier reel applies to all wins

### Symbol Matching Across Columns
- Symbols must match exactly (cherry ≠ lemon, etc.)
- Each column is spun independently using weighted reels
- Reel weightings ensure controlled hit frequency

### No Free Spins or Bonus Rounds
- Each spin is independent
- Multiplier reel is re-spun on every spin
- Only features: normal spins + gamble on wins

### Gamble Loss Behavior
- If a gamble is lost, the win is set to 0
- Players cannot gamble a zero amount
- The ↓ (collect) button becomes active to reset and start a new spin

---

## UI Controls

### Main Buttons
- **↺ AUTO** – Toggle automatic continuous spinning
- **2× Gamble** – Double your win (or lose all)
- **↓ Collect** – Take your winnings and reset for next spin

### Bet Controls
- **-** Button – Decrease bet (minimum: 5 ETB)
- **+** Button – Increase bet (maximum: 500 ETB)
- **Central spin area** – Click to initiate spin

### Info & Settings
- **Rules button** – Opens comprehensive rules/paytable screen
- **Settings** – Access game settings and configuration

---

## Summary

Multi Hot 5 combines:
✓ Classic 3×3 slots layout
✓ 5 fixed paylines for multiple win opportunities
✓ Multiplier reel for amplified payouts
✓ Optional gamble feature for risk-reward gameplay
✓ Automatic spinning for continuous play
✓ Fair house edge with transparent RTP

Enjoy the game responsibly!
