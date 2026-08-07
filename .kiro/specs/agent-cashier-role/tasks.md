# Tasks: Agent/Cashier Role

## Phase 1: Backend — Data Layer

- [ ] 1.1 Add `agent_top_up` to `TxType` enum in `apps/backend/prisma/schema.prisma`
- [ ] 1.2 Add `Agent`, `AgentTransaction`, and `AgentCommissionAudit` models to Prisma schema
- [ ] 1.3 Add `AgentTransaction` relation to `Player` model in Prisma schema
- [ ] 1.4 Create and run Prisma migration for agent tables
- [ ] 1.5 Add shared types to `@fidel/shared`: `AgentAccount`, `AgentTxRecord`, `AgentSummary`, `PlayerLookupResult`, `TopUpResult`, `CreateAgentRequest`

## Phase 2: Backend — Agent Auth Middleware

- [ ] 2.1 Create `apps/backend/src/middleware/agent-auth.middleware.ts` with `agentAuthMiddleware` that validates agent JWT (`agentId`, `role: "agent"`) and returns 401/403 appropriately
- [ ] 2.2 Update `jwtAdminMiddleware` in `admin-auth.middleware.ts` to reject tokens with `role: "agent"` on admin routes with 403

## Phase 3: Backend — Agent Service

- [ ] 3.1 Create `apps/backend/src/services/agent.service.ts` implementing `AgentService`:
  - `createAgent` (bcrypt hash password, check duplicate username)
  - `listAgents`
  - `deactivateAgent` / `reactivateAgent`
  - `updateCommissionRate`
  - `resetCommissionBalance` (sets to 0, writes `AgentCommissionAudit` record)
  - `login` (bcrypt compare, issue JWT with `{ agentId, role: "agent" }`, 12h expiry)
  - `topUp` (atomic: credit player main wallet + credit agent commission, create `AgentTransaction`, use `TxType.agent_top_up`)
  - `getTransactionHistory` (paginated, ordered desc)
  - `getSummary` (today count/commission + all-time)
  - `lookupPlayer` (by Telegram username or phone, returns safe fields only)

## Phase 4: Backend — Agent Routes

- [ ] 4.1 Create `apps/backend/src/routes/agent/auth.agent.router.ts` — `POST /login`
- [ ] 4.2 Create `apps/backend/src/routes/agent/me.agent.router.ts` — `GET /me`
- [ ] 4.3 Create `apps/backend/src/routes/agent/topup.agent.router.ts` — `POST /topup` and `GET /summary`
- [ ] 4.4 Create `apps/backend/src/routes/agent/transactions.agent.router.ts` — `GET /transactions`
- [ ] 4.5 Create `apps/backend/src/routes/agent/lookup.agent.router.ts` — `GET /players/lookup`
- [ ] 4.6 Create `apps/backend/src/routes/admin/agents.admin.router.ts` — all `/api/admin/agents/*` endpoints (list, create, deactivate, reactivate, update-commission-rate, reset-commission), protected by `requireSuperAdmin`
- [ ] 4.7 Register all new routers in `apps/backend/src/index.ts`, adding CORS origin for `apps/agent`

## Phase 5: Backend — Property-Based Tests

- [ ] 5.1 Create `apps/backend/src/__tests__/properties/agent-topup.property.test.ts`
  - Property 1: Top-up atomicity (simulated failure leaves no partial state)
  - Property 2: Commission calculation accuracy (amount credited = A, commission = A×R/100 rounded)
  - Property 8: Invalid amounts (≤ 0) are rejected with 400 INVALID_AMOUNT
- [ ] 5.2 Create `apps/backend/src/__tests__/properties/agent-commission.property.test.ts`
  - Property 3: Commission balance equals sum of all individual commissions across N top-ups
- [ ] 5.3 Create `apps/backend/src/__tests__/properties/agent-auth.property.test.ts`
  - Property 4: Agent JWT rejected on admin routes (403), admin JWT rejected on agent routes (403)
  - Property 5: Deactivated agent login returns 403 AGENT_SUSPENDED
- [ ] 5.4 Create `apps/backend/src/__tests__/properties/agent-history.property.test.ts`
  - Property 6: History contains exactly all top-ups by the agent, ordered desc, no cross-agent leakage
- [ ] 5.5 Create `apps/backend/src/__tests__/properties/agent-lookup.property.test.ts`
  - Property 7: Lookup response never contains `password_hash`, `transactions`, or `telegram_id`

## Phase 6: Agent Panel App (`apps/agent`)

- [ ] 6.1 Scaffold `apps/agent` — `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- [ ] 6.2 Create `apps/agent/src/lib/api.ts` — `agentApiRequest` helper + typed functions: `agentLogin`, `getAgentMe`, `lookupPlayer`, `submitTopUp`, `getTransactions`, `getSummary`
- [ ] 6.3 Create `apps/agent/src/components/ProtectedRoute.tsx`
- [ ] 6.4 Create `apps/agent/src/components/Layout.tsx` — nav links: Dashboard, Top-Up, History; logout button
- [ ] 6.5 Create `apps/agent/src/pages/LoginPage.tsx`
- [ ] 6.6 Create `apps/agent/src/pages/DashboardPage.tsx` — shows commission balance + today's top-up count
- [ ] 6.7 Create `apps/agent/src/pages/TopUpPage.tsx` — player search input, amount field, submit, confirmation display
- [ ] 6.8 Create `apps/agent/src/pages/HistoryPage.tsx` — paginated top-up list table
- [ ] 6.9 Create `apps/agent/src/main.tsx` — router setup with all routes

## Phase 7: Admin Panel Extension

- [ ] 7.1 Create `apps/admin/src/pages/AgentsPage.tsx` — list agents, create agent form, deactivate/reactivate, reset commission
- [ ] 7.2 Update `apps/admin/src/lib/api.ts` — add agent management API functions: `getAgents`, `createAgent`, `deactivateAgent`, `reactivateAgent`, `updateAgentCommissionRate`, `resetAgentCommission`
- [ ] 7.3 Update `apps/admin/src/components/Layout.tsx` — conditionally render "Agents" nav link when `adminRole === "super_admin"`
- [ ] 7.4 Register `AgentsPage` route in `apps/admin/src/main.tsx` at `/agents`
