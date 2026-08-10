# Cartela Multi-Join Fix — Bugfix Design

## Overview

Players can select up to 3 cartelas (`MAX_SELECT = 3`) when joining a round, but after the first cartela is registered with the server, the second selection is silently blocked. The guard `if (registeredNumsRef.current.length >= MAX_SELECT) return` in `togglePick` fires prematurely: it compares the number of *already-registered* cartelas against the maximum allowed, but the maximum should only block new picks once all `MAX_SELECT` slots are *fully registered* — not while there is still capacity. The fix is minimal: the guard must permit additional picks while `registeredNums.length < MAX_SELECT`, and the `registerCartelas` helper must reliably register each newly-added cartela.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a player attempts to pick a second cartela after the first is already registered (`registeredNums.length === 1`, `picks.length === 1`, new pick is available and within MAX_SELECT)
- **Property (P)**: The desired behavior when the bug condition holds — `joinRound` is called for the second cartela and it is added to `registeredNums`
- **Preservation**: All existing behaviors for non-buggy inputs (mouse clicks, taken-cartela rejection, MAX_SELECT enforcement, balance checks, navigation) that must remain unchanged
- **togglePick**: The function in `apps/mini-app/src/screens/CartelaScreen.tsx` that handles a player tapping a cartela number on the grid
- **registerCartelas**: The async function in the same file that calls the `joinRound` API and updates `registeredNums` state
- **registeredNumsRef**: A `useRef` mirror of `registeredNums` state, used inside closures to avoid stale reads
- **MAX_SELECT**: Constant `= 3` — the maximum number of cartelas a player may register per round

## Bug Details

### Bug Condition

The bug manifests when a player selects a second cartela after the first has already been confirmed by the server. The `togglePick` function contains a guard that compares `registeredNumsRef.current.length >= MAX_SELECT`. When `registeredNums.length === 1` this evaluates to `false` and should not block — however, the guard is intended to prevent any pick once maximum registration is reached. The actual problem is that the guard correctly evaluates to `false` for the second pick, but a downstream issue in `registerCartelas` causes the second registration attempt to be skipped or aborted (the function takes `allPicks[allPicks.length - 1]` as the new cartela, but if state/ref drift occurs between the pick event and the async call, the wrong cartela or a duplicate check may suppress the API call).

The definitive observable symptom is: after first cartela is registered (`registeredNums = [X]`), picking cartela Y results in `joinRound` never being called for Y.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input — { pickedNum: number, registeredNums: number[], picks: number[], joining: boolean }
  OUTPUT: boolean

  RETURN NOT input.joining
         AND input.pickedNum NOT IN input.registeredNums
         AND input.pickedNum NOT IN input.picks
         AND input.registeredNums.length >= 1
         AND input.registeredNums.length < MAX_SELECT
         AND input.picks.length < MAX_SELECT
         AND isAvailable(input.pickedNum)
