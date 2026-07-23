# Requirements Document

## Introduction

Beteseb Bingo is an Ethiopian betting and gaming platform delivered as a Telegram Mini App (Web App). Players join stake-based bingo games, select number cards (cartelas), and compete in real-time games where a host calls numbers until a winner is found. The platform supports two wallet types (Main Wallet for real money, Play Wallet for in-game credits), a referral system, game history, and a web-based Admin Panel for operators to manage games, users, and finances.

---

## Glossary

- **Beteseb_Bingo**: The overall Telegram Mini App platform
- **Player**: A registered Telegram user who participates in bingo games
- **Admin**: An operator who manages the platform through the web-based Admin Panel
- **Cartela**: A numbered bingo card (5×5 grid, B-I-N-G-O columns) assigned to a player for a game round
- **Game_Round**: A single bingo game session with a defined stake, a set of registered players, a sequence of called numbers, and one or more winners
- **Stake**: The entry fee (in Birr) a player pays to join a Game_Round (e.g., 10 Birr, 20 Birr)
- **Main_Wallet**: A player's real-money balance denominated in Ethiopian Birr
- **Play_Wallet**: A player's in-game credit balance used for low-stakes or free play
- **Derash**: The prize pool for a Game_Round, accumulated from player stakes minus the platform fee
- **Called_Number**: A number announced by the system during a Game_Round (range 1–75)
- **Cartela_Board**: The number selection screen showing all available cartela numbers (1–272+) for a given Game_Round
- **Telegram_Bot**: The Telegram bot entry point that launches the Mini App and sends notifications
- **Admin_Panel**: The web-based operator dashboard for managing games, users, wallets, and configuration
- **Referral**: A mechanism by which a Player invites others and earns a commission on their activity
- **Birr**: Ethiopian currency used for real-money transactions

---

## Requirements

### Requirement 1: Player Registration and Authentication

**User Story:** As a new user, I want to register and authenticate via Telegram, so that my identity is verified and my account is linked to my Telegram profile.

#### Acceptance Criteria

1. WHEN a user opens the Beteseb_Bingo Mini App for the first time, THE Beteseb_Bingo SHALL create a Player account linked to the user's Telegram ID.
2. WHEN a user opens the Mini App, THE Beteseb_Bingo SHALL authenticate the user using Telegram's Mini App `initData` signature verification without requiring a separate username or password.
3. IF the Telegram `initData` signature is invalid or expired, THEN THE Beteseb_Bingo SHALL reject the session and display an error message.
4. THE Beteseb_Bingo SHALL display a Player's Telegram username as the in-app display name.
5. WHEN a Player provides a phone number for verification, THE Beteseb_Bingo SHALL mark the account as phone-verified and display a "Verified" badge on the Wallet screen.

---

### Requirement 2: Home Screen and Stake Selection

**User Story:** As a Player, I want to see available game stakes on the home screen, so that I can choose a game that matches my desired bet amount.

#### Acceptance Criteria

1. THE Beteseb_Bingo SHALL display a home screen showing at least two stake options (e.g., Play 10, Play 20 Birr).
2. THE Beteseb_Bingo SHALL display the current platform statistics including total active players and total games played on the home screen.
3. WHEN a Player selects a stake option, THE Beteseb_Bingo SHALL navigate the Player to the Cartela_Board for that stake level.
4. WHEN no Game_Round is available for a selected stake, THE Beteseb_Bingo SHALL display a message indicating no games are currently available.

---

### Requirement 3: Cartela Selection

**User Story:** As a Player, I want to browse and select a cartela number before a game starts, so that I have a unique bingo card for the round.

#### Acceptance Criteria

