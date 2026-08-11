# Implementation Tasks: Agent/Partner Role

## Task List

- [x] 1. Database schema and migration
  - [x] 1.1 Add `Agent` model to `apps/backend/prisma/schema.prisma` with fields: `id`, `telegram_username`, `telegram_id` (unique, nullable), `agent_invite_code` (unique), `is_active`, `commission_balance`, `created_at`
  - [x] 1.2 Add `AgentCommission` model with fields: `id`, `agent_id`, `player_id`, `deposit_id` (unique), `deposit_amount`, `commission_amount`, `created_at`, and relations to `Agent` and `Player`
  - [x] 1.3 Add `agent_id` (nullable FK to `Agent`) field to the `Player` model with index
  - [x] 1.4 Create and apply Prisma migration for all schema changes
  - [x] 1.5 Regenerate Prisma client (`prisma generate`)

- [x] 2. AgentService
  - [x] 2.1 Create `apps/backend/src/services/agent.service.ts` with `createAgent(telegramUsername)` — generates `agent_invite_code` as `"agent_" + uuid`, stores agent, returns agent record
  - [x] 2.2 Implement `linkAgent(agentId, telegramId)` — finds agent by id, validates not already linked to a different telegram_id, sets `telegram_id`, returns updated agent
  - [x] 2.3 Implement `creditCommission(tx, agentId, playerId, depositId, depositAmount)` — creates `AgentCommission` record and increments `Agent.commission_balance` by `ROUND(depositAmount * 0.10, 2)` within the provided Prisma transaction
  - [x] 2.4 Implement `getDashboardStats(agentId)` — returns `AgentDashboardStats` with total players, total/weekly/daily commission (UTC+3), and per-player rows
  - [x] 2.5 Implement `listAgents()` — returns all agents with `totalPlayersInvited` and `totalCommission` computed
  - [x] 2.6 Implement `getAgentDetail(agentId)` — returns full agent stats including per-player breakdown
  - [x] 2.7 Implement `setAgentStatus(agentId, isActive)` — toggles `is_active` flag

- [x] 3. Agent authentication middleware
  - [x] 3.1 Create `apps/backend/src/middleware/agent-auth.middleware.ts` — reads Bearer token, verifies JWT, checks `payload.role === 'agent'`, attaches `req.agent = { agentId }`, returns 401 if invalid, 403 if agent is suspended
  - [x] 3.2 Extend `apps/backend/src/middleware/jwt-auth.middleware.ts` type declarations to also support `req.agent` (or add via separate augmentation in agent middleware)
  - [x] 3.3 Extend `POST /api/auth/login` in `apps/backend/src/routes/auth.router.ts` — after player upsert, check if `telegram_id` matches any `Agent.telegram_id`; if yes, issue a separate `agentToken` JWT with payload `{ agentId, role: 'agent' }` and include `agentToken` and `agentId` in the login response

- [ ] 4. Admin agent API routes
  - [x] 4.1 Create `apps/backend/src/routes/admin/agents.router.ts` with `POST /` calling `AgentService.createAgent`, protected by `adminAuthMiddleware`
  - [x] 4.2 Add `GET /` endpoint listing all agents via `AgentService.listAgents()`
  - [x] 4.3 Add `GET /:id` endpoint returning agent detail via `AgentService.getAgentDetail()`
  - [x] 4.4 Add `PATCH /:id/suspend` and `PATCH /:id/restore` endpoints calling `AgentService.setAgentStatus()`
  - [x] 4.5 Register the admin agents router in `apps/backend/src/index.ts` at `/api/admin/agents`

- [ ] 5. Agent self-service API routes
  - [x] 5.1 Create `apps/backend/src/routes/agent.router.ts` with `GET /dashboard` calling `AgentService.getDashboardStats(req.agent.agentId)`, protected by `agentAuthMiddleware`
  - [x] 5.2 Add `GET /invite-link` endpoint returning the player invite URL `https://t.me/<BOT_USERNAME>?start=ref_agent_<agentId>`
  - [x] 5.3 Register the agent router in `apps/backend/src/index.ts` at `/api/agent`

