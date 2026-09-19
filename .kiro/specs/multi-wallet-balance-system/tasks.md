# Implementation Plan: Multi-Wallet Balance System

## Overview

Extend the existing two-wallet system by adding a `bonus` wallet, replacing `debitDual` with `debitWithPriority`, persisting debit splits for refunds, and updating every call-site across the backend and shared packages.

## Tasks

- [ ] 1. Extend shared types and Prisma schema
  - [ ] 1.1 Add `bonus` to the `WalletType` enum in `packages/shared/src/enums.ts`
    - Export the updated `WalletType` union type and const object with `bonus` value
    - _Requirements: 1.1_
  - [ ] 1.2 Extend `PlayerProfile` and `JoinRoundResponse` in `packages/shared/src/api.ts`
    - Add `bonusWallet: WalletBalance` to `PlayerProfile`
    - Add `bonusWalletBalance: number` to `JoinRoundResponse`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [ ] 1.3 Add `bonus` to the Prisma `WalletType` enum in `apps/backend/prisma/schema.prisma`
    - Add `RoundEntryWalletSplit` model with fields: `id`, `round_id`, `player_id`, `cartela_number`, `wallet_id`, `wallet_type`, `amount`
    - Add composite index on `[round_id, player_id]`
    - _Requirements: 1.1, 8.1_

- [ ] 2. Create and run the database migration
  - [ ] 2.1 Generate a new Prisma migration that adds `bonus` to the PostgreSQL `WalletType` enum, creates the `round_entry_wallet_splits` table, and backfills a `bonus` wallet (balance = 0) for every existing player missing one
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 3. Update `WalletService` with the new three-wallet logic
  - [ ] 3.1 Implement `WalletService.getBalances(playerId)` returning `{ main, play, bonus }`
    - _Requirements: 1.4_
  - [ ] 3.2 Implement `WalletService.debitWithPriority(tx, playerId, amount, context, txType, referenceId?, note?)` returning `DebitResult`
    - Priority order: `bingo` → `[bonus, play, main]`; `non_bingo` → `[play, main]`
    - Reject with `INSUFFICIENT_FUNDS` when combined eligible balance < amount
    - Use `Decimal` arithmetic throughout; assign rounding remainder to last wallet
    - Create one `game_entry` Transaction per wallet debited
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3_
  - [ ]* 3.3 Write property test for `debitWithPriority` — Property 6: Bingo debit priority order
    - **Property 6: Bingo debit priority order**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**
  - [ ]* 3.4 Write property test for `debitWithPriority` — Property 7: Non-Bingo bonus wallet isolation
    - **Property 7: Non-Bingo bonus wallet isolation**
    - **Validates: Requirements 7.1, 7.3**
  - [ ]* 3.5 Write property test for `debitWithPriority` — Property 8: Debit conservation
    - **Property 8: Debit conservation — sum(splits) === stake**
    - **Validates: Requirements 6.5, 7.1**
  - [ ]* 3.6 Write property test for `debitWithPriority` — Property 10: Insufficient funds rejection
    - **Property 10: Insufficient funds rejection**
    - **Validates: Requirements 6.4, 7.2, 4.3, 10.3**
  - [ ] 3.7 Update `assertWithdrawable` to also reject `bonus` wallet type
    - _Requirements: 4.1, 4.2_
  - [ ]* 3.8 Write property test for withdrawal restriction — Property 4: Withdrawal restricted to Main wallet
    - **Property 4: Withdrawal restricted to Main wallet**
    - **Validates: Requirements 4.1, 4.2**
  - [ ]* 3.9 Write unit tests for `WalletService`
    - Test known split calculation (e.g. bonus=50, play=30, main=100, stake=120 → bonus=50, play=30, main=40)
    - Test `getBalances` returns all three wallet values
    - Test `assertWithdrawable` rejects `play` and `bonus`
    - _Requirements: 4.1, 6.2, 6.3, 1.4_

- [ ] 4. Checkpoint — Ensure all WalletService tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Seed bonus wallet on new player creation
  - [ ] 5.1 Update the player-creation code in `apps/backend/src/routers/auth.router.ts` (bot auth flow) to create a third wallet of type `bonus` with balance `0` alongside the existing `main` and `play` wallets
    - _Requirements: 1.2_
  - [ ]* 5.2 Write property test for three-wallet invariant — Property 1: Three-wallet invariant
    - **Property 1: Three-wallet invariant**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [ ] 6. Update deposit, win-payout, and bonus-funding flows
  - [ ] 6.1 Verify that deposit confirmation already calls `WalletService.credit` targeting `play` wallet; add a `deposit` Transaction record if not already present
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ]* 6.2 Write property test for deposit flow — Property 2: Deposit credits Play wallet exclusively
    - **Property 2: Deposit credits Play wallet exclusively**
    - **Validates: Requirements 2.1, 2.2, 5.4**
  - [ ] 6.3 Verify win-payout paths in `GameRoundService` and non-Bingo engines call `WalletService.credit` targeting `main` wallet with `game_win` transaction type
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ]* 6.4 Write property test for win payout — Property 3: Win payout credits Main wallet exclusively
    - **Property 3: Win payout credits Main wallet exclusively**
    - **Validates: Requirements 3.1, 3.2, 3.4**
  - [ ] 6.5 Update `PromotionService.applyBonusToEligiblePlayers` to call `WalletService.credit` with `WalletType.bonus` when promotion `bonus_wallet === 'bonus'`
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 6.6 Write property test for bonus funding — Property 5: Bonus funding credits Bonus wallet exclusively
    - **Property 5: Bonus funding credits Bonus wallet exclusively**
    - **Validates: Requirements 5.1, 5.2, 5.4**

