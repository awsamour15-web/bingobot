---
inclusion: manual
---

# Game Rules & Mechanics Guide

This steering file documents the core game rules and mechanics for all games in the Fidel Bingo platform.

## Multi Hot 5 Slots

### Core Mechanics
- **3×3 grid** with 5 fixed paylines
- **Multiplier reel** (1x–5x) on the left
- **7 symbols** with varying payouts (1× to 8× bet)

### Key Rules

#### Paylines
1. Middle (1-1-1)
2. Top (0-0-0)
3. Bottom (2-2-2)
4. Diagonal ↘ (0-1-2)
5. Diagonal ↖ (2-1-0)

#### Win Calculation
```
Payout = Bet × Symbol Multiplier × Multiplier Reel
```

#### Multiple Paylines
- All winning paylines pay out simultaneously
- Multiplier reel applies to each payline individually
- Totals are combined

### Payouts
| Symbol | Multiplier |
|--------|-----------|
| Seven (77) | 8× |
| Double Dollar ($) | 5× |
| Bell | 3× |
| Watermelon | 2× |
| Orange/Lemon/Cherry | 1× |

### Gamble Feature
- **Activation:** Only when win > 0
- **Mechanic:** Guess RED or BLACK
- **Outcome:** Correct = 2× win, Incorrect = 0 (lose all)

### House Edge
- Default: 35% (RTP ~65%)
- Applied probabilistically on wins
- Max win cap: 20× bet

### Features
- **Auto-spin** for continuous play
- **Bet selection** (5–500 ETB)
- **Real-time balance** display

---

## Keno

### Game Overview
- **80 number pool** (1–80)
- **Up to 10 numbers** per bet
- **20 numbers drawn** per round
- **1-10 spot** betting

### Payout Table
| Spots Picked | Matched | Multiplier |
|--------------|---------|-----------|
| 1 | 1 | 3.5× |
| 2 | 2 | 10× |
| 3 | 2 | 2× |
| 3 | 3 | 42× |
| ... | ... | ... |
| 10 | 7+ | 1000×+ |

### Phases
- **Idle:** No active round
- **Betting:** Players place bets (countdown timer)
- **Drawing:** Numbers are drawn one by one
- **Finished:** Results displayed

---

## Quick Pick & Statistics
- **Quick Pick:** Random selection of N numbers
- **Statistics Tab:** Historical data and frequency analysis
- **Replay Bet:** Load previous bet configuration

---

## Bonus & Promotions

### Active Bonuses UI
- Real-time bonus balance display
- Rollover requirement tracking
- Wagering contribution tracking per game

### Promotion Types
- Welcome bonuses
- Deposit bonuses
- Free spins/picks
- Cashback offers

---

## Important Notes for Development

### Multi-Hot 5 Implementation
- Reels spin independently from weighted strips
- House edge applied at win evaluation
- Multiplier reel always re-spins each round
- Gamble is optional post-win only

### Keno Implementation
- Numbers drawn sequentially from a pool
- Payouts determined by matched count and pick count
- Socket events for real-time round progression

### Consistency Rules
- All games use ETB currency
- Balance updates after each action
- Clear error messaging for failed transactions
- Insufficient balance handling with deposit redirect