- [ ] 6. Deposit claim integration (commission trigger)
  - [x] 6.1 In the bot deposit claim handler (`apps/backend/src/bot/index.ts`, `processDepositClaim` or equivalent), inside the existing `prisma.$transaction`, after crediting the player's play wallet: fetch `player.agent_id`, if set fetch `Agent.is_active`, and if active call `AgentService.creditCommission(tx, ...)`
  - [x] 6.2 Ensure any admin-side deposit claim route (`apps/backend/src/routes/admin/deposits.router.ts` or similar) also calls `AgentService.creditCommission` inside its transaction

- [x] 7. Bot: agent registration and player attribution flows
  - [x] 7.1 In `apps/backend/src/bot/index.ts` `/start` handler, add detection for `agent_<agentId>` parameter — call `AgentService.linkAgent(agentId, ctx.from.id)`, reply with activation confirmation and player invite link
  - [x] 7.2 Handle error cases in agent linking: agent not found → treat as normal player; already linked to another user → send conflict message
  - [x] 7.3 Add detection for `ref_agent_<agentId>` parameter in the `/start` new-player upsert path — set `agent_id` on the Player record if agent is active and player has no existing `agent_id`
  - [x] 7.4 When an already-linked agent sends `/start` with no special parameter, detect via `Agent.telegram_id` lookup and respond with their player invite link and mini-app agent dashboard link

- [x] 8. Admin panel: Agents page
  - [x] 8.1 Add agent API functions to `apps/admin/src/lib/api.ts`: `createAgent`, `listAgents`, `getAgentDetail`, `suspendAgent`, `restoreAgent`
  - [x] 8.2 Create `apps/admin/src/pages/AgentsPage.tsx` with a table listing all agents (columns: username, invite link, players invited, total commission, status, created date) and a "Create Agent" button
  - [x] 8.3 Implement the Create Agent modal — text input for `telegramUsername`, POST to API, display the returned `agentInviteLink` in a success dialog for the admin to copy
  - [x] 8.4 Add Suspend / Restore action buttons per row, calling the respective endpoints and refreshing the list
  - [x] 8.5 Add "Agents" nav link to `apps/admin/src/components/Layout.tsx` and register `<AgentsPage />` in the admin router

- [x] 9. Mini-app: agent dashboard screen
  - [x] 9.1 In `apps/mini-app/src/lib/auth.ts`, after successful login, if response contains `agentToken`, store it in `localStorage` as `agentJwt`; add `getAgentJwt()` helper
  - [x] 9.2 Add `getAgentDashboard()` and `getAgentInviteLink()` functions to `apps/mini-app/src/lib/api.ts` using `agentJwt` as Bearer token
  - [x] 9.3 Create `apps/mini-app/src/screens/AgentDashboardScreen.tsx` with summary cards (Total Players, Total Commission, Weekly, Daily) and a players table (Username | Deposit Balance | Commission | Joined)
  - [x] 9.4 Display the player invite link with a copy-to-clipboard button on the dashboard
  - [x] 9.5 Add route `/agent/dashboard` in `apps/mini-app/src/App.tsx` and show an "Agent Dashboard" button on the home screen when `agentJwt` exists in localStorage

- [x] 10. Property-based tests
  - [x] 10.1 Create `apps/backend/src/__tests__/properties/agent.property.test.ts` with a test that asserts the commission invariant: `Agent.commission_balance === SUM(AgentCommission.commission_amount)` across multiple simulated deposits
  - [x] 10.2 Add a property test asserting no duplicate `AgentCommission` record is created for the same `deposit_id` (idempotency guard)
  - [x] 10.3 Add a property test asserting `commission_amount === ROUND(deposit_amount * 0.10, 2)` for all generated commission records
  - [x] 10.4 Add a property test asserting that deposits by players referred to a suspended agent produce zero new `AgentCommission` records
