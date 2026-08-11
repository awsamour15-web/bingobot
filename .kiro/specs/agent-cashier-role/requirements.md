# Requirements Document

## Introduction

This feature introduces an **Agent/Cashier** role to the Fidel Bingo system. An agent is a human operator (e.g. a shop owner, kiosk worker, or local representative) who acts as a physical intermediary between players and the platform. Agents can register players, top up player wallets with cash, assist with cartela purchases, and manage payouts on behalf of players in their area. The admin panel gains agent management capabilities, and agents receive a dedicated interface to perform their daily operations.

## Glossary

- **Agent**: A human operator with the `agent` role who serves as a physical cash intermediary for players.
- **Agent_Panel**: The web interface used by agents to perform their daily operations.
- **Admin_Panel**: The existing web interface used by admins and super-admins to manage the platform.
- **Player**: An end-user who participates in bingo game rounds via the Telegram mini-app.
- **Wallet**: A player's balance record, consisting of a `main` wallet (real money) and a `play` wallet (bonus credits).
- **Top-Up**: The act of an agent crediting a player's main wallet with cash collected in person.
- **Commission**: A percentage of each top-up amount credited to the agent's earnings balance.
- **Agent_Wallet**: An internal ledger tracking the agent's accumulated commission earnings.
- **Super_Admin**: An admin with elevated privileges who can create, manage, and deactivate agents.
- **JWT**: JSON Web Token used for stateless authentication.
- **System**: The Fidel Bingo backend (Node.js/Express + Prisma + PostgreSQL).

---

## Requirements

### Requirement 1: Agent Account Management

**User Story:** As a super_admin, I want to create and manage agent accounts, so that I can onboard trusted operators to handle cash transactions in the field.

#### Acceptance Criteria

1. THE System SHALL store agent accounts with fields: id, username, password_hash, phone, is_active, commission_rate (percentage), created_at.
2. WHEN a super_admin submits a valid create-agent request, THE System SHALL create the agent account with a hashed password and return the agent record.
3. IF the requested username already exists, THEN THE System SHALL return an error with code `DUPLICATE_USERNAME`.
4. WHEN a super_admin requests the list of agents, THE System SHALL return all agent records including their current commission balance.
5. WHEN a super_admin deactivates an agent, THE System SHALL set the agent's `is_active` flag to false and reject any subsequent login attempts from that agent.
6. WHEN a super_admin updates an agent's commission rate, THE System SHALL persist the new rate and apply it to all future top-ups performed by that agent.

---

### Requirement 2: Agent Authentication

**User Story:** As an agent, I want to log in with my credentials, so that I can access the Agent Panel and perform operations securely.

#### Acceptance Criteria

1. WHEN an agent submits valid username and password credentials, THE System SHALL issue a signed JWT containing `{ agentId, role: "agent" }` with a 12-hour expiry.
2. IF the submitted credentials are invalid or the agent account does not exist, THEN THE System SHALL return a 401 response with code `INVALID_CREDENTIALS`.
3. IF an agent's `is_active` flag is false, THEN THE System SHALL reject login and return a 403 response with code `AGENT_SUSPENDED`.
4. WHILE an agent holds a valid JWT, THE System SHALL accept it on all agent-protected routes.
5. WHEN an agent JWT expires, THE System SHALL return a 401 response with code `TOKEN_EXPIRED` on any protected request.

---

### Requirement 3: Player Top-Up by Agent

**User Story:** As an agent, I want to top up a player's wallet after collecting cash from them, so that the player can use those funds to join game rounds.

#### Acceptance Criteria

1. WHEN an agent submits a top-up request with a valid player identifier and a positive amount, THE System SHALL credit the player's `main` wallet by the specified amount.
2. WHEN a top-up is processed, THE System SHALL record a `Transaction` of type `agent_top_up` on the player's wallet, with the agent's id stored in the `reference_id` field.
3. WHEN a top-up is processed, THE System SHALL calculate the agent's commission as `amount × commission_rate / 100` and credit it to the Agent_Wallet.
4. IF the player identifier does not match any existing player, THEN THE System SHALL return a 404 response with code `PLAYER_NOT_FOUND`.
5. IF the top-up amount is less than or equal to zero, THEN THE System SHALL return a 400 response with code `INVALID_AMOUNT`.
6. THE System SHALL execute the wallet credit and commission credit within a single atomic database transaction, so that partial states are never persisted.

