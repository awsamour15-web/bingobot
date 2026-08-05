# Requirements Document

## Introduction

When multiple players complete a winning bingo pattern in the same game round, the prize pool (derash) must be divided among all verified winners instead of rewarding only the first claimer. This feature introduces a claim-window mechanism: after the first valid win claim arrives, a short window stays open to collect any simultaneous winners before the round is finalised. The split amount is calculated by dividing the total derash equally among all verified winners, with any indivisible remainder handled by a configurable rounding rule. All three surfaces — backend game logic, mini-app frontend, and admin panel — are affected.

## Glossary

- **Derash**: The total prize pool for a game round, calculated as `entry_count × stake × (1 − commission_pct / 100)`.
- **Win_Claim**: A request submitted by a player asserting that one of their cartelas has a complete bingo line in the current round.
- **Claim_Window**: A fixed-duration period that starts when the first valid Win_Claim is received, during which additional Win_Claims are accepted before prize distribution begins.
- **Split_Amount**: The share of the derash awarded to each verified winner, calculated as `floor(derash / winner_count)`.
- **Remainder**: The indivisible amount left after the equal split (`derash mod winner_count`), in birr fractional units.
- **Winner_Record**: A database record that stores a verified winner's player ID, cartela number, and split amount for a given round.
- **Win_Detection_Service**: The backend service responsible for validating Win_Claims, managing the Claim_Window, and distributing the prize.
- **Game_Round**: A single playable instance of the bingo game, tracked in the `game_rounds` table.
- **Round_Entry**: A record linking a player and a cartela to a Game_Round.
- **WalletService**: The backend service responsible for atomic wallet credit and debit operations.
- **GameScreen**: The mini-app frontend screen that displays live game state to players.
- **AdminPanel**: The React web application used by administrators to monitor and manage rounds.

---

## Requirements

### Requirement 1: Accept Multiple Win Claims During Claim Window

**User Story:** As a player, I want my win claim to be accepted even if another player claimed first in the same round, so that simultaneous wins are treated fairly.

#### Acceptance Criteria

1. WHEN the first valid Win_Claim is received for an active Game_Round, THE Win_Detection_Service SHALL open a Claim_Window of configurable duration (default 5 seconds) for that round.
2. WHILE a Claim_Window is open, THE Win_Detection_Service SHALL accept and validate additional Win_Claims from other players in the same Game_Round.
3. WHILE a Claim_Window is open, THE Win_Detection_Service SHALL reject Win_Claims from players who have already submitted a valid Win_Claim in the same round.
4. WHEN a Claim_Window expires, THE Win_Detection_Service SHALL reject any further Win_Claims for that Game_Round.
5. THE Win_Detection_Service SHALL read the Claim_Window duration from the `claim_window_ms` key in the Config table, falling back to 5000 milliseconds when the key is absent.

---

### Requirement 2: Validate Each Win Claim Independently

**User Story:** As the platform, I want every claim to be verified against the actual called numbers, so that only players with a genuine bingo line receive a prize share.

#### Acceptance Criteria

1. WHEN a Win_Claim is received, THE Win_Detection_Service SHALL verify that the claiming player has a Round_Entry with `is_watching = false` in the Game_Round.
2. WHEN a Win_Claim is received, THE Win_Detection_Service SHALL verify that at least one of the player's cartelas in the round contains a complete bingo line given the numbers called so far.
3. IF a Win_Claim fails validation for any reason, THEN THE Win_Detection_Service SHALL return a rejection response with a machine-readable reason code and SHALL NOT modify any wallet balance.
4. THE Win_Detection_Service SHALL validate each Win_Claim independently, so that rejection of one claim does not affect the validation of other claims within the same Claim_Window.

---

### Requirement 3: Distribute Prize Equally Among All Verified Winners

**User Story:** As a winner, I want to receive my fair share of the prize pool, so that I am rewarded proportionally when multiple players win at the same time.

#### Acceptance Criteria

1. WHEN a Claim_Window expires and at least one verified winner exists, THE Win_Detection_Service SHALL calculate the Split_Amount as `floor(derash / winner_count)` where `winner_count` is the total number of verified winners.
2. WHEN a Claim_Window expires and at least one verified winner exists, THE Win_Detection_Service SHALL credit each verified winner's main wallet with the Split_Amount using transaction type `game_win`.
3. WHEN a Claim_Window expires and the Remainder is greater than zero, THE Win_Detection_Service SHALL credit the Remainder to the verified winner whose player ID is lexicographically smallest, using transaction type `game_win`.
4. THE Win_Detection_Service SHALL use a single database transaction to credit all winners and update the Game_Round status atomically, so that partial prize distributions cannot occur.
5. WHEN prize distribution completes, THE Win_Detection_Service SHALL update the Game_Round status to `completed` and record `ended_at` as the distribution timestamp.

---

### Requirement 4: Persist Multiple Winners Per Round

**User Story:** As the platform, I want each winner in a round to be recorded individually, so that the payout history is accurate and auditable.

#### Acceptance Criteria

