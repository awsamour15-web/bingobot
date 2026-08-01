# Shared Active Game Bugfix Design

## Overview

Different users see different active game IDs because `GET /api/rounds` returns all `pending`
and `active` rounds without filtering to one per stake level. During the scheduler's transition
window — when one round has just started and a new `pending` round has been created — the API
temporarily exposes two rounds for the same stake. Each client then independently resolves one
of them, so users diverge into different games.

The fix moves the "pick one canonical round per stake" logic from every client into the server.
`GET /api/rounds` will return at most one round per stake level (preferring `active` over
`pending`, and breaking ties by earliest `start_time`). All clients will always receive the
same single authoritative round ID per stake.

## Glossary

- **Bug_Condition (C)**: The state in which the database holds more than one `pending` or `active`
  round for the same stake level at the moment `GET /api/rounds` is served, causing the raw response
  to contain duplicates per stake.
- **Property (P)**: The desired behavior — the API response contains at most one round per stake
  level, so every client resolves to the same round ID.
- **Preservation**: All existing behavior that must remain unchanged: lobby joining, active-game
  watching, scheduler round creation, automatic navigation to the next round after a game ends.
- **getRounds (route)**: `GET /api/rounds` in `apps/backend/src/routes/rounds.router.ts` — returns
  the list of joinable/watchable rounds to the mini-app.
- **RoundScheduler**: The service in `apps/backend/src/services/round-scheduler.service.ts` that
  maintains one `pending` round per stake at all times. It already voids duplicate `pending`
  rounds, but there is a narrow window between creating a new pending round and the next scheduler
  tick where the API can return two rounds for the same stake.
- **GameScreen**: `apps/mini-app/src/screens/GameScreen.tsx` — the client component that calls
  `getRounds()` and currently contains the client-side deduplication logic.
- **LiveGameScreen**: `apps/mini-app/src/screens/LiveGameScreen.tsx` — calls `getRounds()` after
  a game ends to find the next round; relies on at most one result per stake.
- **stake**: The bet amount in Birr (10, 20, or 50) used to identify a round group.

## Bug Details

### Bug Condition

The bug manifests when `GET /api/rounds` is called during the scheduler transition window —
the brief period after a new `pending` round is created but before the scheduler's next
`ensureRoundsExist` tick voids any duplicates. The API returns the raw Prisma result, which
may contain both the newly-`active` round and the new `pending` round for the same stake.
Different clients calling at slightly different moments may receive the same multi-round list
but resolve to different entries.

**Formal Specification:**
```
FUNCTION isBugCondition(apiResponse)
  INPUT: apiResponse — array of RoundListItem returned by GET /api/rounds
  OUTPUT: boolean

  stakeGroups ← GROUP apiResponse BY stake

  FOR EACH group IN stakeGroups DO
    IF COUNT(group) > 1 THEN
      RETURN true   // multiple rounds per stake — clients can diverge
    END IF
  END FOR

  RETURN false
END FUNCTION
```

### Examples

- **Transition window**: Stake-10 round #A just transitioned to `active`. The scheduler
  immediately created pending round #B for stake 10. Before the next scheduler tick, user-1
  calls `GET /api/rounds` and sees `[#A active, #B pending]`; their client-side logic picks
  #B (pending beats active in `GameScreen`). User-2 calls a second later after the scheduler
  voids #B; they see only `[#A active]` and are directed to #A. Both users end up in
  different games.

- **Simultaneous opens**: Two users open the lobby at the exact same millisecond while both
  #A (`active`) and #B (`pending`) are in the DB. `GameScreen` prefers `pending`, so both
  users go to #B — but if user-2 arrived 100 ms later after #B was voided, user-2 goes to #A.

- **Edge case — no active round, only pending**: Stake-20 has a single `pending` round.
  `isBugCondition` returns `false` — no divergence is possible. This case must be preserved.

- **Edge case — both active and pending exist simultaneously for a stake**: The server MUST
  return only the `active` round, because that is the canonical in-progress game all users
  should watch.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- A user who selects a `pending` round SHALL still be directed to the cartela selection screen
  and can join before the round starts (requirement 3.1).
- A user who selects an `active` round SHALL still be directed to the live game as a watcher
  (requirement 3.2).
- The scheduler SHALL continue to create and manage rounds independently; the fix must not
  alter scheduler behavior (requirement 3.3).
