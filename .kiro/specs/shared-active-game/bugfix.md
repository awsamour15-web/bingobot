# Bugfix Requirements Document

## Introduction

Different users see different active game IDs and different games in the mini-app. The root cause is that `GameScreen` runs client-side selection logic that independently picks one round per stake level from the list returned by `GET /api/rounds`. Because each client runs this logic at a slightly different moment — and because multiple `pending` or `active` rounds for the same stake level can coexist in the database during the scheduler's transition window — different users end up resolving to different round IDs. All users should always participate in the same single global active round per stake level simultaneously.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN two or more users open the game lobby at the same time THEN the system returns multiple rounds with the same stake and status (`pending` or `active`) from `GET /api/rounds`, allowing each client to resolve a different round ID.

1.2 WHEN a user opens the game lobby while the scheduler is transitioning (one round just started, a new one was created) THEN the system presents both the newly-started `active` round and a freshly-created `pending` round for the same stake, and different clients may resolve to either one.

1.3 WHEN a user navigates to `/rounds/:id/game` or `/rounds/:id/cartela` using a round ID chosen by their local client-side logic THEN the system silently allows each user to watch or join a different round, so users are never guaranteed to share the same live game.

### Expected Behavior (Correct)

2.1 WHEN two or more users query the list of available rounds THEN the system SHALL return exactly one canonical round per stake level — the single authoritative round that all users should join or watch.

2.2 WHEN a user opens the game lobby while the scheduler is transitioning THEN the system SHALL surface only one round per stake level (preferring `active` over a freshly-created `pending` if an active game is already running, or the single `pending` round otherwise), so all clients resolve to the same round ID.

2.3 WHEN a user navigates to the cartela selection or live game screen THEN the system SHALL use the same globally-canonical round ID that every other user sees, ensuring all users participate in the same simultaneous game.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user selects a stake level and the current round for that stake is `pending` with lobby time remaining THEN the system SHALL CONTINUE TO allow the user to pick a cartela and join before the round starts.

3.2 WHEN a user selects a stake level and the current round for that stake is already `active` THEN the system SHALL CONTINUE TO direct the user to that active game as a watcher.

3.3 WHEN a round ends (won, void, or cancelled) and the scheduler creates the next round THEN the system SHALL CONTINUE TO automatically surface the new round for that stake level to all users.

3.4 WHEN a user is already in a live game and the round ends THEN the system SHALL CONTINUE TO automatically navigate the user to the next round after the countdown.

3.5 WHEN `GET /api/rounds` is called THEN the system SHALL CONTINUE TO return rounds for all configured stake levels (10, 20, 50 Birr) that are currently `pending` or `active`.

---

## Bug Condition

```pascal
FUNCTION isBugCondition(request)
  INPUT: request — a call to GET /api/rounds at time T
  OUTPUT: boolean

  rounds ← rounds returned where status IN ('pending', 'active')
  stakeGroups ← group rounds by stake value

  FOR EACH stakeGroup IN stakeGroups DO
    IF COUNT(stakeGroup) > 1 THEN
      RETURN true   // more than one round per stake → clients can diverge
    END IF
  END FOR

  RETURN false
END FUNCTION
```

```pascal
// Property: Fix Checking
FOR ALL requests WHERE isBugCondition(request) DO
  response ← GET /api/rounds
  FOR EACH stake IN [10, 20, 50] DO
    ASSERT COUNT(rounds WHERE stake = stake AND status IN ('pending','active')) <= 1
  END FOR
END FOR
```

```pascal
// Property: Preservation Checking
FOR ALL requests WHERE NOT isBugCondition(request) DO
  ASSERT GET /api/rounds returns the same rounds as before the fix
END FOR
```
