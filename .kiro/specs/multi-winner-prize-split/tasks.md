# Implementation Plan: Multi-Winner Prize Split

## Overview

Extend the Beteseb Bingo round lifecycle to support multiple simultaneous winners via a
claim-window mechanism. The implementation touches the database schema, backend win-detection
service, WebSocket layer, Telegram notifications, admin API, admin panel UI, and mini-app UI.

## Tasks

- [x] 1. Update Prisma schema with RoundWinner model and relations
  - Add `RoundWinner` model to `apps/backend/prisma/schema.prisma` with fields:
    `id`, `round_id`, `player_id`, `cartela_number`, `split_amount`, `created_at`;
    unique constraint on `(round_id, player_id)`; indexes on `round_id`; map to `round_winners`.
  - Add `round_winners RoundWinner[]` relation field to `GameRound`.
  - Replace `won_rounds GameRound[]` on `Player` with `round_wins RoundWinner[]`.
  - _Requirements: 4.2_

- [x] 2. Create DB migration and seed claim_window_ms config
  - [x] 2.1 Generate and apply Prisma migration
    - Run `prisma migrate dev --name add_round_winners` to create the `round_winners` table.
    - Verify the generated SQL creates the table, unique index, and FK constraints correctly.
    - _Requirements: 4.2_

  - [x] 2.2 Seed claim_window_ms config key
    - Add `{ key: 'claim_window_ms', value: '5000' }` to the `defaults` array in
      `apps/backend/prisma/seed.ts` (upsert, same pattern as existing config rows).
    - _Requirements: 1.5, 8.4_

- [x] 3. Implement WinDetectionService claim-window and multi-winner logic
  - [x] 3.1 Add ClaimWindowState type and in-memory map
    - Define `ClaimWindowState` interface (`timer`, `winners: Map<playerId, { cartelaNumber }>`,
      `closing: boolean`) and `const claimWindows = new Map<string, ClaimWindowState>()` at
      module scope in `apps/backend/src/services/win-detection.service.ts`.
    - _Requirements: 1.1_

  - [x] 3.2 Add getClaimWindowMs helper
    - Implement `async function getClaimWindowMs(): Promise<number>` that reads
      `claim_window_ms` from the Config table via Prisma; falls back to `5000` when absent,
      zero, negative, or non-numeric.
    - _Requirements: 1.5, 8.4_

  - [x] 3.3 Rewrite validateClaim with claim-window branching
    - Update `WinDetectionService.validateClaim` to:
      1. Check `claimWindows` for an existing window on `roundId`.
      2. If window is `closing`: return `{ valid: false, reason: 'CLAIM_WINDOW_CLOSED' }`.
      3. If window is open and player already in `winners`: return `{ valid: false, reason: 'DUPLICATE_CLAIM' }`.
      4. Run the existing validation steps (entry check, round active, cartela, bingo line).
      5. If no window exists and claim is valid: open a new `ClaimWindowState`, set timer to
         call `distributeWinnings` after `await getClaimWindowMs()` ms.
      6. If window is open and claim is valid: add player to `winners` map.
      7. Return `{ valid: true }` for accepted claims (no immediate payout here).
    - Remove the inline `WalletService.credit`, `prisma.gameRound.update`, `ReferralService`,
      and `notifyWin` calls that currently exist in `validateClaim`; all of that moves to
      `distributeWinnings`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

  - [x] 3.4 Write property test for claim-window state machine (Properties 1–4)
    - **Property 1: Claim window opens and accepts concurrent valid claims**
    - **Property 2: Duplicate claims from the same player are rejected**
    - **Property 3: Claims after window expiry are rejected**
    - **Property 4: Claim window duration is driven by config with a 5000 ms fallback**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 8.4**
    - File: `apps/backend/src/__tests__/properties/multi-winner-prize-split.property.test.ts`

  - [x] 3.5 Implement distributeWinnings private function
    - Implement `async function distributeWinnings(roundId, winners)` inside
      `win-detection.service.ts` using a single `prisma.$transaction`:
      1. `SELECT game_rounds WHERE id = roundId FOR UPDATE` via `$queryRaw`.
      2. Assert `status === 'active'`; return silently if not (sets `closing = true` first to
         prevent double-fire).
      3. Compute `splitAmount = Math.floor(derash / winners.size)`.
      4. Compute `remainder = derash % winners.size`.
      5. Find `smallestId = [...winners.keys()].sort()[0]`.
      6. `prisma.roundWinner.createMany` with each winner's `split_amount`
         (smallest ID gets `splitAmount + remainder`).
      7. Credit each winner's main wallet via `WalletService.credit` (type `game_win`) inside
         the same transaction using `tx` — pass the Prisma transaction client.
      8. Call `ReferralService.creditCommission` for each winner.
      9. `UPDATE game_rounds SET status='completed', winner_player_id=smallestId,
         winner_cartela_number=<smallestId's cartela>, ended_at=now()`.
      10. After commit: emit `ROUND_WON` via registered callback, send Telegram notifications,
          call `RoundScheduler.ensureRoundsExist()`, delete `claimWindows` entry.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.4, 9.1, 9.2, 9.3, 9.4_

  - [x] 3.6 Write property tests for prize distribution arithmetic (Properties 5–14)
    - **Property 5: Watching players' claims are rejected**
    - **Property 6: Claims without a winning bingo line are rejected**
    - **Property 7: Invalid claims never modify wallet balances**
    - **Property 8: Independent claim validation within the same window**
    - **Property 9: Split amount calculation correctness**
    - **Property 10: Remainder and winner_player_id go to lexicographically smallest player ID**
    - **Property 11: Round status and ended_at are updated on distribution**
    - **Property 12: Winner records are persisted for every verified winner**
    - **Property 13: Telegram notifications are sent per winner with correct amounts**
    - **Property 14: Distribution is aborted when round is no longer active**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.4, 5.2, 5.3, 9.2, 9.3, 9.4**

