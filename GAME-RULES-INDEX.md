# Game Rules Documentation Index

## Quick Navigation

### For Different Audiences

#### 👥 Players
Start here to understand how to play:
- **[MULTI-HOT-5-RULES.md](./MULTI-HOT-5-RULES.md)** – Complete player guide to slots
  - Game overview, payouts, paylines, multiplier reel
  - Gamble feature explanation
  - Balance & wallet management
  - UI controls guide

#### 👨‍💻 Developers
Start with these for implementation:
1. **[.kiro/steering/game-rules.md](./.kiro/steering/game-rules.md)** – Auto-included steering file
2. **[GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md)** – Developer quick reference
   - Paylines lookup table
   - Payout formula
   - Socket events
   - Debugging tips
   - Testing checklist
3. **Code Comments:** `apps/backend/src/services/slots-engine.service.ts`
   - Source of truth for implementation rules

#### 🔧 Admins & Backend Engineers
Configure and monitor games:
- **[GAME-RULES-ADMIN-GUIDE.md](./GAME-RULES-ADMIN-GUIDE.md)** – Administration guide
  - House edge configuration
  - Payout adjustments
  - API endpoints
  - Monitoring & analytics
  - Troubleshooting
  - Compliance notes

#### 📋 Summary & Overview
Understand what was extracted and where:
- **[RULES-EXTRACTION-SUMMARY.md](./RULES-EXTRACTION-SUMMARY.md)** – Meta documentation
  - What rules were extracted
  - Where they appear in docs
  - Cross-reference matrix
  - How to use each document

---

## Multi Hot 5 Slots – Rules at a Glance

### Core Formula
```
Payout = Bet Amount × Symbol Multiplier × Multiplier Reel Value
```

### Key Numbers
| Item | Value |
|------|-------|
| Grid | 3 columns × 3 rows |
| Paylines | 5 fixed |
| Multiplier range | 1x–5x |
| House edge | 35% (RTP ~65%) |
| Max win | 20× bet |
| Bet range | 5–500 ETB |
| Symbol payout range | 1×–8× bet |

### The 5 Paylines
1. Middle row (1,1,1)
2. Top row (0,0,0)
3. Bottom row (2,2,2)
4. Diagonal ↘ (0,1,2)
5. Diagonal ↖ (2,1,0)

### Win Rule
**All 3 symbols on a payline must be identical.**

### Special Features
- ✓ Multiple paylines can win on one spin
- ✓ Gamble feature (double or lose all)
- ✓ Auto-spin capability
- ✓ House edge suppression (probabilistic)

---

## Key Files in Codebase

### Frontend
| File | Purpose |
|------|---------|
| `apps/mini-app/src/screens/SlotsScreen.tsx` | Main slots UI |
| `apps/mini-app/src/lib/api.ts` | API calls (spinSlots, gambleSlots) |

### Backend
| File | Purpose |
|------|---------|
| `apps/backend/src/services/slots-engine.service.ts` | Game engine (spin logic, payouts) |
| `apps/backend/src/websocket/index.ts` | Socket events |

### Configuration
| File | Purpose |
|------|---------|
| `.kiro/steering/game-rules.md` | Steering file (auto-included) |

---

## Documentation Map

```
Root Directory
├── MULTI-HOT-5-RULES.md ...................... [Player guide]
├── GAME-RULES-ADMIN-GUIDE.md ................ [Admin configuration]
├── GAME-RULES-QUICK-REF.md ................. [Developer reference]
├── RULES-EXTRACTION-SUMMARY.md ............. [Meta documentation]
└── GAME-RULES-INDEX.md (this file) ......... [Navigation hub]

.kiro/steering/
└── game-rules.md ........................... [Auto-included steering]

Code Comments
└── apps/backend/src/services/slots-engine.service.ts
    ├── Header comments (rules overview)
    ├── Paylines comment (win mechanics)
    ├── spin() function (house edge, calculations)
    └── gamble() function (gamble feature)
```

---

## Common Questions

### Q: How do I verify the payout calculation?
**A:** See [GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md) – Example Win Calculation section, and [GAME-RULES-ADMIN-GUIDE.md](./GAME-RULES-ADMIN-GUIDE.md) – RTP Verification section.

