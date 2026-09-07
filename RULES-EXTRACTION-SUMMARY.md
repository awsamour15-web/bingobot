# Multi Hot 5 Rules – Extraction & Implementation Summary

## Overview
This document summarizes the **Multi Hot 5 (slots) game rules** that were extracted from the codebase and applied across documentation, steering guides, and code comments.

---

## Rules Extracted

### Core Mechanics
1. **3×3 Grid Layout** – Nine symbol positions arranged in 3 columns × 3 rows
2. **Multiplier Reel** – Left-side reel generating 1x–5x multiplier values
3. **5 Fixed Paylines** – Predetermined line combinations across the grid
4. **Symbol Matching** – Win when all 3 symbols on a payline are identical
5. **Payout Calculation** – Bet × Symbol Multiplier × Reel Multiplier

### Payouts
- 77 (Seven): 8× bet
- $ (Double Dollar): 5× bet
- Bell: 3× bet
- Watermelon: 2× bet
- Orange/Lemon/Cherry: 1× bet

### Paylines (5 Fixed)
1. [1,1,1] – middle row
2. [0,0,0] – top row
3. [2,2,2] – bottom row
4. [0,1,2] – diagonal ↘
5. [2,1,0] – diagonal ↖

### Advanced Rules
- **Multiple Paylines:** All winning paylines pay out on a single spin; totals are combined
- **House Edge:** 35% default (players get ~65% RTP on average)
- **Win Suppression:** ~35% chance a win is suppressed to maintain RTP
- **Max Win Cap:** Single spin limited to 20× bet amount
- **Gamble Feature:** After a win, players can guess RED/BLACK to double or lose all
- **Auto-Spin:** Continuous spinning feature available
- **Bet Tiers:** 8 fixed bet levels (5, 8, 10, 20, 50, 100, 200, 500 ETB)

---

## Documentation Created

### 1. MULTI-HOT-5-RULES.md
**Location:** Root directory
**Audience:** Players
**Content:**
- Game overview and layout
- Symbol payouts table
- Payline system explained
- Multiplier reel mechanics
- House edge & payouts
- Gamble feature details
- Spin mechanics (auto-spin, bet selection)
- Winning display
- Wallet & balance info
- Special rules & edge cases

**Use Case:** Display in-game or on website for player education

---

### 2. GAME-RULES-ADMIN-GUIDE.md
**Location:** Root directory
**Audience:** Admins & backend engineers
**Content:**
- Backend implementation details
- House edge configuration
- Reel & multiplier configuration
- Payout table structure
- API endpoints (spin, gamble)
- Monitoring & analytics
- RTP verification formula
- Bonus & promotions logic
- Troubleshooting guide
- Configuration examples
- Compliance notes

**Use Case:** Configure game parameters, monitor RTP, troubleshoot issues

---

### 3. GAME-RULES-QUICK-REF.md
**Location:** Root directory
**Audience:** Developers
**Content:**
- Visual layout diagrams
- Payout formula reference
- Symbols & multipliers table
- Paylines quick lookup
- Socket events reference
- Balance & wallet types
- Adjustable parameters
- Debugging tips
- Testing checklist
- Key file locations
- Links to other documentation

**Use Case:** Quick lookup during development, testing reference

---

### 4. .kiro/steering/game-rules.md
**Location:** `.kiro/steering/game-rules.md`
**Audience:** All developers (auto-included in context)
**Content:**
- Multi Hot 5 mechanics overview
- Keno mechanics (for reference)
- Payline rules
- Win calculation
- House edge basics
- Gamble feature
- Features summary
- Development notes

**Use Case:** Automatically loaded as steering file for project-wide context

---

## Code Comments Enhanced

### File: apps/backend/src/services/slots-engine.service.ts

**Changes:**
1. Updated header comment with comprehensive rule documentation
2. Enhanced paylines comment explaining win mechanics
3. Improved payout explanation with formula
4. Added detailed house edge rule documentation in `spin()` function
5. Added gamble feature rule documentation in `gamble()` function

**Before:**
```typescript
// Slots Engine — Multi Hot 5 style
// 3×3 grid, 5 fixed paylines, multiplier reel, X2 gamble feature
// House edge controlled via houseEdgePct parameter (default 15%)
```