END FUNCTION
```

### Examples

- Player picks cartela 42 → registered successfully (`registeredNums = [42]`). Player then picks cartela 107 → **bug**: `joinRound(roundId, 107)` is never called; player enters game with only cartela 42.
- Player picks cartela 1 → registered (`registeredNums = [1]`). Player picks cartela 800 → **bug**: API not called for 800; `registeredNums` stays `[1]`.
- Player picks cartela 5 → registration fails with `CARTELA_TAKEN` → cartela removed from picks; player picks cartela 10 → **no bug**: this is the first registration attempt, works correctly.
- Player has not picked any cartela and picks cartela 50 → **no bug**: first registration flows normally.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Mouse clicks / tap on available cartelas must continue to invoke `togglePick` correctly
- Cartelas already taken by other players must continue to render as disabled and non-selectable
- Selecting more than `MAX_SELECT` (3) cartelas must continue to be blocked by `picks.length >= MAX_SELECT`
- Insufficient balance check must continue to show the balance alert and abort the pick
- After both cartelas are registered the grid must continue to prevent any further selection (`registeredNums.length >= MAX_SELECT`)
- The confirm button for a single pending (unregistered) selection must continue to render and trigger registration
- Navigation to the game screen after round start must continue to work with all registered cartelas

**Scope:**
All inputs that do NOT satisfy `isBugCondition` (i.e., first pick, picks on taken cartelas, picks when at max, balance-insufficient picks) must be completely unaffected by the fix.

## Hypothesized Root Cause

Based on code analysis, the most likely cause is one of the following (the exploratory test phase will confirm):

1. **Stale `picks` closure in `registerCartelas` call-site**: `togglePick` builds `next = [...picksRef.current, num]` and calls `registerCartelas(next)`. Inside `registerCartelas`, `newCartela = allPicks[allPicks.length - 1]`. If `picksRef.current` is one step behind at the moment `togglePick` runs (React batching or async flush), `allPicks` passed in might not include the new number, so `newCartela` resolves to the already-registered first cartela, and `registeredNumsRef.current.includes(newCartela)` returns `true`, causing an early return.

2. **`registeredNumsRef` / `registeredNums` sync race**: `setRegisteredNums` inside the success path manually sets `registeredNumsRef.current = next` inside the updater function. A re-render between the first registration completing and the second pick could cause `registeredNumsRef.current` to contain the first cartela before the state flushes, making the `includes` guard fire on the second call.

3. **`joining` flag timing**: After the first `joinRound` resolves and `setJoining(false)` is called, there is a brief window where the component re-renders. If the player taps fast, `joining === true` still when `togglePick` runs, causing the very first guard `if (joining) return` to abort the second pick silently.

4. **`picks.length >= MAX_SELECT` guard position**: The guard at the bottom of `togglePick` (`if (picks.length >= MAX_SELECT) return`) uses *state* `picks`, not `picksRef.current`. If `picks` state has not yet reflected the first pick at re-render time (stale closure), this could fire incorrectly.

## Correctness Properties

Property 1: Bug Condition — Second Cartela Registration

_For any_ input where `isBugCondition` returns true (player picks a second valid, available cartela when exactly one is already registered), the fixed `togglePick` function SHALL result in `joinRound` being called for the second cartela number, and `registeredNums` SHALL eventually contain both the first and second cartela numbers.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Non-Buggy Input Behavior

_For any_ input where `isBugCondition` returns false (first pick, pick on taken cartela, pick exceeding MAX_SELECT, pick with insufficient balance, pick while joining is in-flight), the fixed `togglePick` and `registerCartelas` functions SHALL produce exactly the same observable behavior as the original code — specifically: API call counts, state transitions, error messages, and disabled-button rendering must be identical.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming root cause #1 or #3 above (confirmed by exploratory tests):

**File**: `apps/mini-app/src/screens/CartelaScreen.tsx`

**Function**: `togglePick` and `registerCartelas`

**Specific Changes**:

1. **Use `picksRef` not `picks` state in MAX_SELECT guard**: Replace `if (picks.length >= MAX_SELECT) return` with `if (picksRef.current.length >= MAX_SELECT) return` so the check reads the latest ref value, not a potentially-stale closure value.

2. **Remove or correct the `registeredNumsRef.current.length >= MAX_SELECT` guard in `togglePick`**: This guard's intent is correct (block picks once all slots are registered) but it is the stated root cause. Ensure it reads `registeredNumsRef.current.length >= MAX_SELECT` using the ref (already does), and verify it cannot fire while `registeredNums.length < MAX_SELECT`. If the ref is found to be ahead of state due to the manual assignment pattern, switch to a single authoritative ref update strategy.

3. **Ensure `registerCartelas` correctly identifies the new cartela**: The function currently takes `allPicks[allPicks.length - 1]` as the new cartela. This is safe only if `allPicks` is always the full array including the new pick. Verify (and add an assertion/guard if needed) that the passed `allPicks` argument always includes the new number.

4. **Guard against double-registration within a single render cycle**: Add a local `pendingRef` or use the existing `registeredNumsRef` to ensure the same cartela number is not submitted twice if `registerCartelas` is called concurrently (e.g., fast double-tap).

5. **Keep `joining` flag scoped to individual registration**: Ensure `setJoining(true/false)` does not suppress a second legitimate pick. If the `joining` guard in `togglePick` is too broad, scope it to only block the cartela currently being registered rather than the entire grid.

## Testing Strategy

### Validation Approach

Two phases: first, run exploratory tests against the *unfixed* code to observe failures and confirm the root cause. Then, after the fix, run fix-checking and preservation-checking tests.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating the bug on unfixed code and confirm which root cause is responsible.

**Test Plan**: Mount `CartelaScreen` with mocked API responses (or test the `togglePick` / `registerCartelas` logic in isolation), simulate registering the first cartela successfully, then simulate picking a second cartela and assert that `joinRound` is called a second time. Run on unfixed code — expect the assertion to fail.

**Test Cases**:
1. **Second-pick API call test**: Register cartela A → success. Pick cartela B. Assert `joinRound` called with `(roundId, B)`. *(will fail on unfixed code)*
2. **Fast double-pick test**: Pick cartela A and immediately pick cartela B before the first API call resolves. Assert both eventually register. *(may fail on unfixed code)*
3. **`joining` flag race test**: Pick cartela A, delay resolution, pick cartela B while `joining === true`. Assert cartela B pick is queued or retried, not silently dropped. *(may fail on unfixed code)*
4. **Ref-state sync test**: After first registration, log `registeredNumsRef.current` vs `registeredNums` state at the moment `togglePick(B)` is called. Assert they are equal. *(diagnoses root cause #2)*

**Expected Counterexamples**:
- `joinRound` called only once despite two picks
- Possible causes: stale `picksRef`, stale `registeredNumsRef`, `joining` flag blocking second pick

### Fix Checking

**Goal**: After applying the fix, verify that for all inputs where `isBugCondition` holds, the second cartela is registered.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  simulate: registerCartela(input.registeredNums[0]) → success
  simulate: togglePick(input.pickedNum)
  result := capturedJoinRoundCalls
  ASSERT joinRound called with (roundId, input.pickedNum)
  ASSERT registeredNums contains both input.registeredNums[0] AND input.pickedNum
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where `isBugCondition` does NOT hold, behavior is identical before and after the fix.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT behavior_original(input) = behavior_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because the input space (cartela numbers 1–800, arbitrary registered/picked sets, balance values) is large and edge cases are easy to miss manually.

**Test Cases**:
1. **Taken-cartela preservation**: For any cartela in the taken set, clicking it must not call `joinRound` — verify identical behavior before and after fix.
2. **MAX_SELECT enforcement preservation**: For any input with `picks.length >= 3`, picking a fourth cartela must still be blocked — property-test over random fourth picks.
3. **Balance alert preservation**: For any input where `balance < stake * (picks.length + 1)`, the balance alert must appear and `joinRound` must not be called.
4. **First-pick preservation**: For any first pick (registeredNums empty), the fix must not change behavior — `joinRound` called once, `registeredNums` updated.

### Unit Tests

- Test `togglePick` with `registeredNums = []`: first pick calls `joinRound` once
- Test `togglePick` with `registeredNums = [X]`: second pick calls `joinRound` with new number
- Test that picking a cartela already in `registeredNums` is a no-op (cannot deselect registered)
- Test `joining === true` blocks a pick
- Test balance check fires when `balance < stake * 3`

### Property-Based Tests

- For any cartela number `n` in `[1, 800]` not in taken set and not in registeredNums, after first registration, picking `n` must invoke `joinRound(roundId, n)` (Property 1)
- For any set of picks and registered cartelas where `registeredNums.length >= MAX_SELECT`, no further `joinRound` calls occur (preservation of MAX_SELECT guard)
- For any taken cartela set, clicking a taken cartela never calls `joinRound` regardless of registration state (preservation)

### Integration Tests

- Full flow: pick cartela A → server confirms → pick cartela B → server confirms → round starts → navigate to game with both cartelas in session
- Partial flow: pick cartela A → confirm via button → round starts → navigate with cartela A only (single-cartela path unchanged)
- Error recovery: pick cartela A → server returns `CARTELA_TAKEN` → A removed from picks → pick cartela B → registers correctly
