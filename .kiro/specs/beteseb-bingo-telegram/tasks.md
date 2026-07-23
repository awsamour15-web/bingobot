# Implementation Plan: Beteseb Bingo — Telegram Mini App

## Overview

Incremental implementation of the Beteseb Bingo platform: monorepo scaffold → database → auth → wallet → game engine → WebSocket → bot → frontends → payment → testing → deployment. Each task builds directly on the previous, wiring components together before moving forward.

## Tasks

- [x] 1. Scaffold monorepo and shared types
  - Initialize a pnpm monorepo with workspaces: `apps/backend`, `apps/mini-app`, `apps/admin`, `packages/shared`
  - Configure root `tsconfig.json` and per-workspace TypeScript configs
  - Add ESLint + Prettier config at root
  - In `packages/shared`, define and export all TypeScript types/interfaces mirroring the DB enums: `WalletType`, `TxType`, `GameStatus`, `AdminRole`, and all API payload shapes
  - _Requirements: All_

- [x] 2. Database schema and Prisma setup
  - [x] 2.1 Initialize Prisma in `apps/backend` and configure PostgreSQL datasource
    - Create `prisma/schema.prisma` with all models: `Player`, `Wallet`, `Transaction`, `GameRound`, `RoundEntry`, `CartelaDefinition`, `CalledNumber`, `Admin`, `Config`
    - Define all enum types: `WalletType`, `TxType`, `GameStatus`, `AdminRole`
    - Add all relations, indexes, and unique constraints per the ERD in design.md
    - _Requirements: 1.1, 3.3, 6.2, 13.1, 14.1_

  - [x] 2.2 Seed cartela definitions
    - Write a Prisma seed script (`prisma/seed.ts`) that generates and inserts all 272 `CartelaDefinition` rows following the B-I-N-G-O column ranges (B: 1–15, I: 16–30, N: 31–45, G: 46–60, O: 61–75) with free space at index 12
    - _Requirements: 3.1_

  - [x] 2.3 Seed initial config keys
    - In the same seed script, insert default `Config` rows: `call_interval_ms=5000`, `platform_commission_pct=10`, `referral_commission_pct=2`, `min_players_to_start=2`
    - _Requirements: 15.2, 15.3, 16.2_

  - [x] 2.4 Write property test for cartela grid correctness
    - **Property 3: Available Cartelas Exclude Taken Ones**
    - **Validates: Requirements 3.1, 3.2**
    - Use `fast-check` to generate arbitrary sets of taken cartela numbers and assert the availability list contains none of them
    - _File: `src/__tests__/properties/cartela.property.test.ts`_


- [x] 3. Telegram initData authentication middleware
  - [x] 3.1 Implement `verifyTelegramInitData` utility in `apps/backend/src/lib/telegram-auth.ts`
    - Extract `hash` from `initData`, sort remaining fields, compute HMAC-SHA256 with `HMAC-SHA256("WebAppData", botToken)` as key
    - Perform constant-time comparison of computed hash to extracted hash
    - Validate `auth_date` is within 3600 seconds of current time
    - Return parsed user object on success; throw typed error on failure
    - _Requirements: 1.2, 1.3_

  - [x] 3.2 Write property test for initData authentication soundness
    - **Property 1: initData Authentication Soundness**
    - **Validates: Requirements 1.2, 1.3**
    - Use `fast-check` to generate arbitrary `initData` strings; assert valid signed payloads within 3600s are accepted, and any tampered hash, missing field, or expired `auth_date` is rejected with HTTP 401
    - _File: `src/__tests__/properties/auth.property.test.ts`_

  - [x] 3.3 Implement Express middleware `telegramAuthMiddleware`
    - Call `verifyTelegramInitData`, attach parsed player to `req.telegramUser`
    - Return `401 INVALID_TELEGRAM_AUTH` JSON error on failure
    - Apply rate limiting: 10 req/min per IP on auth endpoint
    - _Requirements: 1.2, 1.3_

  - [x] 3.4 Implement `POST /api/auth/login` — player upsert and JWT issuance
    - Call `verifyTelegramInitData` on request body `initData`
    - Upsert `Player` row keyed by `telegram_id` (create if not exists)
    - Handle optional `start` parameter for referral attribution on first creation
    - Create `main` and `play` `Wallet` rows for new players
    - Return signed JWT containing `playerId`
    - _Requirements: 1.1, 1.2, 9.2_

  - [x] 3.5 Write property test for player upsert idempotency
    - **Property 2: Player Upsert Idempotency**
    - **Validates: Requirements 1.1**
    - Use `fast-check` to call login multiple times with the same `telegram_id` and assert only one `Player` row exists with the same `id`
    - _File: `src/__tests__/properties/auth.property.test.ts`_


