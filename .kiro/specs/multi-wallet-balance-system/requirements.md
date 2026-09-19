# Requirements Document

## Introduction

This feature introduces a three-wallet balance system for players. Currently the system has two wallet types (`main` and `play`). This feature adds a third wallet type — `bonus` — and formalises the exact rules governing deposits, withdrawals, game entry deductions, and win payouts across all three wallet types.

**Wallet Summary:**

| Wallet | Alias | Funded By | Used For | Withdrawable |
|---|---|---|---|---|
| Main | Winner Balance | Game winnings | Withdrawal, Bingo entry (fallback) | Yes |
| Play | Deposit Balance | Player deposits | All game entries (priority) | No |
| Bonus | Welcome/Bonus Balance | Promotions & bonuses | Bingo game entry only | No |

## Glossary

- **Wallet_Service**: The backend service responsible for all balance mutations (credit, debit, debitDual).
- **Main_Wallet**: The wallet that receives game winnings. Its balance can be withdrawn. Aliased as "Winner Balance" in the UI.
- **Play_Wallet**: The wallet funded by player deposits. Used as the primary source for game entry stakes. Cannot be withdrawn. Aliased as "Deposit Balance" in the UI.
- **Bonus_Wallet**: The wallet funded exclusively by promotions and welcome bonuses. Can only be used to enter Bingo rounds. Cannot be withdrawn or used for any other game. Aliased as "Welcome Bonus Balance" / "Bonus Balance" in the UI.
- **Bingo_Game**: The multiplayer bingo card (cartela) game managed by game rounds and round entries.
- **Non_Bingo_Game**: Any game that is not the Bingo game — including Crash, Slots, Keno, Plinko, Royal Drop, and external Gregmorn Hub games.
- **Player**: A registered, phone-verified user of the platform.
- **Admin**: A platform administrator with the admin or super_admin role.
- **Debit_Priority_Order**: The sequence in which wallets are drained when a player places a bet: Bonus_Wallet (Bingo only) → Play_Wallet → Main_Wallet.
- **Transaction**: An immutable ledger record attached to a specific wallet recording every credit or debit event.

---

## Requirements

### Requirement 1: Three-Wallet Structure per Player

**User Story:** As a player, I want three separate balance buckets so that I can clearly see where my winnings, deposits, and bonuses are held.

#### Acceptance Criteria

1. THE Wallet_Service SHALL maintain exactly three wallets per Player: one of type `main`, one of type `play`, and one of type `bonus`.
2. WHEN a new Player account is created, THE Wallet_Service SHALL automatically create all three wallets with an initial balance of 0.00.
3. THE Wallet_Service SHALL enforce a unique constraint so that no Player has more than one wallet of each type.
4. WHEN a Player's balance is requested, THE System SHALL return the current balance of all three wallets individually.

---

### Requirement 2: Deposit Flow — Play Wallet

**User Story:** As a player, I want my deposits to land in my Play (Deposit) wallet so that I always know my deposited funds are separate from winnings.

#### Acceptance Criteria

1. WHEN a deposit is successfully confirmed, THE Wallet_Service SHALL credit the deposited amount to the Player's Play_Wallet.
2. THE Wallet_Service SHALL record a `deposit` transaction on the Play_Wallet for every confirmed deposit.
3. IF a deposit confirmation fails for any reason, THEN THE Wallet_Service SHALL leave all wallet balances unchanged.

---

### Requirement 3: Win Payout Flow — Main Wallet

**User Story:** As a player, I want all game winnings credited to my Main (Winner) wallet so that I can withdraw them.

#### Acceptance Criteria

1. WHEN a Bingo round winner is determined, THE Wallet_Service SHALL credit the full derash amount to the winner's Main_Wallet.
2. WHEN a Non_Bingo_Game produces a winning payout, THE Wallet_Service SHALL credit the payout to the player's Main_Wallet.
3. THE Wallet_Service SHALL record a `game_win` transaction on the Main_Wallet for every win credit.
4. THE Wallet_Service SHALL never credit game winnings to the Play_Wallet or the Bonus_Wallet.

---

### Requirement 4: Withdrawal — Main Wallet Only

**User Story:** As a player, I want to be able to withdraw only my winning balance so that deposited and bonus funds remain ring-fenced.

#### Acceptance Criteria

1. THE Wallet_Service SHALL permit withdrawal debits exclusively from the Main_Wallet.
2. WHEN a withdrawal is requested against the Play_Wallet or Bonus_Wallet, THE Wallet_Service SHALL reject the request with an error.
3. IF a withdrawal amount exceeds the Main_Wallet balance, THEN THE Wallet_Service SHALL reject the withdrawal with an insufficient funds error.

---

### Requirement 5: Bonus Wallet — Funding

**User Story:** As a player, I want welcome and promotional bonuses to appear in my Bonus wallet so that I can use them specifically for Bingo.

#### Acceptance Criteria