1. THE Beteseb_Bingo SHALL display the Cartela_Board showing all available cartela numbers for the selected stake and Game_Round.
2. WHEN a cartela number has already been taken by another Player, THE Beteseb_Bingo SHALL display that number as unavailable and prevent selection.
3. WHEN a Player selects an available cartela number, THE Beteseb_Bingo SHALL deduct the Stake amount from the Player's Main_Wallet or Play_Wallet and reserve the cartela for that Player.
4. IF a Player's wallet balance is less than the Stake amount, THEN THE Beteseb_Bingo SHALL prevent cartela selection and display an insufficient balance message.
5. THE Beteseb_Bingo SHALL display a countdown timer showing the time remaining until the Game_Round starts.
6. WHEN the countdown timer expires, THE Beteseb_Bingo SHALL lock cartela selection and transition the Game_Round to active status.
7. THE Beteseb_Bingo SHALL display the Player's Main_Wallet balance, Play_Wallet balance, and selected Stake amount on the Cartela_Board screen.

---

### Requirement 4: Real-Time Game Play

**User Story:** As a Player, I want to watch the game board update in real-time as numbers are called, so that I can track my progress toward winning.

#### Acceptance Criteria

1. WHEN a Game_Round is active, THE Beteseb_Bingo SHALL display the Player's Cartela as a 5×5 B-I-N-G-O grid with numbers in the range 1–75.
2. WHEN a Called_Number is announced, THE Beteseb_Bingo SHALL highlight that number on the Player's Cartela in real-time without requiring a manual page refresh.
3. THE Beteseb_Bingo SHALL display the current Game_Round's Game ID, number of Players, Stake amount, Derash (prize pool), and count of Called_Numbers on the game screen.
4. THE Beteseb_Bingo SHALL display the most recently Called_Number prominently on the game screen.
5. WHEN a Player's Cartela achieves a bingo pattern (complete row, column, or diagonal), THE Beteseb_Bingo SHALL automatically detect the win and notify the system.
6. WHERE a Player enables Automatic mode, THE Beteseb_Bingo SHALL automatically mark called numbers on the Player's Cartela without manual interaction.
7. WHEN a Player is in "Watching Only" mode, THE Beteseb_Bingo SHALL display the game board without allowing the Player to claim a win.
8. THE Beteseb_Bingo SHALL support display of game labels and messages in Amharic (Ethiopian language).

---

### Requirement 5: Win Detection and Prize Distribution

**User Story:** As a Player, I want to be declared a winner and receive my prize automatically when I complete a bingo pattern, so that I am rewarded fairly and promptly.

#### Acceptance Criteria

1. WHEN a Player's Cartela achieves a valid bingo pattern after a Called_Number is announced, THE Beteseb_Bingo SHALL validate the win against the official sequence of Called_Numbers for that Game_Round.
2. IF a claimed win does not match the official Called_Numbers sequence, THEN THE Beteseb_Bingo SHALL reject the claim and continue the Game_Round.
3. WHEN a valid win is confirmed, THE Beteseb_Bingo SHALL credit the Derash amount to the winner's Main_Wallet within 10 seconds.
4. WHEN a valid win is confirmed, THE Beteseb_Bingo SHALL notify all Players in the Game_Round of the winner's username and cartela number.
5. THE Beteseb_Bingo SHALL calculate the Derash as the sum of all Stake amounts collected for the Game_Round minus the platform commission percentage configured by Admin.

---

### Requirement 6: Wallet Management

**User Story:** As a Player, I want to view my wallet balances and transaction history, so that I can manage my funds.

#### Acceptance Criteria

1. THE Beteseb_Bingo SHALL display a Wallet screen showing the Player's Main_Wallet balance and Play_Wallet balance.
2. THE Beteseb_Bingo SHALL display a transaction history tab listing all deposits, withdrawals, game entries, and winnings with timestamps.
3. WHEN a Player requests a deposit, THE Beteseb_Bingo SHALL initiate a deposit flow supported by the configured payment gateway.
4. WHEN a Player requests a withdrawal, THE Beteseb_Bingo SHALL validate that the requested amount does not exceed the Player's Main_Wallet balance before processing.
5. IF a deposit or withdrawal transaction fails, THEN THE Beteseb_Bingo SHALL display a descriptive error message and leave the Player's wallet balance unchanged.
6. THE Beteseb_Bingo SHALL ensure that Play_Wallet credits are not withdrawable as real money.