- [x] 4. Wallet service with atomic operations
  - [x] 4.1 Implement `WalletService` in `apps/backend/src/services/wallet.service.ts`
    - `debit(playerId, amount, type, referenceId, note?)`: open Postgres transaction, `SELECT ... FOR UPDATE`, check balance ≥ amount, update balance, insert `Transaction` row, commit
    - `credit(playerId, amount, type, referenceId, note?)`: open Postgres transaction, update balance, insert `Transaction` row, commit
    - Throw typed `InsufficientFundsError` when balance is too low
    - _Requirements: 3.3, 3.4, 5.3, 6.2, 6.4_

  - [x] 4.2 Write property test for insufficient balance prevention
    - **Property 5: Insufficient Balance Prevents Any Wallet Debit**
    - **Validates: Requirements 3.4, 6.4**
    - Use `fast-check` to generate arbitrary balance and debit amounts; assert debit where amount > balance is always rejected and balance stays unchanged
    - _File: `src/__tests__/properties/cartela.property.test.ts`_

  - [x] 4.3 Write property test for every wallet mutation producing a transaction record
    - **Property 10: Every Wallet Mutation Produces a Transaction Record**
    - **Validates: Requirements 6.2**
    - Use `fast-check` with arbitrary credit/debit operations and assert a corresponding `Transaction` row exists with correct amount, type, wallet ID
    - _File: `src/__tests__/properties/wallet.property.test.ts`_

  - [x] 4.4 Write property test for Play Wallet withdrawal rejection
    - **Property 11: Play Wallet Cannot Be Withdrawn**
    - **Validates: Requirements 6.6**
    - Use `fast-check` to assert any withdrawal request targeting a play wallet is rejected regardless of balance
    - _File: `src/__tests__/properties/wallet.property.test.ts`_


- [x] 5. Win Detection Service
  - [x] 5.1 Implement `checkWin` pure function in `apps/backend/src/services/win-detection.service.ts`
    - Accept a 25-element cartela grid (flat array, index 12 = free space = always marked) and a `Set<number>` of called numbers
    - Check all 12 winning lines: 5 rows, 5 columns, 2 diagonals
    - Return `{ won: boolean, winningLine?: number[] }`
    - _Requirements: 4.5, 5.1, 5.2_

  - [x] 5.2 Write property test for win detection soundness
    - **Property 6: Win Detection Soundness**
    - **Validates: Requirements 4.5, 5.1, 5.2**
    - Use `fast-check` to generate arbitrary 5×5 cartela grids and arbitrary called-number sets; assert `checkWin` returns `true` iff at least one complete winning line exists in the called set
    - _File: `src/__tests__/properties/win-detection.property.test.ts`_

  - [x] 5.3 Implement `WinDetectionService.validateClaim` in the same file
    - Fetch `RoundEntry` for `(playerId, roundId)`, fetch `CartelaDefinition`, fetch all `CalledNumber` rows for the round ordered by `sequence_index`
    - Call `checkWin` with actual called numbers at claim time
    - If valid: call `WalletService.credit` for Derash, update `GameRound` with winner info and status `completed`, return `valid: true`
    - If invalid: return `valid: false`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.4 Write property test for watching-only player win rejection
    - **Property 7: Win Claim for Watching-Only Player is Rejected**
    - **Validates: Requirements 4.7**
    - Use `fast-check` to generate round entries with `is_watching=true`; assert any `CLAIM_WIN` for those entries is rejected
    - _File: `src/__tests__/properties/win-detection.property.test.ts`_


