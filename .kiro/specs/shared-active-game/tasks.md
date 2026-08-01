# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - API Returns Multiple Rounds Per Stake
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate that `GET /api/rounds` returns more than one round per stake during the scheduler transition window
  - **Test file**: `apps/backend/src/__tests__/properties/shared-active-game.property.test.ts`
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases — one `active` + one `pending` round for the same stake, and two `pending` rounds for the same stake
  - Simulate the route handler's deduplication logic (or call it directly) against an in-memory round array that contains duplicates per stake
  - Assert: `for all [active, pending] pairs with the same stake → deduplicated response contains exactly 1 round for that stake`
  - Assert: the returned round is the `active` one when both `active` and `pending` exist for the same stake
  - Run test on UNFIXED route logic — **EXPECTED OUTCOME**: Test FAILS (proves duplicates are returned)
  - Document counterexamples found (e.g., `stake=10: response=[{id:'A', status:'active'}, {id:'B', status:'pending'}]` — two rounds returned)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Duplicate Round Responses Are Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: when the DB contains exactly one `pending` round per stake, the route returns that single round unchanged
  - Observe: when the DB contains exactly one `active` round per stake, the route returns that single round unchanged
  - Observe: when the DB contains a mix of stakes — some `pending`, some `active`, none duplicated — the route returns all of them
  - Observe: when the DB contains no rounds, the route returns `[]`
  - **Test file**: `apps/backend/src/__tests__/properties/shared-active-game.property.test.ts` (same file as task 1)
  - Write property-based test: for all DB states where `isBugCondition` is false (at most one round per stake), the fixed route returns the same round list as the original route — same IDs, statuses, stakes, player counts, and `start_time` values
  - Use `fast-check` to generate random single-round-per-stake arrays across varying statuses (`pending`/`active`) and stake values (10, 20, 50)
  - Run tests on UNFIXED code — **EXPECTED OUTCOME**: Tests PASS (confirms the baseline non-duplicate behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix: server-side deduplication for `GET /api/rounds` and remove redundant client logic

  - [x] 3.1 Add server-side deduplication to `GET /api/rounds`
    - File: `apps/backend/src/routes/rounds.router.ts`
    - After fetching all `pending | active` rounds (already ordered by `start_time ASC`), iterate and build a `canonicalByStake` map
    - Selection rule: `active` beats `pending`; within the same status, keep earliest `start_time` (already guaranteed by the existing `orderBy`)
    - Replace the direct `.map()` over `rounds` with a `.map()` over `[...canonicalByStake.values()]`
    - The shape of each `RoundListItem` in the response is unchanged — only duplicate rows are eliminated
    - _Bug_Condition: `isBugCondition(apiResponse)` — `stakeGroups.some(g => g.length > 1)` from design_
    - _Expected_Behavior: for each stake in [10, 20, 50], response contains at most 1 round; if both active and pending exist, the active round is returned_
    - _Preservation: single-round-per-stake DB states produce identical response before and after the fix_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Remove client-side deduplication from `GameScreen`
    - File: `apps/mini-app/src/screens/GameScreen.tsx`
    - Delete the `byStake` Map logic (the `for...of data` loop that groups by stake and applies pending-over-active preference)
    - Replace the deduplication block with a direct assignment: `setRounds(data.filter(r => ALLOWED_STAKES.includes(Number(r.stake))))`
    - The server now guarantees at most one round per stake, so client-side deduplication is redundant and misleading
    - _Requirements: 2.3, 3.1, 3.2_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - API Returns At Most One Round Per Stake
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior: for all `[active, pending]` pairs with the same stake, exactly 1 round is returned and it is the `active` one
    - Run bug condition exploration test from step 1 against the FIXED route logic
    - **EXPECTED OUTCOME**: Test PASSES (confirms the deduplication fix is correct)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Duplicate Responses Are Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2 against the FIXED route logic
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions for single-round-per-stake DB states)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run `vitest --run` in `apps/backend`
  - Ensure Property 1 (bug condition) and Property 2 (preservation) both pass
  - Ensure no existing property tests in `apps/backend/src/__tests__/properties/` are broken
  - Ask the user if any questions arise