**After:**
```typescript
// Slots Engine — Multi Hot 5 style
// 3×3 grid, 5 fixed paylines, multiplier reel, X2 gamble feature
// House edge controlled via houseEdgePct parameter (default 35%)
//
// GAME RULES:
// - Players bet on a spin of 3 reels (3 rows each)
// - Multiplier reel generates 1x–5x value
// - 5 fixed paylines determine if symbols match for a win
// - Symbol payouts: 77=8×, $=5×, Bell=3×, Fruit=1-2×
// - Win = Bet × Symbol Multiplier × Multiplier Reel (applied per payline)
// - Multiple paylines can win on a single spin (totals combined)
// - House edge suppresses wins probabilistically to maintain RTP
// - Maximum single spin win capped at 20× bet
// - Gamble feature available post-win: guess RED/BLACK to double or lose
```

---

## Rule Application Across Components

### Frontend (SlotsScreen.tsx)
**Where rules are applied:**
- Bet tier selection (BETS array)
- Symbol SVG rendering (SYMBOLS array)
- Payline win detection (winCells function)
- Payout display
- Gamble modal (2x feature)
- Auto-spin logic
- Balance checks

### API Layer (api.ts)
**Where rules are applied:**
- spinSlots() endpoint
- gambleSlots() endpoint
- SpinResponse type (includes multiplierReel, paylineWins)
- GambleResult type

### Backend Service (slots-engine.service.ts)
**Where rules are applied:**
- spin() function (core mechanics)
- gamble() function (gamble feature)
- Payout calculation
- House edge application
- Win suppression logic
- Max win cap

---

## Cross-Reference Matrix

| Rule | Documentation | Code | Admin | Quick Ref |
|------|---------------|------|-------|-----------|
| Paylines (5 fixed) | ✓ | ✓ | ✓ | ✓ |
| Payout formula | ✓ | ✓ | ✓ | ✓ |
| House edge (35%) | ✓ | ✓ | ✓ | ✓ |
| Multiplier reel | ✓ | ✓ | ✓ | ✓ |
| Gamble feature | ✓ | ✓ | ✓ | ✓ |
| Win suppression | ✓ | ✓ | ✓ | ✓ |
| Max win cap (20×) | ✓ | ✓ | ✓ | ✓ |
| Symbol payouts | ✓ | ✓ | ✓ | ✓ |
| Multiple paylines | ✓ | ✓ | ✓ | ✓ |
| Auto-spin feature | ✓ | – | – | ✓ |
| Bet tiers | ✓ | – | ✓ | ✓ |
| RTP monitoring | – | – | ✓ | – |

---

## How to Use These Rules

### For Players
1. Read **MULTI-HOT-5-RULES.md** for complete game overview
2. Reference **GAME-RULES-QUICK-REF.md** for specific symbols/payouts

### For Developers
1. Add **game-rules.md** to context (steering file)
2. Reference **GAME-RULES-QUICK-REF.md** during development
3. Consult code comments in `slots-engine.service.ts` for implementation details

### For Admins
1. Review **GAME-RULES-ADMIN-GUIDE.md** for configuration options
2. Use troubleshooting section for issue diagnosis
3. Monitor RTP using provided formulas

### For QA/Testing
1. Use **GAME-RULES-QUICK-REF.md** testing checklist
2. Verify example calculations match actual payouts
3. Test edge cases (max win cap, house edge suppression)

---

## Documentation Maintenance

### When to Update
- If payout table changes → update all 4 docs + code
- If house edge changes → update all 4 docs + code
- If new features added (e.g., new gamble modes) → update all relevant docs
- If bug fixes affect mechanics → update code comments + quick-ref

### Version Control
All documentation should be in the root or `.kiro/steering/` for easy access.
Code comments in `slots-engine.service.ts` serve as source-of-truth for implementation.

---

## Validation Checklist

- [x] Paylines documented (5 fixed)
- [x] Payouts table extracted and applied
- [x] House edge rule documented (35%)
- [x] Win suppression explained
- [x] Max win cap (20×) noted
- [x] Gamble feature details included
- [x] Multiplier reel mechanics explained
- [x] Multiple payline rule documented
- [x] Formula provided (Bet × Symbol × Reel)
- [x] Code comments enhanced
- [x] Admin guide created
- [x] Quick reference created
- [x] Steering file created
- [x] Player-facing guide created

---

## Summary

The **Multi Hot 5 rules** have been comprehensively extracted from the codebase and distributed across:

1. **4 documentation files** covering player, admin, developer, and quick-ref audiences
2. **Enhanced code comments** in the backend engine service
3. **Steering file** for automatic project-wide context
4. **Cross-referenced** through a comprehensive matrix

All rules are now **discoverable, maintainable, and consistent** across the entire platform.

**Key Rule:** *Bet × Symbol Multiplier × Multiplier Reel = Payout* (applied per payline, summed for total)
