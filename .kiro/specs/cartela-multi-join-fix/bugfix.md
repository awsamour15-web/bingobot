# Bugfix Requirements Document

## Introduction

Players can select up to 2 cartelas when joining a game round (`MAX_SELECT = 2`), but the system currently only allows the first cartela to be registered. After the first cartela is confirmed with the server, the second selection is silently blocked — the player ends up participating in the game with only one cartela even though they intended to join with two.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a player selects a first cartela and it is successfully registered THEN the system blocks any further cartela selections from being registered with the server
1.2 WHEN a player selects a second cartela after the first is already registered THEN the system does not call the join API for the second cartela, leaving it unconfirmed

### Expected Behavior (Correct)

2.1 WHEN a player selects a first cartela and it is successfully registered THEN the system SHALL allow the player to continue selecting and registering additional cartelas up to the MAX_SELECT limit
2.2 WHEN a player selects a second cartela after the first is already registered THEN the system SHALL call the join API for the second cartela and confirm it with the server

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a player has not yet selected any cartela THEN the system SHALL CONTINUE TO display all available cartelas as selectable
3.2 WHEN a player selects a cartela that is already taken by another player THEN the system SHALL CONTINUE TO reject the selection and show an appropriate error
3.3 WHEN a player attempts to select more than MAX_SELECT (2) cartelas THEN the system SHALL CONTINUE TO block additional selections beyond the limit
3.4 WHEN a player has insufficient balance to cover the stake for an additional cartela THEN the system SHALL CONTINUE TO block the selection and show a balance alert
3.5 WHEN a player successfully registers cartelas and the round starts THEN the system SHALL CONTINUE TO navigate to the game screen with all registered cartelas
3.6 WHEN a single cartela is selected and the round is pending THEN the system SHALL CONTINUE TO show a confirm button to register that cartela