### Q: What controls the house edge?
**A:** See [GAME-RULES-ADMIN-GUIDE.md](./GAME-RULES-ADMIN-GUIDE.md) – House Edge Control section. Default is 35%, adjustable in `spin()` function.

### Q: How do multiplier reel and paylines interact?
**A:** See [MULTI-HOT-5-RULES.md](./MULTI-HOT-5-RULES.md) – Multiplier Reel Mechanics section, and [GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md) – Example Win Calculation.

### Q: When is the gamble button available?
**A:** Only when `totalWin > 0` and not in auto-spin. See [MULTI-HOT-5-RULES.md](./MULTI-HOT-5-RULES.md) – Gamble Feature section.

### Q: What happens if I hit the max win cap?
**A:** Individual payline amounts are reduced proportionally. See [GAME-RULES-ADMIN-GUIDE.md](./GAME-RULES-ADMIN-GUIDE.md) – Maximum Win Cap.

### Q: How is the house edge applied?
**A:** Probabilistically on wins (~35% chance a win is suppressed). See code comment in `apps/backend/src/services/slots-engine.service.ts` – `spin()` function.

---

## Workflow Examples

### I want to understand how Multi Hot 5 works
1. Read: [MULTI-HOT-5-RULES.md](./MULTI-HOT-5-RULES.md) – full player guide
2. Reference: [GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md) – for quick lookups

### I'm implementing a feature
1. Check: `.kiro/steering/game-rules.md` (steering file, auto-included)
2. Reference: [GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md) – developer section
3. Debug: Read code comments in `slots-engine.service.ts`

### I'm configuring payouts
1. Read: [GAME-RULES-ADMIN-GUIDE.md](./GAME-RULES-ADMIN-GUIDE.md) – configuration section
2. Reference: [GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md) – adjustable parameters
3. Verify: RTP calculation formula in admin guide

### I'm debugging a payout issue
1. Check: [GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md) – debugging section
2. Reference: Example calculation in quick-ref
3. Verify: Multiplier reel value, symbol matching, house edge suppression

---

## Maintenance

### When Rules Change

**Updated House Edge?**
- [ ] Update code in `slots-engine.service.ts`
- [ ] Update [GAME-RULES-ADMIN-GUIDE.md](./GAME-RULES-ADMIN-GUIDE.md)
- [ ] Update [GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md)
- [ ] Update [.kiro/steering/game-rules.md](./.kiro/steering/game-rules.md)

**Updated Payout Table?**
- [ ] Update code in `slots-engine.service.ts`
- [ ] Update [GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md) – symbols table
- [ ] Update [GAME-RULES-ADMIN-GUIDE.md](./GAME-RULES-ADMIN-GUIDE.md) – payout configuration
- [ ] Update [MULTI-HOT-5-RULES.md](./MULTI-HOT-5-RULES.md) – symbol payouts
- [ ] Update [.kiro/steering/game-rules.md](./.kiro/steering/game-rules.md)

**Added New Feature?**
- [ ] Update code comments in relevant file
- [ ] Update [GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md)
- [ ] Update relevant specialist guide
- [ ] Update [.kiro/steering/game-rules.md](./.kiro/steering/game-rules.md) if team-wide impact

---

## Version History

| Date | Change | Documents Updated |
|------|--------|-------------------|
| 2026-09-07 | Initial extraction of Multi Hot 5 rules | All 5 docs created |

---

## Contact & Questions

- **Game balance questions:** See [GAME-RULES-ADMIN-GUIDE.md](./GAME-RULES-ADMIN-GUIDE.md)
- **Player support:** Reference [MULTI-HOT-5-RULES.md](./MULTI-HOT-5-RULES.md)
- **Technical implementation:** Check code comments or [GAME-RULES-QUICK-REF.md](./GAME-RULES-QUICK-REF.md)

---

## Summary

This index connects **5 comprehensive documentation files** covering:
- ✅ Player education (MULTI-HOT-5-RULES.md)
- ✅ Developer reference (GAME-RULES-QUICK-REF.md)
- ✅ Admin configuration (GAME-RULES-ADMIN-GUIDE.md)
- ✅ Auto-included steering (.kiro/steering/game-rules.md)
- ✅ Meta documentation (RULES-EXTRACTION-SUMMARY.md)

**All game rules are now discoverable, maintainable, and applied consistently across the platform.**