- [x] 4. Checkpoint — Ensure all backend service tests pass
  - Run `vitest --run` in `apps/backend` and confirm no failures before continuing.
  - Ask the user if any questions arise about the distribution logic.

- [x] 5. Extend WebSocket ROUND_WON payload
  - [x] 5.1 Update shared RoundWonPayload type
    - In `packages/shared/src/websocket.ts`, replace the current `RoundWonPayload` fields
      (`winnerUsername`, `cartelaNumber`, `derash`) with:
      ```typescript
      winners: Array<{ playerId: string; username: string; cartelaNumber: number; amount: number }>;
      totalDerash: number;
      winnerCount: number;
      ```
    - Rebuild the shared package so the dist types are updated.
    - _Requirements: 6.4, 10.1_

  - [x] 5.2 Register ROUND_WON callback in WinDetectionService
    - Add `setOnRoundWon(cb)` static setter (same pattern as `GameRoundService.setOnRoundVoidEmpty`)
      in `win-detection.service.ts`.
    - Wire it in `apps/backend/src/websocket/index.ts`: call `WinDetectionService.setOnRoundWon`
      with a callback that emits `io.to('round:<roundId>').emit('ROUND_WON', payload)`.
    - Remove the existing inline `io.to(...).emit('ROUND_WON', ...)` block from the `CLAIM_WIN`
      socket handler in `websocket/index.ts`.
    - _Requirements: 6.4_

  - [x] 5.3 Write property test for WebSocket payload round-trip (Property 15)
    - **Property 15: WebSocket winner payload survives a round-trip**
    - **Validates: Requirements 6.4, 10.1, 10.2**

