# Implementation Plan

- [x] 1. Write bug condition exploration tests (BEFORE implementing fixes)
  - **Property 1: Bug Condition** - Stuck Active / Zero-Player Auto-Start / Duplicate Pending Rounds
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate each bug exists
  - **Scoped PBT Approach**: Scope each property to the concrete failing condition for reproducibility
  - Create `apps/backend/src/__tests__/properties/round-scheduler-stuck-active.property.test.ts`
  - **Bug 2.1 — Stuck Active**: Simulate an active round whose NCE timer is NOT in `nce.activeTimers` and whose `start_time` is older than the stale threshold. Assert that after one `tick()`, `ensureRoundsExist` creates a new pending round for that stake (currently it skips because `activeStakes.has(stake)` is always true for a live active DB row, even without a live timer). Run on UNFIXED code — expect FAILURE.
  - **Bug 2.2 — Zero-Player Auto-Start**: Create a pending round with `start_time` in the past and zero `RoundEntry` rows. Call `expireEmptyRounds()`. Assert the round ends with `status = void`, NOT `status = active`. Run on UNFIXED code — expect FAILURE (current code calls `GameRoundService.start()` instead of voiding).
  - **Bug 2.3 — Duplicate Pending**: Invoke `ensureRoundsExist()` twice concurrently for the same stake with no existing pending round. Assert that exactly one pending round exists afterwards. Run on UNFIXED code — expect FAILURE (two inserts race through the guard).
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fixes)
  - **Property 2: Preservation** - Normal Scheduler Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology — observe UNFIXED code for non-buggy inputs
  - Observe: a pending round with ≥1 player whose `start_time` has elapsed → `expireEmptyRounds()` calls `GameRoundService.start()` → status becomes `active`
  - Observe: a stake level with no active and no pending round → `ensureRoundsExist()` creates exactly one new pending round scheduled ~60 s in the future
  - Observe: a stake level that already has a pending round → `ensureRoundsExist()` does NOT create a second pending round
  - Observe: server start with an active round in DB → `recoverActiveRounds()` calls `nce.start()` for that round
  - Write property-based tests covering these four behaviors across arbitrary combinations of stake levels and player counts
  - Verify all preservation tests PASS on UNFIXED code
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix round-scheduler-stuck-active bugs

  - [x] 3.1 Fix Bug 2.1 — recoverStaleActiveRounds: treat timer-less active rounds as stale immediately
    - In `recoverStaleActiveRounds`, add a secondary check: if a round is `active` AND has no entry in `nce.activeTimers`, treat it as stale regardless of `start_time`
    - Resume NCE for those rounds; if NCE start throws, force-void the round so the active slot is released
    - _Bug_Condition: round.status === 'active' AND !nce.activeTimers.has(round.id)_
    - _Expected_Behavior: NCE resumes (or round is voided), freeing the active slot so ensureRoundsExist can create a new pending round_
    - _Preservation: rounds with a live NCE timer are not disturbed (3.1, 3.2)_
    - _Requirements: 2.1, 3.1, 3.2_

  - [x] 3.2 Fix Bug 2.2 — expireEmptyRounds: void pending rounds that have elapsed with zero players
    - In `expireEmptyRounds`, check `round._count.round_entries === 0` FIRST and void immediately
    - Only call `GameRoundService.start()` when `round_entries > 0`
    - _Bug_Condition: round.status === 'pending' AND round.start_time <= now AND round_entries === 0_
    - _Expected_Behavior: round.status set to 'void'; GameRoundService.start() is never called_
    - _Preservation: pending rounds with ≥1 player still auto-start normally (3.1)_
    - _Requirements: 2.2, 3.1_

  - [x] 3.3 Fix Bug 2.3 — ensureRoundsExist: prevent duplicate pending rounds via serialized insert
    - Wrap the per-stake insert in `ensureRoundsExist` with a `prisma.$transaction` that re-checks for an existing pending round inside the transaction before inserting
    - If a pending row already exists (inserted by a concurrent tick), skip the insert silently
    - Alternatively, add a partial unique index on `game_rounds(stake, status)` WHERE `status = 'pending'` via a migration and catch the unique-constraint violation instead of a re-check
    - _Bug_Condition: two concurrent calls to ensureRoundsExist both see pendingStakes.has(stake) === false and both proceed to insert_
    - _Expected_Behavior: exactly one pending round per stake exists after concurrent calls_
    - _Preservation: single-call behavior creates exactly one pending round per missing stake (3.3, 3.4)_
    - _Requirements: 2.3, 3.3, 3.4_

  - [x] 3.4 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Stuck Active / Zero-Player Auto-Start / Duplicate Pending Rounds
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - Run `apps/backend/src/__tests__/properties/round-scheduler-stuck-active.property.test.ts`
    - **EXPECTED OUTCOME**: All three bug-condition properties PASS (confirms all bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Normal Scheduler Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - **EXPECTED OUTCOME**: All preservation properties PASS (confirms no regressions)
    - Confirm normal round lifecycle, recovery on restart, and single-pending-per-stake behavior are all intact

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full property test suite: `cd apps/backend && npx vitest --run src/__tests__/properties/`
  - All four properties (1×Bug Condition × 3 sub-cases + 1×Preservation × 4 sub-cases) must be green
  - Ensure all tests pass; ask the user if questions arise