---

### Requirement 7: Player Profile and Statistics

**User Story:** As a Player, I want to view my profile, stats, and settings, so that I can track my performance and customize my experience.

#### Acceptance Criteria

1. THE Beteseb_Bingo SHALL display a Profile screen showing the Player's username, Main_Wallet balance, Play_Wallet balance, total games won, total referrals made, and total referral earnings.
2. THE Beteseb_Bingo SHALL display the Player's avatar as the first letter of their username.
3. WHERE the Player enables the Sound setting, THE Beteseb_Bingo SHALL play audio cues when numbers are called during a Game_Round.
4. WHERE the Player disables the Sound setting, THE Beteseb_Bingo SHALL suppress all game audio cues.

---

### Requirement 8: Game History

**User Story:** As a Player, I want to review my past game results, so that I can see my wins, losses, and earnings over time.

#### Acceptance Criteria

1. THE Beteseb_Bingo SHALL display a History screen listing all Game_Rounds the Player has participated in, including Game ID, date, stake, result (win/loss), and prize received.
2. THE Beteseb_Bingo SHALL display Game_Round history entries in reverse chronological order (most recent first).
3. WHEN a Player selects a historical Game_Round, THE Beteseb_Bingo SHALL display the called number sequence and the Player's cartela for that round.

---

### Requirement 9: Referral System

**User Story:** As a Player, I want to invite friends via a referral link and earn a commission, so that I am rewarded for growing the platform.

#### Acceptance Criteria

1. THE Beteseb_Bingo SHALL generate a unique referral link for each Player tied to their Telegram ID.
2. WHEN a new Player registers using a referral link, THE Beteseb_Bingo SHALL associate the new Player with the referring Player.
3. WHEN a referred Player completes a paid Game_Round, THE Beteseb_Bingo SHALL credit a referral commission to the referring Player's Main_Wallet at the rate configured by Admin.
4. THE Beteseb_Bingo SHALL display the total number of successful referrals and total referral earnings on the Player's Profile screen.

---

### Requirement 10: Telegram Bot Notifications

**User Story:** As a Player, I want to receive Telegram notifications about game events, so that I stay informed without keeping the app open.

#### Acceptance Criteria

1. WHEN a Game_Round the Player is registered in is about to start, THE Telegram_Bot SHALL send a Telegram message to the Player at least 60 seconds before the round begins.
2. WHEN a Player wins a Game_Round, THE Telegram_Bot SHALL send a Telegram message to the Player confirming the win and the Derash credited.
3. WHEN a deposit or withdrawal is processed, THE Telegram_Bot SHALL send a Telegram message to the Player confirming the transaction amount and updated balance.
4. THE Telegram_Bot SHALL include a "Open App" inline button in all notification messages that deep-links the Player back into the Mini App.

---

### Requirement 11: Navigation

**User Story:** As a Player, I want consistent bottom navigation across the app, so that I can quickly switch between sections.

#### Acceptance Criteria

1. THE Beteseb_Bingo SHALL display a persistent bottom navigation bar with four tabs: Game, History, Wallet, and Profile.
2. WHEN a Player taps a bottom navigation tab, THE Beteseb_Bingo SHALL navigate to the corresponding screen without a full page reload.
3. WHILE a Game_Round is active, THE Beteseb_Bingo SHALL display a visual indicator on the Game tab showing the round is in progress.

---

### Requirement 12: Admin Panel — User Management

**User Story:** As an Admin, I want to view and manage all registered players, so that I can handle support requests, ban bad actors, and review account details.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a paginated list of all Players showing username, Telegram ID, phone number, Main_Wallet balance, Play_Wallet balance, registration date, and account status.
2. WHEN an Admin searches by username, Telegram ID, or phone number, THE Admin_Panel SHALL filter the Player list to matching results.
3. WHEN an Admin suspends a Player account, THE Beteseb_Bingo SHALL prevent the suspended Player from joining new Game_Rounds or making withdrawals.
4. WHEN an Admin restores a suspended Player account, THE Beteseb_Bingo SHALL re-enable the Player's access immediately.
5. THE Admin_Panel SHALL display a Player's full transaction history and game history on the Player detail page.

