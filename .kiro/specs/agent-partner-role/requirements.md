# Requirements Document

## Introduction

This feature introduces an **Agent/Partner** role to the Fidel Bingo platform. Agents are trusted partners who recruit players via unique Telegram deep-link invitation URLs. Each time a player recruited by an agent makes a deposit, the agent automatically earns a 10% commission on that deposit amount. Agents can monitor their performance through a dedicated dashboard in the Telegram mini-app and are managed by admins through the admin panel.

The feature spans three surfaces:
- **Backend**: new database models, commission logic, and API endpoints
- **Admin panel**: Agent account management (create, view, suspend)
- **Telegram mini-app**: Agent dashboard showing invited players and earnings

---

## Glossary

- **Agent**: A Partner/Agent account type. An agent recruits players and earns commission on player deposits.
- **Agent_Invitation_Link**: A unique Telegram deep-link URL of the format `https://t.me/<bot>?start=agent_<agentId>` generated for each Agent.
- **Commission**: 10% of a player's deposit amount, credited to the agent who invited that player, every time that player deposits.
- **Deposit_Balance**: The wallet balance sourced exclusively from deposits (as opposed to winnings or bonuses). Only the deposit (play) wallet balance is shown on the agent dashboard.
- **Agent_Dashboard**: The screen inside the Telegram mini-app where an Agent views their statistics and earnings.
- **Admin_Panel**: The React-based web admin interface at `apps/admin`.
- **Bot**: The Telegram bot at `apps/backend/src/bot/index.ts`.
- **AgentService**: The backend service responsible for agent commission calculations and statistics.
- **Player**: A registered Telegram user who plays Bingo, potentially invited by an Agent.
- **Commission_Record**: A database record storing the agent commission amount, linked to a specific deposit and agent.

---

## Requirements

### Requirement 1: Agent Account Model

**User Story:** As a super_admin, I want to create Agent accounts in the admin panel, so that I can onboard partners who recruit players.

#### Acceptance Criteria

1. THE System SHALL store Agent accounts with the following fields: unique identifier, Telegram username, unique Agent_Invitation_Link, account status (active/suspended), and creation timestamp.
2. THE System SHALL generate a unique Agent_Invitation_Link for each Agent upon account creation.
3. WHEN an Agent account is created, THE System SHALL store a unique `agent_invite_code` derived from the agent's identifier.
4. THE System SHALL ensure each Agent_Invitation_Link is globally unique across all agents.
5. IF two concurrent agent creation requests would produce the same invite code, THEN THE System SHALL reject one with a conflict error.

---

### Requirement 2: Agent Registration via Telegram Bot

**User Story:** As a prospective Agent, I want to register using a special invitation link sent to me by an admin, so that I am recognized as an Agent in the system.

#### Acceptance Criteria

1. WHEN a user opens the Telegram Bot with a deep-link parameter in the format `agent_<agentId>`, THE Bot SHALL look up the Agent record by `agentId`.
2. WHEN a valid Agent record is found and the user is not yet linked to an Agent account, THE Bot SHALL associate that Telegram user's `telegram_id` with the Agent record.
3. WHEN the Agent account is successfully linked, THE Bot SHALL reply confirming activation and display the agent's unique player invitation link.
4. IF the deep-link `agentId` does not correspond to an existing Agent record, THEN THE Bot SHALL reply with an error message and treat the user as a regular player.
5. IF the Agent account is already linked to a different Telegram user, THEN THE Bot SHALL reply with an error indicating the link has already been used.
6. WHEN an Agent sends `/start` after already being linked, THE Bot SHALL display the Agent_Dashboard link and their player invitation link.

---

### Requirement 3: Player Recruitment via Agent Invitation Link

**User Story:** As an Agent, I want to share my unique player invitation link with potential players, so that new players are attributed to me when they register.

#### Acceptance Criteria

1. THE AgentService SHALL generate a player-facing invitation link per Agent in the format `https://t.me/<bot>?start=ref_agent_<agentId>`.
2. WHEN a new Player registers via a link containing `ref_agent_<agentId>`, THE Bot SHALL record the `agent_id` on that Player's record in the database.
3. WHEN an existing registered Player follows an agent invitation link, THE System SHALL NOT overwrite the existing `agent_id` association on that Player.
4. IF the `agentId` in the invitation link does not correspond to an active Agent, THEN THE Bot SHALL register the player normally without any agent association.
5. THE System SHALL support both agent referral links (`ref_agent_<agentId>`) and existing player referral links (`ref_<telegramId>`) simultaneously without conflict.

---

### Requirement 4: Automatic 10% Commission on Player Deposits

**User Story:** As an Agent, I want to automatically earn 10% of every deposit made by players I invited, so that I am rewarded for recruiting active players.

#### Acceptance Criteria

1. WHEN a Player whose record has an `agent_id` successfully completes a deposit, THE AgentService SHALL calculate a commission equal to 10% of the deposited amount.
2. THE AgentService SHALL create a Commission_Record storing: agent identifier, player identifier, deposit amount, commission amount (10% of deposit), and timestamp.
3. WHEN the commission is calculated, THE AgentService SHALL credit the commission amount to the Agent's commission balance atomically within the same database transaction as the deposit claim.
4. THE System SHALL apply the 10% commission rate to every deposit by a referred player, with no cap on the number of deposits or total commission earned.
5. IF the deposit transaction is rolled back or cancelled, THEN THE AgentService SHALL NOT create a Commission_Record for that deposit.
6. FOR ALL valid deposits by referred players, the sum of all Commission_Records for an agent SHALL equal the sum of (0.10 × deposit amount) across all those deposits (invariant property).