1. WHEN a welcome bonus is granted to a new Player, THE Wallet_Service SHALL credit the bonus amount to the Player's Bonus_Wallet.
2. WHEN a promotion distributes a bonus and the promotion's `bonus_wallet` field is set to `bonus`, THE Wallet_Service SHALL credit the bonus amount to the Player's Bonus_Wallet.
3. THE Wallet_Service SHALL record a `bonus` transaction on the Bonus_Wallet for every bonus credit.
4. THE Wallet_Service SHALL never credit deposit amounts or game winnings to the Bonus_Wallet.

---

### Requirement 6: Bingo Game Entry — Debit Priority Order

**User Story:** As a player, I want my Bingo stake deducted from my Bonus wallet first, then Play wallet, then Main wallet, so that I get full value from my bonus balance.

#### Acceptance Criteria

1. WHEN a Player joins a Bingo round, THE Wallet_Service SHALL deduct the stake following the Debit_Priority_Order: Bonus_Wallet first, then Play_Wallet, then Main_Wallet.
2. WHEN the Bonus_Wallet balance is sufficient to cover the full stake, THE Wallet_Service SHALL deduct the entire stake from the Bonus_Wallet only.
3. WHEN the Bonus_Wallet balance is insufficient to cover the full stake, THE Wallet_Service SHALL deduct the available Bonus_Wallet balance first, then deduct the remainder from Play_Wallet and then Main_Wallet.
4. WHEN the combined balance of Bonus_Wallet, Play_Wallet, and Main_Wallet is less than the stake amount, THE Wallet_Service SHALL reject the join attempt with an insufficient funds error.
5. THE Wallet_Service SHALL record a separate `game_entry` transaction on each wallet that is debited in a single round entry.

---

### Requirement 7: Non-Bingo Game Entry — Bonus Wallet Excluded

**User Story:** As a player, I want my Bonus balance to be protected from non-Bingo games so that it can only be spent where intended.

#### Acceptance Criteria

1. WHEN a Player places a bet on a Non_Bingo_Game, THE Wallet_Service SHALL deduct the stake from Play_Wallet first, then Main_Wallet, without touching the Bonus_Wallet.
2. WHEN the combined balance of Play_Wallet and Main_Wallet is less than the bet amount for a Non_Bingo_Game, THE Wallet_Service SHALL reject the bet with an insufficient funds error even if the Bonus_Wallet has sufficient balance.
3. THE Wallet_Service SHALL never debit the Bonus_Wallet for any Non_Bingo_Game bet.

---

### Requirement 8: Bingo Round Void Refund

**User Story:** As a player, I want any stake refunded to the correct wallets if a Bingo round is voided, so that I don't lose money from a cancelled game.

#### Acceptance Criteria

1. WHEN a Bingo round is voided, THE Wallet_Service SHALL refund each Player's stake back to the exact wallets that were debited during round entry, in the exact amounts debited from each wallet.
2. THE Wallet_Service SHALL record a `refund` transaction on each wallet that receives a refund credit.

---

### Requirement 9: Balance Display in UI

**User Story:** As a player, I want to see all three wallet balances labelled clearly so that I always know what I can spend, withdraw, or use for Bingo.

#### Acceptance Criteria

1. WHEN the balance is displayed to a Player, THE System SHALL show the Main_Wallet balance labelled as "Winner Balance".
2. WHEN the balance is displayed to a Player, THE System SHALL show the Play_Wallet balance labelled as "Deposit Balance".
3. WHEN the balance is displayed to a Player, THE System SHALL show the Bonus_Wallet balance labelled as "Bonus Balance".
4. THE System SHALL display all three balances simultaneously in the balance view.

---

### Requirement 10: Admin Wallet Management

**User Story:** As an admin, I want to credit or debit any of the three wallet types manually so that I can handle support cases and corrections.

#### Acceptance Criteria

1. WHEN an Admin issues a manual credit, THE Wallet_Service SHALL credit the specified amount to the specified wallet type (main, play, or bonus) for the target Player.
2. WHEN an Admin issues a manual debit, THE Wallet_Service SHALL debit the specified amount from the specified wallet type for the target Player, provided the balance is sufficient.
3. IF an Admin manual debit amount exceeds the target wallet's balance, THEN THE Wallet_Service SHALL reject the operation with an insufficient funds error.
4. THE Wallet_Service SHALL record an `admin_credit` or `admin_debit` transaction on the affected wallet for every admin operation.

---

### Requirement 11: Transaction Ledger Integrity

**User Story:** As an operator, I want every balance change to produce an immutable transaction record so that the full history of each wallet can be audited.

#### Acceptance Criteria

1. THE Wallet_Service SHALL create a Transaction record for every debit and credit operation on any wallet.
2. THE Wallet_Service SHALL execute every balance update and its corresponding Transaction creation within a single atomic database transaction.
3. IF a database transaction fails, THEN THE Wallet_Service SHALL roll back all balance changes and transaction records atomically, leaving no partial state.
4. THE Wallet_Service SHALL never mutate a wallet balance without a corresponding Transaction record.