- [x] 6. Update Telegram notifications for multi-winner
  - In `apps/backend/src/bot/notifications.ts`, update `notifyWin` signature to
    `notifyWin(playerId: string, amount: number, totalWinners?: number): Promise<void>`.
  - When `totalWinners && totalWinners > 1`, send:
    > 🏆 You won a shared prize! {totalWinners} players won this round.
    > 💰 Your share: ETB {amount} has been credited to your Main Wallet.
  - When single winner (`totalWinners` is 1 or undefined), keep the existing message text.
  - In `distributeWinnings`, call `notifyWin(playerId, splitAmount, winners.size)` for each winner.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 7. Extend admin rounds API to include winners array
  - [x] 7.1 Update AdminRound shared type
    - Add `winners?: Array<{ playerId: string; username: string; cartelaNumber: number; splitAmount: number }>` 
      to `AdminRound` in `packages/shared/src/api.ts`.
    - _Requirements: 7.4_

  - [x] 7.2 Update GET /api/admin/rounds query and mapping
    - In `apps/backend/src/routes/admin/rounds.admin.router.ts`, add
      `round_winners: { include: { player: { select: { username: true } } } }` to the
      `include` clause.
    - In the `items` map, add:
      ```typescript
      winners: r.round_winners.map(w => ({
        playerId: w.player_id,
        username: w.player.username,
        cartelaNumber: w.cartela_number,
        splitAmount: Number(w.split_amount),
      })),
      ```
    - Apply the same change to the `POST /` single-round response.
    - _Requirements: 7.1, 7.3, 7.4, 10.3_

  - [x] 7.3 Write property tests for admin API winners (Properties 16–17)
    - **Property 16: API winner amounts are numeric, not strings**
    - **Property 17: Admin API includes winners array for completed rounds**
    - **Validates: Requirements 7.1, 7.3, 7.4, 10.3**

- [x] 8. Add claim_window_ms validation in admin config API
  - In `apps/backend/src/routes/admin/config.admin.router.ts`, update the
    `PUT /config/:key` handler to: when `key === 'claim_window_ms'`, parse `value` as an
    integer and return HTTP 400 with `{ error: 'VALIDATION_ERROR' }` if the value is
    less than 1000 or greater than 30000.
  - _Requirements: 8.3_

  - [x] 8.1 Write property test for claim window range validation (Property 18)
    - **Property 18: Claim window validation enforces 1000–30000 ms range**
    - **Validates: Requirements 8.3**

- [x] 9. Update AdminPanel GamesPage to display winners
  - In `apps/admin/src/pages/GamesPage.tsx`, update `RoundsTable`:
    - Add a "Winners" column header in the completed rounds table (when `showActions=false`).
    - In the row rendering, display `r.winners` (from the extended `AdminRound` type):
      - If `winners` is empty or undefined: show "—".
      - If 1 winner: show `{username} — {splitAmount} ETB`.
      - If multiple winners: show a stacked list of `{username} — {splitAmount} ETB` per winner,
        with a small "Split" badge.
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 10. Update AdminPanel SettingsPage claim_window_ms field with validation
  - In `apps/admin/src/pages/SettingsPage.tsx`, within `ConfigSection`, detect the
    `claim_window_ms` key and:
    - Render its input as `type="number"` with `min=1000` and `max=30000`.
    - Add client-side validation in `handleSave`: if `key === 'claim_window_ms'` and the
      parsed integer is outside `[1000, 30000]`, set `feedback` to an error message and
      return without calling `updateConfig`.
    - Display a helper label "1000 – 30000 ms" beneath the input when that key is selected.
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 11. Update Mini-app LiveGameScreen to display multi-winner result
  - In `apps/mini-app/src/screens/LiveGameScreen.tsx`, update the "won" phase overlay:
    - Consume the new `RoundWonPayload` shape (`winners[]`, `totalDerash`, `winnerCount`).
    - When `winnerCount === 1`: show the single winner's username and `amount` (full prize).
    - When `winnerCount > 1`: show a "🏆 Shared Win!" heading, total prize pool, then a list
      of all winners each showing `username` and `amount`.
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 12. Checkpoint — Final validation
  - Run `vitest --run` in `apps/backend`. Ensure all property tests pass.
  - Fix any TypeScript diagnostics in changed files.
  - Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Property tests all go in `apps/backend/src/__tests__/properties/multi-winner-prize-split.property.test.ts`.
- The `distributeWinnings` function must share the same Prisma transaction client for wallet
  credits and round update — do not call `WalletService.credit` with the top-level `prisma`
  client from inside `prisma.$transaction`.
- The `WalletService.credit` signature currently wraps its own `$transaction`; a new
  overload or an inner helper that accepts a Prisma transaction client (`tx`) is needed for
  use inside `distributeWinnings`.
- The existing `Player.won_rounds` relation field is removed from the schema (schema-only;
  the `winner_player_id` column on `game_rounds` is kept for backward compatibility).