- [ ] 7. Update `GameRoundService` — Bingo entry and refund
  - [ ] 7.1 Update `joinBatch` / `join` soft balance check to include `bonus` wallet balance for Bingo rounds
    - _Requirements: 6.4_
  - [ ] 7.2 Replace `debitDual` call in `GameRoundService.start()` payment loop with `debitWithPriority('bingo', ...)` inside the per-entry Prisma transaction
    - Store the returned `splits` array into `RoundEntryWalletSplit` rows
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 11.2_
  - [ ] 7.3 Update `cancel()` / void refund logic to load `RoundEntryWalletSplit` rows per entry and credit each wallet its recorded split amount with a `refund` transaction type
    - _Requirements: 8.1, 8.2_
  - [ ]* 7.4 Write property test for Bingo refund round-trip — Property 9: Bingo refund round-trip
    - **Property 9: Bingo refund round-trip**
    - **Validates: Requirements 8.1, 8.2**

- [ ] 8. Update non-Bingo game engines
  - [ ] 8.1 Replace `debitDual` with `debitWithPriority('non_bingo', ...)` in `CrashEngine`
    - _Requirements: 7.1, 7.3_
  - [ ] 8.2 Replace `debitDual` with `debitWithPriority('non_bingo', ...)` in `SlotsEngine`
    - _Requirements: 7.1, 7.3_
  - [ ] 8.3 Replace `debitDual` with `debitWithPriority('non_bingo', ...)` in `KenoEngine`
    - _Requirements: 7.1, 7.3_
  - [ ] 8.4 Replace `debitDual` with `debitWithPriority('non_bingo', ...)` in `PlinkoBet` handler
    - _Requirements: 7.1, 7.3_
  - [ ] 8.5 Replace `debitDual` with `debitWithPriority('non_bingo', ...)` in `RoyalDropEngine`
    - _Requirements: 7.1, 7.3_
  - [ ] 8.6 Replace `debitDual` with `debitWithPriority('non_bingo', ...)` in `gregmorn-callback.router` (`ext_game_bet` handler)
    - _Requirements: 7.1, 7.3_

- [ ] 9. Checkpoint — Ensure all game engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Update admin endpoints and balance API responses
  - [ ] 10.1 Update `GET /api/admin/players/:id` and `GET /api/admin/players` to include `bonus_wallet_balance` in each player record
    - _Requirements: 10.1_
  - [ ] 10.2 Update `POST /api/admin/players/:id/credit` validation to permit `'bonus'` as a valid `walletType` value
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [ ]* 10.3 Write property test for admin credit/debit round-trip — Property 12: Admin credit/debit round-trip
    - **Property 12: Admin credit/debit round-trip**
    - **Validates: Requirements 10.1, 10.2, 10.4**
  - [ ] 10.4 Update `wallet.router` balance endpoint to return all three wallet balances using `WalletService.getBalances`
    - _Requirements: 1.4, 9.4_

- [ ] 11. Update frontend balance display
  - [ ] 11.1 Update the player balance view in the Telegram bot / Web UI to display all three wallet balances with the correct labels: "Winner Balance" (main), "Deposit Balance" (play), "Bonus Balance" (bonus)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 12. Transaction atomicity tests
  - [ ]* 12.1 Write property test for transaction atomicity — Property 11: Transaction atomicity
    - **Property 11: Transaction atomicity — one TX record per wallet mutation, zero on failure**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
  - [ ]* 12.2 Write integration tests
    - Full Bingo round lifecycle: join → start → void → verify refunds hit correct wallets
    - Promotion distribution with `bonus_wallet = 'bonus'`: verify bonus wallet credited
    - Withdrawal rejection from `play` and `bonus` wallets via HTTP endpoint
    - _Requirements: 8.1, 5.2, 4.1, 4.2_

- [ ] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use **fast-check** with a minimum of 100 iterations each
- Tag each property test: `// Feature: multi-wallet-balance-system, Property N: <text>`
- All monetary arithmetic must use `Decimal` — never native `number`
- `debitDual` can be removed once all eight call-sites in task 8 are migrated