- [x] 6. Number Calling Engine (NCE)
  - [x] 6.1 Implement `shuffle` using Fisher-Yates in `apps/backend/src/lib/shuffle.ts`
    - Accept an array, return a new shuffled copy without mutating input
    - _Requirements: 16.1_

  - [x] 6.2 Write property test for no duplicate numbers in a round
    - **Property 20: No Duplicate Numbers in a Round**
    - **Validates: Requirements 16.1**
    - Use `fast-check` to run `shuffle([1..75])` many times; assert output has no duplicates, all values in 1–75 range, and length = 75
    - _File: `src/__tests__/properties/nce.property.test.ts`_

  - [x] 6.3 Implement `NumberCallingEngine` class in `apps/backend/src/services/nce.service.ts`
    - `start(roundId)`: read `call_interval_ms` from `Config`, generate shuffled sequence, persist each number to `CalledNumber` table as called, publish to Redis channel `game:{roundId}:number` with `{number, sequenceIndex}`, check for pending win claims after each call
    - Stop after 75 numbers; if no winner, trigger void flow: update `GameRound.status = void`, call `WalletService.credit` (refund) for each `RoundEntry`, publish `round:{roundId}:void` to Redis
    - `stop(roundId)`: cancel the active timer for a round (used by admin cancel)
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 6.4 Write property test for called numbers round-trip persistence
    - **Property 13: Called Numbers Round-Trip Persistence**
    - **Validates: Requirements 8.3, 16.4**
    - Use `fast-check` to simulate a round; assert numbers in DB ordered by `sequence_index` exactly match the broadcast sequence with no gaps or duplicates
    - _File: `src/__tests__/properties/history.property.test.ts`_


- [x] 7. Game round lifecycle service
  - [x] 7.1 Implement `GameRoundService` in `apps/backend/src/services/game-round.service.ts`
    - `create(stake, startTime, maxPlayers)`: insert `GameRound` with `status=pending`, snapshot `commission_pct` from Config at creation time
    - `join(roundId, playerId, cartelaNumber)`: inside a single Postgres transaction — verify round is `pending`, verify cartela is not taken in `RoundEntry`, call `WalletService.debit` for stake, insert `RoundEntry`, update `GameRound.derash`
    - `start(roundId)`: set `status=active`, set `start_time`, kick off `NumberCallingEngine.start(roundId)`
    - `cancel(roundId)`: set `status=cancelled`, stop NCE if active, refund all entries via `WalletService.credit`, publish `round:{roundId}:cancelled` to Redis
    - `autoStartCheck(roundId)`: called after each join; if player count ≥ `min_players_to_start` and start time has passed, call `start()`
    - _Requirements: 3.3, 3.5, 3.6, 13.1, 13.2, 13.3, 15.4_

  - [x] 7.2 Write property test for cartela join atomicity
    - **Property 4: Cartela Join Atomicity — Balance Deduction**
    - **Validates: Requirements 3.3**
    - Use `fast-check` to generate valid join scenarios; assert after successful join, cartela is taken AND balance decreased by exactly stake amount simultaneously
    - _File: `src/__tests__/properties/cartela.property.test.ts`_

  - [x] 7.3 Write property test for cancellation/void refund invariant
    - **Property 17: Cancellation / Void Refund Invariant**
    - **Validates: Requirements 13.3, 16.3**
    - Use `fast-check` to generate rounds with arbitrary player entries; assert after cancel or void every player's balance increases by exactly their stake and a `refund` transaction exists
    - _File: `src/__tests__/properties/wallet.property.test.ts`_

  - [x] 7.4 Write property test for config change isolation
    - **Property 19: Config Change Isolation**
    - **Validates: Requirements 15.4**
    - Use `fast-check` to assert rounds created before a config change retain their original snapshotted `commission_pct`
    - _File: `src/__tests__/properties/admin.property.test.ts`_


