# Bugfix Requirements Document

## Introduction

The round scheduler intermittently leaves rounds stuck in `active` status indefinitely. When this happens, the scheduler skips creating new pending rounds for every affected stake level (10, 20, 50 Birr) because it detects a live active round — even though that round's NCE timer has died and the round will never complete on its own. The same root conditions also allow a race between concurrent scheduler ticks to create duplicate pending rounds for the same stake, and allow a round with zero players to be auto-started instead of voided. This blocks all new gameplay until the next successful recovery or a server restart.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an active round's NCE timer exits due to a process restart or an unhandled error AND the scheduler's `recoverStaleActiveRounds` threshold has not yet elapsed THEN the system continues to skip new round creation for that stake level indefinitely.

1.2 WHEN a round transitions from `pending` to `active` with zero player entries (because `expireEmptyRounds` starts it instead of voiding it) THEN the system auto-starts the round, consuming an active slot and blocking new round creation for that stake without any players to play.

1.3 WHEN two concurrent scheduler ticks both reach `ensureRoundsExist` at nearly the same millisecond THEN the system creates two `pending` rounds for the same stake level, later requiring a duplicate-void cleanup pass.

### Expected Behavior (Correct)

2.1 WHEN an active round's NCE timer is no longer running AND the round's `start_time` exceeds the stale threshold THEN the system SHALL resume the NCE for that round, or force-void it if resumption fails, so the active slot is eventually released.

2.2 WHEN a pending round's `start_time` has elapsed AND it has zero player entries THEN the system SHALL void the round immediately without transitioning it to `active` status.

2.3 WHEN `ensureRoundsExist` is about to create a new pending round for a given stake THEN the system SHALL use a database-level unique constraint or a serialized check so that at most one pending round per stake is ever inserted, preventing duplicates without requiring a cleanup pass.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a pending round reaches its `start_time` with one or more player entries THEN the system SHALL CONTINUE TO auto-start the round normally and begin number calling via the NCE.

3.2 WHEN the server restarts with active rounds in the database THEN the system SHALL CONTINUE TO resume NCE for those rounds via `recoverActiveRounds` as it does today.

3.3 WHEN a stake level has no active and no pending round THEN the system SHALL CONTINUE TO create a new pending round scheduled `LEAD_TIME_MS` (60 seconds) in the future.

3.4 WHEN a stake level already has a pending round that has not yet started THEN the system SHALL CONTINUE TO skip creating a duplicate round for that stake.

3.5 WHEN a round completes normally (winner found or all 75 numbers called) THEN the system SHALL CONTINUE TO mark the round `completed` or `void` and trigger `ensureRoundsExist` to replenish the pending slot.