- After a game ends, `LiveGameScreen` SHALL continue to find the next round for the same stake
  by calling `GET /api/rounds` (requirement 3.4).
- `GET /api/rounds` SHALL continue to return rounds for all configured stake levels (10, 20, 50
  Birr) that have a `pending` or `active` round (requirement 3.5).

**Scope:**
All behavior that does NOT involve the multi-round-per-stake divergence path should be
completely unaffected. This includes:
- The `POST /api/rounds/:id/join` endpoint
- The `GET /api/rounds/:id` and `GET /api/rounds/:id/cartelas` endpoints
- WebSocket events (`NUMBER_CALLED`, `ROUND_WON`, etc.)
- The scheduler's internal deduplication logic

## Hypothesized Root Cause

Based on code inspection, the root cause is:

1. **No server-side deduplication in `GET /api/rounds`**: The route at
   `apps/backend/src/routes/rounds.router.ts` issues a plain `findMany` for all
   `pending | active` rounds and returns every row. It performs no grouping or filtering
   by stake level before sending the response.

2. **Scheduler transition gap**: `RoundScheduler.expireEmptyRounds` auto-starts a round and
   immediately calls `ensureRoundsExist` — but that call is non-blocking (`void RoundScheduler.ensureRoundsExist()`).
   Between the `start()` call and the moment the new pending round is created, the DB briefly
   contains the freshly-`active` round plus whatever was pending before. Then after creation,
   it briefly contains both `active` and `pending` for the same stake — the very window where
   the bug fires.

3. **Client-side deduplication is unreliable**: `GameScreen` does attempt to pick one round per
   stake with a preference for `pending`. But this runs on each client independently, and since
   the preference rules differ from what `LiveGameScreen` does (which prefers `pending` too),
   the results are timing-dependent.

4. **`LiveGameScreen` next-round logic also queries raw rounds**: After a game ends, the
   `go()` function calls `getRounds()` and does its own `find` — if the server still returns
   two rounds it could also pick the wrong one.

## Correctness Properties

Property 1: Bug Condition - API Returns At Most One Round Per Stake

_For any_ call to `GET /api/rounds`, the response SHALL contain at most one round per stake
level. Where both an `active` and a `pending` round exist for the same stake, the response
SHALL include only the `active` round. Where only a `pending` round exists, that round is
returned. This ensures every client resolves to the identical round ID.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-Duplicate Responses Are Unchanged

_For any_ call to `GET /api/rounds` where the bug condition does NOT hold (i.e., at most one
round per stake already exists in the DB), the fixed route SHALL return exactly the same rounds
as the original route, preserving all stake levels, statuses, player counts, and metadata.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, a single targeted change to the route handler
is sufficient. No scheduler changes are needed.

**File**: `apps/backend/src/routes/rounds.router.ts`

**Function**: `GET /` handler

**Specific Changes**:

1. **Add server-side deduplication by stake**: After fetching all `pending | active` rounds,
   group them by stake level. For each stake, keep only one canonical round using this
   priority: `active` > `pending`; within the same status, prefer earliest `start_time`.

2. **Return only the canonical round per stake**: Replace the direct `.map()` over all rows
   with a map over the deduplicated canonical set. The shape of each `RoundListItem` in the
   response stays identical — only the number of items may be reduced.

3. **Pseudocode for the deduplication step**:
```
canonicalByStake ← new Map<number, GameRound>()

FOR EACH round IN rounds (already ordered by start_time ASC) DO
  stake ← Number(round.stake)
  existing ← canonicalByStake.get(stake)

  IF existing is undefined THEN
    canonicalByStake.set(stake, round)
  ELSE
    // active always beats pending
    IF round.status === 'active' AND existing.status !== 'active' THEN
      canonicalByStake.set(stake, round)
    END IF
    // among equal status, keep the earliest start_time (already guaranteed by ORDER BY)
  END IF
END FOR

items ← [...canonicalByStake.values()].map(toRoundListItem)
```

4. **Remove client-side deduplication from `GameScreen`**: The deduplication block in
   `apps/mini-app/src/screens/GameScreen.tsx` (the `byStake` Map logic) should be removed
   or simplified now that the server guarantees at most one round per stake. The client can
   directly render whatever the API returns.