- [x] 8. Checkpoint — core services
  - Ensure all Vitest and fast-check tests pass: `vitest --run`
  - Confirm Prisma migrations apply cleanly against a local Postgres instance
  - Ask the user if any questions arise before proceeding.

- [x] 9. WebSocket server (Socket.IO)
  - [x] 9.1 Set up Socket.IO on the same Express HTTP server in `apps/backend/src/websocket/index.ts`
    - Configure CORS to allow Mini App origin
    - On `connection`: validate JWT from `auth.token` handshake param; reject unauthenticated sockets
    - _Requirements: 4.2, 4.5_

  - [x] 9.2 Implement room join and game events
    - Handle `JOIN_ROUND` event: add socket to room `round:{roundId}`, verify player has a `RoundEntry` for that round, emit `PLAYER_JOINED` broadcast to room with updated `playerCount`
    - Subscribe to Redis channels `game:{roundId}:number`, `round:{roundId}:void`, `round:{roundId}:cancelled` and fan-out to Socket.IO room on each message
    - Emit `ROUND_STARTED` to room when NCE starts; emit `NUMBER_CALLED` per number; emit `ROUND_WON` on valid win; emit `ROUND_VOID` on void; emit `ROUND_CANCELLED` on cancel
    - _Requirements: 4.2, 4.3, 4.4, 13.3_

  - [x] 9.3 Handle `CLAIM_WIN` event
    - On `CLAIM_WIN {roundId, cartelaId}`: call `WinDetectionService.validateClaim`
    - If valid: emit `ROUND_WON` to all players in room, trigger bot notification
    - If invalid: emit `WIN_REJECTED` to claimant socket only; apply 5 req/min rate limit per player
    - _Requirements: 5.1, 5.2, 5.3, 5.4_


- [x] 10. REST API — player endpoints
  - [x] 10.1 Implement player profile and round listing endpoints
    - `GET /api/players/me`: return current player profile + main/play wallet balances
    - `GET /api/rounds`: list `pending` rounds with stake, player count, derash, start time
    - `GET /api/rounds/:id`: round detail including called numbers count and entries count
    - `GET /api/rounds/:id/cartelas`: return list of available cartela numbers (exclude taken ones per `RoundEntry`)
    - Apply `telegramAuthMiddleware` to all routes
    - _Requirements: 2.1, 3.1, 3.7, 7.1_

  - [x] 10.2 Implement round join endpoint
    - `POST /api/rounds/:id/join` with body `{cartelaNumber}`: call `GameRoundService.join`, return updated wallet balance and reserved cartela
    - Return `409 CARTELA_TAKEN` if cartela already reserved; `409 ROUND_NOT_JOINABLE` if round not pending; `422 INSUFFICIENT_BALANCE` if funds low; `403` if player suspended
    - _Requirements: 3.2, 3.3, 3.4, 12.3_

  - [x] 10.3 Implement history and wallet transaction endpoints
    - `GET /api/history`: paginated list of player's `RoundEntry` rows joined with `GameRound`, sorted by `ended_at` DESC
    - `GET /api/history/:roundId`: include `CalledNumber` sequence and player's cartela grid
    - `GET /api/wallet/transactions`: paginated `Transaction` list for player's wallets
    - _Requirements: 8.1, 8.2, 8.3, 6.2_

  - [x] 10.4 Implement referral endpoint and phone verification
    - `GET /api/referral/link`: return referral URL (`t.me/{botUsername}?start=ref_{telegramId}`) and stats (referral count, total earnings)
    - `POST /api/players/verify-phone` with body `{phone}`: update `Player.phone` and `phone_verified=true`
    - _Requirements: 1.5, 9.1, 9.4_

  - [x] 10.5 Write property test for game history ordering invariant
    - **Property 12: Game History Ordering Invariant**
    - **Validates: Requirements 8.2**
    - Use `fast-check` to generate arbitrary sets of round entries with random `ended_at` timestamps; assert the history endpoint always returns them sorted descending
    - _File: `src/__tests__/properties/history.property.test.ts`_

  - [x] 10.6 Write property test for referral link uniqueness
    - **Property 14: Referral Link Uniqueness**
    - **Validates: Requirements 9.1**
    - Use `fast-check` to generate arbitrary player sets; assert all generated referral identifiers are distinct
    - _File: `src/__tests__/properties/referral.property.test.ts`_