---

### Requirement 4: Agent Transaction History

**User Story:** As an agent, I want to view my top-up history, so that I can track the transactions I have processed and reconcile my cash.

#### Acceptance Criteria

1. WHEN an agent requests their transaction history, THE System SHALL return a paginated list of all top-ups performed by that agent, ordered by most recent first.
2. THE System SHALL include in each history record: transaction id, player username, amount, commission earned, and timestamp.
3. WHEN an agent requests their summary, THE System SHALL return the total number of top-ups processed and the total commission earned for the current calendar day and all-time.

---

### Requirement 5: Agent Commission Wallet

**User Story:** As an agent, I want to see my commission balance, so that I know how much I have earned.

#### Acceptance Criteria

1. THE System SHALL maintain an `agent_commission_balance` field on each agent record, updated atomically with each top-up.
2. WHEN an agent requests their profile, THE System SHALL return the current commission balance.
3. WHEN a super_admin resets or withdraws an agent's commission balance, THE System SHALL set the balance to zero and create an audit log entry recording the amount withdrawn, the admin id, and the timestamp.

---

### Requirement 6: Player Lookup for Agents

**User Story:** As an agent, I want to look up a player by their Telegram username or phone number, so that I can confirm the correct player before processing a top-up.

#### Acceptance Criteria

1. WHEN an agent submits a lookup request with a Telegram username, THE System SHALL return the matching player's display name, username, and current main wallet balance.
2. WHEN an agent submits a lookup request with a phone number, THE System SHALL return the matching player's display name, username, and current main wallet balance.
3. IF no player matches the lookup query, THEN THE System SHALL return a 404 response with code `PLAYER_NOT_FOUND`.
4. THE System SHALL NOT return the player's full transaction history or sensitive fields (e.g. password data) in the lookup response.

---

### Requirement 7: Agent Panel Interface

**User Story:** As an agent, I want a dedicated web interface, so that I can perform all my operations without needing access to the full admin panel.

#### Acceptance Criteria

1. THE Agent_Panel SHALL provide a login screen accepting username and password.
2. WHEN an agent logs in successfully, THE Agent_Panel SHALL display a dashboard showing the agent's commission balance and today's top-up count.
3. THE Agent_Panel SHALL provide a top-up form where the agent can search for a player and enter an amount.
4. WHEN the agent submits the top-up form, THE Agent_Panel SHALL display a confirmation message showing the player name, amount, and commission earned.
5. THE Agent_Panel SHALL provide a transaction history view listing all top-ups performed by the agent.
6. IF the agent's session token expires, THEN THE Agent_Panel SHALL redirect the agent to the login screen.

---

### Requirement 8: Admin Panel — Agent Management View

**User Story:** As a super_admin, I want to manage agents from the admin panel, so that I can monitor activity and control agent access.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display an "Agents" section visible only to super_admin users.
2. WHEN a super_admin views the Agents section, THE Admin_Panel SHALL list all agents with their username, phone, commission rate, commission balance, and active status.
3. THE Admin_Panel SHALL provide a form to create a new agent with fields: username, password, phone, commission rate.
4. THE Admin_Panel SHALL provide the ability to deactivate or reactivate an agent account.
5. THE Admin_Panel SHALL provide the ability to reset an agent's commission balance to zero.

---

### Requirement 9: Access Control and Route Protection

**User Story:** As a system operator, I want agent routes to be protected so that only authenticated agents can perform agent operations, and agents cannot access admin-only functionality.

#### Acceptance Criteria

1. THE System SHALL protect all `/api/agent/*` routes with a middleware that validates the agent JWT and attaches `{ agentId, role }` to the request context.
2. IF a request to an agent route is missing a valid JWT, THEN THE System SHALL return a 401 response.
3. THE System SHALL reject any agent JWT presented on admin-only routes (`/api/admin/*`) with a 403 response.
4. THE System SHALL reject any admin JWT presented on agent-only routes (`/api/agent/*`) with a 403 response.
5. WHERE the `super_admin` role is required, THE System SHALL reject requests from agents and regular admins with a 403 response.
