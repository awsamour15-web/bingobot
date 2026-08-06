# Cartela Multi-Join Fix — Implementation Tasks

## Tasks

- [x] 1 Exploratory testing — confirm root cause on unfixed code
  - [x] 1.1 Write a unit test that simulates registering the first cartela successfully, then calls `togglePick` for a second cartela, and asserts `joinRound` is called twice (once per cartela). Run against unfixed code and record the failure.
  - [x] 1.2 Write a test that picks two cartelas in rapid succession (before the first API call resolves) and asserts both are eventually registered. Run against unfixed code.
  - [x] 1.3 Log `registeredNumsRef.current` and `registeredNums` state at the moment the second `togglePick` fires to determine which root cause (stale ref, stale state, or `joining` flag) is responsible.

- [x] 2 Fix `togglePick` in `apps/mini-app/src/screens/CartelaScreen.tsx`
  - [x] 2.1 Replace the `picks.length >= MAX_SELECT` guard with `picksRef.current.length >= MAX_SELECT` to avoid stale closure reads.
  - [x] 2.2 Verify the `registeredNumsRef.current.length >= MAX_SELECT` guard is correct — it should only block when all slots are truly full. Confirm the ref is always up-to-date at the point of the check.
  - [x] 2.3 If the `joining` flag is found to be the root cause, narrow its scope so it only blocks re-picking the cartela currently in-flight, not the entire second pick.

- [x] 3 Fix `registerCartelas` if needed
  - [x] 3.1 Confirm that `allPicks[allPicks.length - 1]` reliably resolves to the newly-picked cartela in all cases. Add a defensive check if any ambiguity is found.
  - [x] 3.2 Ensure the `registeredNumsRef.current` manual assignment inside `setRegisteredNums` updater is the single source of truth and cannot lead to a state where the ref is ahead of or behind actual state.

- [x] 4 Fix-checking tests — verify the fix on fixed code
  - [x] 4.1 Re-run the test from task 1.1 against fixed code and confirm it passes (`joinRound` called for both cartelas).
  - [x] 4.2 Write a property-based test: for any available cartela number `n` not yet registered, after one cartela is already registered, `togglePick(n)` must invoke `joinRound(roundId, n)`. Run against fixed code. (Property 1)

- [x] 5 Preservation-checking tests — verify no regressions on fixed code
  - [x] 5.1 Write a property-based test: for any input where `registeredNums.length >= MAX_SELECT`, `togglePick` must not call `joinRound`. (Property 2 — MAX_SELECT guard)
  - [x] 5.2 Test that a taken cartela click never calls `joinRound` regardless of registration state. (Property 2 — taken cartela)
  - [x] 5.3 Test that the balance alert fires and `joinRound` is not called when balance is insufficient for an additional cartela. (Property 2 — balance check)
  - [x] 5.4 Test that the confirm button still renders when `picks.length === 1` and `registered === false`. (Requirement 3.6)
  - [x] 5.5 Integration test: full two-cartela registration flow — both cartelas confirmed, round starts, navigation fires with `selectedRoundId` in session storage.