- [x] 11. Referral system
  - [x] 11.1 Implement `ReferralService` in `apps/backend/src/services/referral.service.ts`
    - `attributeReferral(newPlayerId, referrerId)`: set `Player.referrer_id` on creation (already handled in login upsert in task 3.4)
    - `creditCommission(playerId, roundId)`: after a paid round completes for `playerId`, look up `Player.referrer_id`, read `referral_commission_pct` from Config, call `WalletService.credit` on referrer's main wallet with `type=referral_commission`
    - Call `creditCommission` from `WinDetectionService.validateClaim` and from void/cancel flows (only on paid entries)
    - _Requirements: 9.2, 9.3_

  - [x] 11.2 Write property test for referral commission on round completion
    - **Property 15: Referral Commission Credited on Paid Round Completion**
    - **Validates: Requirements 9.3**
    - Use `fast-check` to generate referred player scenarios; assert referrer balance increases by exactly `stake × referral_commission_pct / 100` and a `referral_commission` transaction exists
    - _File: `src/__tests__/properties/referral.property.test.ts`_


- [x] 12. Admin authentication and REST API — admin endpoints
  - [x] 12.1 Implement admin JWT auth
    - `POST /api/admin/auth/login`: validate username/password against `Admin` table using `bcrypt.compare` (saltRounds=12), issue JWT with `adminId` and `role`, expire in 8 hours
    - Implement `jwtAdminMiddleware`: verify JWT, attach `req.admin`, return `401` on failure
    - Implement role guard middleware for `super_admin`-only routes
    - _Requirements: 15.5_

  - [x] 12.2 Implement admin player management endpoints
    - `GET /api/admin/players`: paginated list with search by username/telegramId/phone; include wallet balances
    - `GET /api/admin/players/:id`: full player detail with transaction history and game history
    - `PATCH /api/admin/players/:id/suspend`: set `is_suspended=true`
    - `PATCH /api/admin/players/:id/restore`: set `is_suspended=false`
    - `POST /api/admin/players/:id/credit`: body `{walletType, amount, note}`; call `WalletService.credit` or `debit` based on sign; require `note`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 14.1_

  - [x] 12.3 Write property test for suspended player round join rejection
    - **Property 16: Suspended Player Cannot Join Rounds**
    - **Validates: Requirements 12.3**
    - Use `fast-check` to generate player entries where `is_suspended=true`; assert all join attempts are rejected regardless of balance or cartela availability
    - _File: `src/__tests__/properties/admin.property.test.ts`_

  - [x] 12.4 Write property test for admin manual adjustment integrity
    - **Property 18: Admin Manual Adjustment Integrity**
    - **Validates: Requirements 14.1**
    - Use `fast-check` to generate arbitrary adjustment amounts; assert target wallet changes by exactly that amount, a transaction record exists with note, and no other wallet is affected
    - _File: `src/__tests__/properties/admin.property.test.ts`_

  - [x] 12.5 Implement admin game management endpoints
    - `GET /api/admin/rounds`: all rounds with status, player count, derash, called numbers count
    - `POST /api/admin/rounds`: create round with `{stake, startTime, maxPlayers}`
    - `POST /api/admin/rounds/:id/start`: force-start via `GameRoundService.start`
    - `DELETE /api/admin/rounds/:id`: cancel via `GameRoundService.cancel`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 12.6 Implement admin financial and config endpoints
    - `GET /api/admin/withdrawals`: list pending withdrawal transactions
    - `POST /api/admin/withdrawals/:id/approve`: trigger payment gateway payout, debit wallet, update transaction status
    - `POST /api/admin/withdrawals/:id/reject`: credit funds back, notify player via bot
    - `GET /api/admin/revenue`: aggregated revenue summary filterable by `startDate`/`endDate`
    - `GET /api/admin/config` + `PUT /api/admin/config/:key`: read/update config rows
    - `GET /api/admin/admins` + `POST /api/admin/admins` + `PATCH /api/admin/admins/:id`: super_admin-only CRUD on `Admin` table
    - _Requirements: 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3, 15.6_