1. THE Win_Detection_Service SHALL store a Winner_Record for every verified winner when a Claim_Window closes, including the player ID, cartela number, and the Split_Amount credited.
2. THE Game_Round record SHALL support storing multiple Winner_Records, replacing the existing single `winner_player_id` and `winner_cartela_number` fields with a `round_winners` relation.
3. WHEN exactly one winner exists, THE Win_Detection_Service SHALL behave identically to the legacy single-winner flow in terms of payout, but SHALL still use the new Winner_Record structure.
4. THE Win_Detection_Service SHALL preserve the existing `winner_player_id` field on Game_Round, setting it to the single winner's player ID when there is one winner, and to the lexicographically smallest winner player ID when there are multiple winners, to maintain backward compatibility with existing queries.

---

### Requirement 5: Notify All Winners via Telegram Bot

**User Story:** As a winner, I want to receive a Telegram notification showing my prize share, so that I know immediately what I won.

#### Acceptance Criteria

1. WHEN prize distribution completes for a round with a single winner, THE Win_Detection_Service SHALL send that winner a Telegram notification containing the full derash amount.
2. WHEN prize distribution completes for a round with multiple winners, THE Win_Detection_Service SHALL send each winner a Telegram notification containing their individual Split_Amount and the total number of winners.
3. IF a Telegram notification fails to send, THEN THE Win_Detection_Service SHALL log the error and SHALL NOT affect the prize credit that has already been applied.

---

### Requirement 6: Display Multi-Winner Result on GameScreen

**User Story:** As a player watching the game, I want to see all winners and their prize shares displayed when a round ends, so that the outcome is transparent.

#### Acceptance Criteria

1. WHEN a Game_Round transitions to `completed`, THE GameScreen SHALL display the usernames and prize shares of all winners.
2. WHEN a Game_Round has a single winner, THE GameScreen SHALL display that winner's full prize amount without indicating a split.
3. WHEN a Game_Round has multiple winners, THE GameScreen SHALL display a list of all winners, each with their individual Split_Amount, and a label indicating the prize was shared.
4. THE GameScreen SHALL receive winner information through the existing WebSocket event payload, which SHALL be extended to include an array of winner objects containing `playerId`, `username`, and `amount`.

---

### Requirement 7: Show Multi-Winner Data in Admin Panel

**User Story:** As an admin, I want to see all winners and individual payouts for each round in the Games page, so that I can audit prize distribution.

#### Acceptance Criteria

1. WHEN an admin views the Games page, THE AdminPanel SHALL display a winner column that lists all winners for each completed round.
2. WHEN a completed round has a single winner, THE AdminPanel SHALL display that winner's username and the full derash.
3. WHEN a completed round has multiple winners, THE AdminPanel SHALL display all winner usernames and their individual Split_Amount values.
4. THE AdminPanel SHALL retrieve multi-winner data from the existing games admin API endpoint, which SHALL be extended to include a `winners` array in each round's response object.

---

### Requirement 8: Configurable Claim Window Duration

**User Story:** As an admin, I want to configure how long the platform waits for simultaneous win claims, so that I can tune fairness versus round completion speed.

#### Acceptance Criteria

1. THE AdminPanel Settings page SHALL display a "Claim Window Duration" field showing the current value of the `claim_window_ms` Config key in milliseconds.
2. WHEN an admin submits a valid new value for `claim_window_ms`, THE AdminPanel SHALL persist the value to the Config table via the admin settings API.
3. IF an admin submits a `claim_window_ms` value less than 1000 or greater than 30000, THEN THE AdminPanel SHALL display a validation error and SHALL NOT submit the value to the API.
4. WHEN the `claim_window_ms` Config key is absent or invalid, THE Win_Detection_Service SHALL use 5000 milliseconds as the default Claim_Window duration.

---

### Requirement 9: Prevent Race Conditions During Prize Distribution

**User Story:** As the platform, I want prize distribution to be atomic and race-condition-free, so that no winner is double-paid and no funds are lost.

#### Acceptance Criteria

1. WHEN the Claim_Window timer fires, THE Win_Detection_Service SHALL acquire a row-level lock on the Game_Round record before reading the list of verified winners.
2. WHEN the Win_Detection_Service holds the row-level lock, THE Win_Detection_Service SHALL verify that the Game_Round status is still `active` before proceeding with prize distribution.
3. IF the Game_Round status is not `active` when the lock is acquired, THEN THE Win_Detection_Service SHALL abort prize distribution without modifying any wallet balances.
4. THE Win_Detection_Service SHALL perform all wallet credits and the Game_Round status update inside a single database transaction so that either all credits succeed or none are applied.

---

### Requirement 10: Round-Trip Consistency of Winner Data

**User Story:** As a developer, I want winner data serialized from the database to be recoverable to an equivalent state, so that client-side rendering and audit logging remain accurate.

#### Acceptance Criteria

1. THE Win_Detection_Service SHALL serialize winner data into the WebSocket event payload using a defined JSON schema.
2. FOR ALL completed Game_Rounds, deserializing the winner array from the API response and re-serializing it SHALL produce an equivalent JSON document (round-trip property).
3. THE admin games API SHALL return winner amounts as numeric values, not as Prisma Decimal strings, to ensure consistent serialization across all consumers.