---

### Requirement 5: Agent Dashboard — Statistics

**User Story:** As an Agent, I want to see my recruitment and earnings statistics in the Telegram mini-app dashboard, so that I can track my performance.

#### Acceptance Criteria

1. THE Agent_Dashboard SHALL display the total count of Players the Agent has invited.
2. THE Agent_Dashboard SHALL display the Agent's total commission earned (sum of all Commission_Records for the agent).
3. THE Agent_Dashboard SHALL display commission earned in the current calendar week (Monday 00:00 to Sunday 23:59 in UTC+3).
4. THE Agent_Dashboard SHALL display commission earned on the current calendar day (00:00 to 23:59 in UTC+3).
5. THE Agent_Dashboard SHALL display a table of invited Players showing: player username, player deposit balance (play wallet balance only), per-player total commission earned by the agent, and the date the player joined.
6. THE Agent_Dashboard SHALL display the Agent's own 10% profit per deposit alongside each player row.
7. WHEN an Agent views the dashboard, THE AgentService SHALL return all statistics in a single API response to minimize round-trips.
8. THE Agent_Dashboard SHALL present data in a table with clearly labeled columns and sorted by most-recent activity by default.

---

### Requirement 6: Agent Management in Admin Panel

**User Story:** As a super_admin, I want to manage Agent accounts in the admin panel, so that I can onboard, monitor, and suspend agents.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a dedicated "Agents" page listing all Agent accounts with columns: Telegram username, invitation link, total players invited, total commission earned, account status, and creation date.
2. THE Admin_Panel SHALL provide a form to create a new Agent account by entering a Telegram username; THE System SHALL generate the invitation link automatically.
3. WHEN an Agent is created via the Admin_Panel, THE System SHALL immediately display the generated Agent_Invitation_Link so the admin can share it.
4. THE Admin_Panel SHALL allow a super_admin to suspend an Agent account; WHEN suspended, THE System SHALL NOT credit new commissions to that Agent.
5. THE Admin_Panel SHALL allow a super_admin to restore a suspended Agent account.
6. WHEN a Player linked to a suspended Agent makes a deposit, THE AgentService SHALL skip commission calculation for that deposit.
7. THE Admin_Panel SHALL show each Agent's total commission earned, weekly commission, and daily commission on the agent detail page.

---

### Requirement 7: Agent API Endpoints

**User Story:** As a developer, I want well-defined API endpoints for agent management and statistics, so that the admin panel and mini-app can interact with agent data reliably.

#### Acceptance Criteria

1. THE System SHALL expose `POST /api/admin/agents` to create a new Agent, accepting `{ telegramUsername: string }`, protected by admin JWT authentication.
2. THE System SHALL expose `GET /api/admin/agents` to list all agents with summary stats, protected by admin JWT authentication.
3. THE System SHALL expose `GET /api/admin/agents/:id` to fetch a single agent's full details and statistics, protected by admin JWT authentication.
4. THE System SHALL expose `PATCH /api/admin/agents/:id/suspend` and `PATCH /api/admin/agents/:id/restore` for account status management, protected by admin JWT authentication.
5. THE System SHALL expose `GET /api/agent/dashboard` to return the authenticated agent's statistics, protected by Agent JWT authentication.
6. THE System SHALL expose `GET /api/agent/invite-link` to return the authenticated agent's player invitation link.
7. IF a request to any agent endpoint is made without valid authentication, THEN THE System SHALL return HTTP 401.
8. IF a request to an admin agent endpoint is made with a non-admin token, THEN THE System SHALL return HTTP 403.

---

### Requirement 8: Agent Authentication

**User Story:** As an Agent, I want to authenticate with the backend from the mini-app, so that I can securely access my dashboard data.

#### Acceptance Criteria

1. THE System SHALL issue a signed JWT to an Agent after the Bot links their Telegram account to the Agent record.
2. WHEN the Telegram mini-app launches for an Agent user, THE System SHALL authenticate the agent using the existing Telegram WebApp `initData` mechanism (same as Player authentication).
3. THE System SHALL distinguish Agent sessions from Player sessions so that agent-only endpoints reject Player tokens and vice versa.
4. IF an Agent's account is suspended, THEN THE System SHALL return HTTP 403 on all agent-authenticated endpoints.

---

### Requirement 9: Data Integrity and Commission Accuracy

**User Story:** As a platform operator, I want commission calculations to be accurate and tamper-proof, so that agents are paid exactly what they are owed.

#### Acceptance Criteria

1. THE System SHALL calculate commissions atomically: a deposit credit and its corresponding Commission_Record SHALL be created in the same database transaction.
2. IF the commission credit transaction fails, THEN THE System SHALL roll back the entire deposit claim to ensure no partial state is persisted.
3. FOR ALL agents, the Agent's commission balance SHALL equal the sum of all Commission_Records attributed to that agent (invariant preserved across all operations).
4. THE System SHALL record the exact deposit amount and commission amount in each Commission_Record with decimal precision of 2 places.
5. WHEN the same deposit transaction is claimed twice (duplicate receipt), THE System SHALL NOT create more than one Commission_Record for that deposit.