- [x] 13. Derash calculation and prize property tests
  - [x] 13.1 Write property test for Derash calculation invariant
    - **Property 8: Derash Calculation Invariant**
    - **Validates: Requirements 5.5**
    - Use `fast-check` with arbitrary `N`, `S`, and `C` values; assert computed Derash equals `N × S × (1 − C/100)` rounded consistently
    - _File: `src/__tests__/properties/wallet.property.test.ts`_

  - [x] 13.2 Write property test for winner receiving exact Derash amount
    - **Property 9: Winner Receives Exact Derash Amount**
    - **Validates: Requirements 5.3**
    - Use `fast-check` to simulate completed rounds with confirmed winners; assert winner's main wallet balance increases by exactly the round's `derash` value
    - _File: `src/__tests__/properties/wallet.property.test.ts`_

- [x] 14. Checkpoint — backend API complete
  - Run `vitest --run` and confirm all tests pass
  - Verify all 20 property tests are implemented in their respective files
  - Ask the user if any questions arise before proceeding.


- [x] 15. Telegram Bot (grammY)
  - [x] 15.1 Set up grammY bot in `apps/backend/src/bot/index.ts`
    - Initialize bot with `BOT_TOKEN` env var
    - Handle `/start` command: parse optional `ref_<telegramId>` parameter, call `POST /api/auth/login` logic (or import service directly), send Mini App inline keyboard button pointing to Mini App URL
    - _Requirements: 10.4_

  - [x] 15.2 Implement bot notification dispatcher in `apps/backend/src/bot/notifications.ts`
    - `notifyGameStart(playerId, roundId)`: send "Your game is starting in 60s" message with "Open App" inline button
    - `notifyWin(playerId, derash)`: send win confirmation with Derash amount and "Open App" button
    - `notifyTransaction(playerId, txType, amount, newBalance)`: send deposit/withdrawal confirmation
    - `notifyWithdrawalRejected(playerId)`: send rejection notice
    - Export functions; call them from respective service methods (win detection, wallet service, round lifecycle)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_


- [x] 16. Payment gateway integration
  - [x] 16.1 Implement `PaymentService` in `apps/backend/src/services/payment.service.ts`
    - Abstract interface `IPaymentGateway` with `initiateDeposit(playerId, amount)` and `initiatePayout(playerId, amount, phone)` methods
    - Implement `ChapaGateway` and `TelebirrGateway` classes; select active gateway via `PAYMENT_GATEWAY` env var
    - `POST /api/wallet/deposit`: call `PaymentService.initiateDeposit`, return redirect/checkout URL to client; on webhook callback, call `WalletService.credit`
    - `POST /api/wallet/withdraw`: validate amount ≤ main wallet balance, create `pending` transaction, queue for admin approval; block play wallet withdrawals with `422`
    - Apply rate limiting: 3 req/min per player on deposit initiation
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 14.3_


