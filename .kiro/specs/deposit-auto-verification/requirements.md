# Requirements Document

## Introduction

This feature enables players to deposit funds by sending money manually to the system's Telebirr account, then submitting their transaction number to the Telegram bot. The bot matches the transaction number against a pending deposit record pre-created by an admin, and automatically credits the player's main wallet — no manual admin approval step required after the record is created.

## Glossary

- **PendingDeposit**: A deposit record created by an admin in advance, containing the expected amount and the Telebirr transaction number to expect.
- **Transaction_Number**: The reference string shown on the player's Telebirr payment receipt (e.g. `TXN123456`).
- **Verification**: The act of matching a player-submitted Transaction_Number against a PendingDeposit record and crediting the wallet.
- **Main_Wallet**: The player's real-money wallet that receives credited funds.
- **Bot**: The Telegram bot through which players interact with the deposit flow.
- **Admin Panel**: The web interface where admins create PendingDeposit records.

---

## Requirements

### Requirement 1: Admin Creates Pending Deposit Record

**User Story:** As an admin, I want to create a pending deposit record with the expected amount and Telebirr transaction number, so that when a player submits that transaction number the system can verify it automatically.

#### Acceptance Criteria

1. WHEN an admin submits a valid amount and transaction number via the admin panel, THE system SHALL create a PendingDeposit record with status `pending`, storing the amount and transaction number.
2. WHEN a transaction number already exists in the PendingDeposit table, THE system SHALL reject the creation request with a `DUPLICATE_TX_NUMBER` error.
3. WHEN an admin creates a PendingDeposit, the record SHALL NOT be linked to any player until a player claims it by submitting the transaction number.
4. THE admin panel SHALL list all PendingDeposit records with their status (`pending`, `claimed`), amount, transaction number, and timestamps.

---

### Requirement 2: Player Requests Deposit Account

**User Story:** As a player, I want to ask the bot for the deposit account, so that I know which Telebirr number to send money to.

#### Acceptance Criteria

1. WHEN a registered player taps "Deposit 💰" in the bot, THE bot SHALL display the configured Telebirr account number and clear deposit instructions.
2. THE deposit instructions SHALL tell the player to send the transaction number back to the bot after completing the payment.
3. THE Telebirr account number SHALL be read from the database `Config` table (key: `deposit_telebirr_number`) so admins can update it without a code deploy.

---

### Requirement 3: Player Submits Transaction Number via Bot

**User Story:** As a player, I want to send my Telebirr transaction number to the bot after paying, so that my wallet is credited automatically.

#### Acceptance Criteria

1. WHEN a player sends a message starting with `/txn` followed by a transaction number (e.g. `/txn TXN123456`), THE bot SHALL attempt to verify the deposit.
2. WHEN the transaction number matches a PendingDeposit record with status `pending`, THE bot SHALL atomically mark the record as `claimed`, link it to the player, and credit the player's Main_Wallet with the deposit amount.
3. WHEN the transaction number does not match any PendingDeposit record, THE bot SHALL reply with a `not found` message and instruct the player to contact support.
4. WHEN the transaction number matches a PendingDeposit record that is already `claimed`, THE bot SHALL reply that the transaction has already been used and instruct the player to contact support.
5. WHEN the wallet credit succeeds, THE bot SHALL reply confirming the credited amount and the player's new main wallet balance.
6. THE bot SHALL record a `deposit` Transaction with the transaction number stored as `reference_id`.

---

### Requirement 4: Idempotency and Duplicate Protection

**User Story:** As a system operator, I want each transaction number to be claimable exactly once, so that no player can double-credit their wallet.

#### Acceptance Criteria

1. THE PendingDeposit table SHALL enforce a unique constraint on the transaction number column at the database level.
2. WHEN two concurrent requests submit the same transaction number, THE system SHALL credit the wallet exactly once and return an already-claimed error for the second request.
3. FOR ALL transaction numbers, submitting the same number N times SHALL result in at most one wallet credit regardless of N.

---

### Requirement 5: Admin Panel Deposit Management

**User Story:** As an admin, I want to view and manage all pending and claimed deposits from the admin panel, so that I can track deposit status and troubleshoot issues.

#### Acceptance Criteria

1. THE admin panel SHALL display a deposits table showing: transaction number, amount, status, player username (if claimed), and timestamps.
2. THE admin panel SHALL allow an admin to manually mark a `pending` deposit as `cancelled` to prevent future claiming.
3. THE admin panel SHALL show a count of pending, claimed, and cancelled deposits in a summary row.