---

### Requirement 13: Admin Panel — Game Management

**User Story:** As an Admin, I want to create, monitor, and control game rounds, so that the platform operates smoothly.

#### Acceptance Criteria

1. THE Admin_Panel SHALL allow an Admin to create a new Game_Round by specifying the stake amount, start time, and maximum number of players.
2. WHEN an Admin starts a Game_Round manually, THE Beteseb_Bingo SHALL begin the number-calling sequence immediately regardless of the countdown timer.
3. WHEN an Admin cancels an active or pending Game_Round, THE Beteseb_Bingo SHALL refund all collected Stake amounts to the respective Players' source wallets within 30 seconds.
4. THE Admin_Panel SHALL display a real-time dashboard of all active Game_Rounds showing Game ID, Players count, Derash, Called_Numbers count, and current game status.
5. THE Admin_Panel SHALL display a historical log of all completed and cancelled Game_Rounds with outcomes and total prize distributed.

---

### Requirement 14: Admin Panel — Financial Management

**User Story:** As an Admin, I want to manage player balances and platform finances, so that I can process deposits, withdrawals, and audit revenue.

#### Acceptance Criteria

1. THE Admin_Panel SHALL allow an Admin to manually credit or debit a Player's Main_Wallet or Play_Wallet with a mandatory reason note.
2. THE Admin_Panel SHALL display a list of all pending withdrawal requests with Player details and requested amounts.
3. WHEN an Admin approves a withdrawal request, THE Admin_Panel SHALL trigger the payment gateway payout and update the Player's Main_Wallet balance.
4. WHEN an Admin rejects a withdrawal request, THE Admin_Panel SHALL return the held funds to the Player's Main_Wallet and notify the Player via Telegram.
5. THE Admin_Panel SHALL display a revenue summary showing total stakes collected, total prizes paid out, and platform commission earned, filterable by date range.

---

### Requirement 15: Admin Panel — Configuration

**User Story:** As an Admin, I want to configure platform settings such as stake amounts, commission rates, and referral rates, so that I can adjust the business model without code changes.

#### Acceptance Criteria

1. THE Admin_Panel SHALL allow an Admin to add, edit, or remove available Stake amounts.
2. THE Admin_Panel SHALL allow an Admin to set the platform commission percentage deducted from each Game_Round's prize pool.
3. THE Admin_Panel SHALL allow an Admin to set the referral commission rate paid to referring Players.
4. WHEN a configuration change is saved, THE Beteseb_Bingo SHALL apply the new settings to all subsequently created Game_Rounds without affecting active Game_Rounds.
5. THE Admin_Panel SHALL require Admin authentication (username and password with bcrypt hashing) to access any admin functionality.
6. WHERE an Admin account has a "super admin" role, THE Admin_Panel SHALL allow that Admin to create, edit, and deactivate other Admin accounts.

---

### Requirement 16: Number Calling Engine

**User Story:** As a Player, I want numbers to be called at a consistent, fair pace, so that all players have equal opportunity to mark their cards.

#### Acceptance Criteria

1. THE Beteseb_Bingo SHALL call numbers from the range 1–75 in a pseudorandom sequence with no repetition within a single Game_Round.
2. THE Beteseb_Bingo SHALL call a new number at a fixed interval configured by Admin (default: 5 seconds between calls).
3. WHEN all 75 numbers have been called without a winner, THE Beteseb_Bingo SHALL end the Game_Round, refund all Stake amounts, and log the round as void.
4. THE Beteseb_Bingo SHALL persist the complete sequence of Called_Numbers for each Game_Round for win validation and audit purposes.