- [x] 17. Player Mini App frontend
  - [x] 17.1 Scaffold Mini App in `apps/mini-app` with Vite + React + TypeScript
    - Initialize Telegram Web App SDK (`@twa-dev/sdk`), call `WebApp.ready()` on mount
    - Set up React Router with bottom navigation layout: 4 tabs (Game, History, Wallet, Profile)
    - Create API client in `src/lib/api.ts` that attaches `Authorization: Bearer <jwt>` header and handles 401 redirects
    - Create Socket.IO client in `src/lib/socket.ts` that connects with JWT auth token
    - _Requirements: 11.1, 11.2_

  - [x] 17.2 Implement Game screen (home + cartela board + live game)
    - Home view: fetch and display available rounds as stake cards; show platform stats (active players, games played); handle "no rounds available" state
    - Cartela board view: fetch `GET /api/rounds/:id/cartelas`; render available/taken grid; show countdown timer, wallet balances, stake; on selection call `POST /api/rounds/:id/join`
    - Live game view: render 5×5 B-I-N-G-O grid with player's cartela; connect to Socket.IO `round:{roundId}` room via `JOIN_ROUND`; handle `NUMBER_CALLED` (mark cell, show latest number prominently); handle `ROUND_WON`, `ROUND_VOID`, `ROUND_CANCELLED`; display game metadata (ID, players, stake, derash, called count); implement auto-mark toggle; implement sound toggle (play audio cue on `NUMBER_CALLED` when enabled); show "Watching Only" mode without claim button; emit `CLAIM_WIN` on bingo detection
    - Support Amharic labels on game UI elements
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1–3.7, 4.1–4.8, 11.3_

  - [x] 17.3 Implement History screen
    - Fetch `GET /api/history` with pagination; render list showing Game ID, date, stake, result, prize
    - Sort entries most-recent-first (server already guarantees order, render as-is)
    - On row tap, fetch `GET /api/history/:roundId`; show called number sequence and player's cartela grid for that round
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 17.4 Implement Wallet screen
    - Fetch and display Main Wallet and Play Wallet balances
    - Show "Verified" phone badge when `phone_verified=true`
    - Transaction history tab: fetch `GET /api/wallet/transactions` paginated; display type, amount, timestamp
    - Deposit button: call `POST /api/wallet/deposit`, redirect to payment URL
    - Withdraw form: validate amount ≤ main balance before submit, call `POST /api/wallet/withdraw`; show error states
    - Phone verification form: call `POST /api/players/verify-phone`
    - _Requirements: 1.5, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 17.5 Implement Profile screen
    - Display Telegram username, avatar (first letter), wallet balances, total games won, total referrals, total referral earnings
    - Referral section: fetch `GET /api/referral/link`, display link and copy button, show stats
    - Sound and notification preference toggles (persisted in `localStorage`)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 9.4_


- [x] 18. Admin Panel frontend
  - [x] 18.1 Scaffold Admin Panel in `apps/admin` with Vite + React + TypeScript
    - Set up React Router with protected routes (redirect to `/login` if no admin JWT)
    - Create API client pointing to `/api/admin/*`; attach `Authorization: Bearer <jwt>` header
    - Implement login page calling `POST /api/admin/auth/login`; store JWT in `localStorage`
    - _Requirements: 15.5_

  - [x] 18.2 Implement player management section
    - Paginated player list table with search bar (username / Telegram ID / phone)
    - Player detail modal/page: full profile, wallet balances, transaction history, game history
    - Suspend / Restore buttons with confirmation dialog
    - Manual credit/debit form with wallet type selector, amount, mandatory note field
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 14.1_

  - [x] 18.3 Implement game management section
    - Create round form: stake, start time, max players
    - Active rounds dashboard: real-time table (poll every 3s) showing ID, status, players, derash, called count
    - Force-start and cancel buttons per round
    - Completed/cancelled rounds log table
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 18.4 Implement financial management section
    - Pending withdrawals list with approve/reject actions
    - Revenue summary with date range filter showing total stakes, prizes paid, commission earned
    - _Requirements: 14.2, 14.3, 14.4, 14.5_

  - [x] 18.5 Implement configuration and admin account management sections
    - Config table: list all keys, inline-edit values, save button per row
    - Admin accounts list (super_admin only): create/edit/deactivate admins with role selector
    - _Requirements: 15.1, 15.2, 15.3, 15.6_