5. **No changes needed elsewhere**: `LiveGameScreen`'s `go()` function already calls
   `getRounds()` and finds the first matching round by stake and status — since the server
   now returns only one per stake, its logic will always find the correct canonical round.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that
demonstrate the bug on the unfixed server code, then verify the fix works and preserves
existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix.
Confirm or refute the root cause analysis.

**Test Plan**: Seed the database (or mock Prisma) with two rounds of the same stake level
(one `active`, one `pending`) and call the route handler. Assert that the response contains
two items for the same stake — confirming the bug fires. Run these tests against the UNFIXED
route to observe the failure.

**Test Cases**:
1. **Active + Pending for same stake**: Insert one `active` round and one `pending` round
   both with `stake = 10`. Call `GET /api/rounds`. Assert `response.filter(r => r.stake === 10).length === 2`.
   (will pass on unfixed code, proving the server returns duplicates)
2. **Two Pending for same stake**: Insert two `pending` rounds with `stake = 20`.
   Assert the response contains both. (demonstrates scheduler gap scenario)
3. **Client divergence simulation**: Given the two-item response from test 1, simulate
   `GameScreen`'s client-side logic on two calls — one before and one after the scheduler
   voids the duplicate — assert different round IDs are resolved. (proves clients diverge)
4. **Edge case — single round per stake**: Insert exactly one round per stake. Assert no
   duplication in the response. (confirms the non-buggy path is still observable)

**Expected Counterexamples**:
- For test 1 and 2: The unfixed route returns multiple rounds per stake in the response array.
- For test 3: Two simulated clients resolve to different round IDs from the same stake list.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed route returns
exactly one round per stake level.

**Pseudocode:**
```
FOR ALL dbStates WHERE isBugCondition(GET /api/rounds response) DO
  response ← GET /api/rounds (fixed route)
  FOR EACH stake IN [10, 20, 50] DO
    stakeRounds ← response.filter(r => r.stake === stake)
    ASSERT stakeRounds.length <= 1
    IF activeRoundExists(stake) AND pendingRoundExists(stake) THEN
      ASSERT stakeRounds[0].status === 'active'
    END IF
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed route
returns the same result as the original route.

**Pseudocode:**
```
FOR ALL dbStates WHERE NOT isBugCondition(GET /api/rounds response) DO
  ASSERT fixedRoute() deepEquals originalRoute()
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random DB states automatically
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that single-round-per-stake scenarios are unaffected

**Test Plan**: Observe that the route returns correct data when only one round per stake
exists (no bug condition), then write property-based tests confirming the fixed route
returns identical data in those states.

**Test Cases**:
1. **Single Pending Preservation**: One `pending` round per stake — verify fixed route
   returns the same `RoundListItem` shape and values as before the fix.
2. **Single Active Preservation**: One `active` round per stake — verify the same.
3. **Mixed Stakes Preservation**: One `pending` stake-10, one `active` stake-20, no stake-50
   round — verify the fixed route returns both and omits stake-50, same as before.
4. **Empty DB Preservation**: No rounds — verify the fixed route returns `[]`.

### Unit Tests

- Test the deduplication logic in isolation: given an array of round rows with duplicates,
  verify the canonical selection returns `active` over `pending`, and earliest `start_time`
  as a tiebreaker.
- Test that a single round per stake passes through unchanged.
- Test the edge case where all three stake levels have both `active` and `pending` rounds;
  verify three items returned, all `active`.
- Test that a stake with only a `pending` round returns that `pending` round.

### Property-Based Tests

- Generate random arrays of round rows (varying stakes, statuses, start_times) and verify
  the fixed route response contains at most one entry per stake level.
- Generate random single-round-per-stake arrays and verify the response is identical to the
  input (preservation property).
- Generate random combinations of `active`/`pending` per stake and verify `active` always
  wins when both are present.

### Integration Tests

- Test the full lobby-to-game flow: two simulated users call `GET /api/rounds` while
  the DB contains both `active` and `pending` for stake 10; verify both users receive the
  same round ID.
- Test that after a round ends and a new `pending` round is created, the next call to
  `GET /api/rounds` returns the new `pending` round (or the `active` one if it flipped
  within the call window).
- Test that `LiveGameScreen`'s next-round navigation correctly resolves to the canonical
  round after the fix.
