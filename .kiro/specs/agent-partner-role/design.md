# Design Document: Agent/Partner Role

## Overview

This feature adds an Agent/Partner role to the Fidel Bingo platform. Agents are trusted partners who earn 10% commission on every deposit made by players they recruited. The implementation spans the database layer, backend services, bot, REST API, admin panel, and Telegram mini-app.

---

## Architecture

### High-Level Flow

```
Admin creates Agent → agent_invite_code generated
         ↓
Agent opens Telegram bot with ?start=agent_<agentId>
         ↓
Bot links agent's telegram_id to Agent record
Bot shows agent's player invitation link
         ↓
Agent shares link: https://t.me/<bot>?start=ref_agent_<agentId>
         ↓
New player registers → Player.agent_id = agentId stored
         ↓
Player makes a deposit → PendingDeposit claimed
         ↓
AgentService.creditCommission() called inside same DB transaction
→ AgentCommission record created
→ Agent.commission_balance incremented
         ↓
Agent views dashboard via mini-app → GET /api/agent/dashboard
```

---

## Database Schema Changes

### New Model: `Agent`

```prisma
model Agent {
  id                 String   @id @default(uuid())
  telegram_username  String
  telegram_id        BigInt?  @unique   // set when agent links via bot
  agent_invite_code  String   @unique   // "agent_<id>" used in bot deep-link
  is_active          Boolean  @default(true)
  commission_balance Decimal  @default(0) @db.Decimal(14, 2)
  created_at         DateTime @default(now())

  referred_players AgentCommission[] @relation("AgentCommissions")

  @@map("agents")
}
```

### New Model: `AgentCommission`

```prisma
model AgentCommission {
  id               String   @id @default(uuid())
  agent_id         String
  player_id        String
  deposit_id       String   @unique    // prevents duplicate commission on same deposit
  deposit_amount   Decimal  @db.Decimal(14, 2)
  commission_amount Decimal @db.Decimal(14, 2)
  created_at       DateTime @default(now())

  agent  Agent  @relation("AgentCommissions", fields: [agent_id], references: [id])
  player Player @relation(fields: [player_id], references: [id])

  @@index([agent_id])
  @@index([player_id])
  @@map("agent_commissions")
}
```

### Player Model: New Field

```prisma
// Add to existing Player model
agent_id  String?   // FK to Agent — set on first registration via ref_agent link

agent Agent? @relation(fields: [agent_id], references: [id])
```

### Migration

A single Prisma migration adds:
- `agents` table
- `agent_commissions` table
- `agent_id` column on `players`
- Unique index on `agent_commissions.deposit_id`

---

## JWT & Authentication Design

### Agent JWT Payload

```typescript
interface AgentJwtPayload {
  agentId: string;
  role: 'agent';
}
```

The login flow (`POST /api/auth/login`) is extended: after player upsert, if the player's `telegram_id` matches an `Agent.telegram_id`, the response includes an additional `agentToken` field alongside the regular `token`.

Alternatively (simpler): a dedicated `POST /api/agent/auth/login` endpoint accepts `initData` and returns an agent JWT if the telegram_id maps to an active Agent.

**Chosen approach**: Extend `POST /api/auth/login` to check if the user is also an Agent. If yes, include `agentToken` in the response. The mini-app stores it separately (`agentJwt`) and includes it for agent-only routes.

### Agent Auth Middleware

```typescript
// apps/backend/src/middleware/agent-auth.middleware.ts
export function agentAuthMiddleware(req, res, next) {
  // Reads Bearer token, verifies, checks payload.role === 'agent'
  // Attaches req.agent = { agentId }
  // Returns 401 if missing/invalid, 403 if role mismatch or agent suspended
}
```

---

## Backend Services

### `AgentService` — `apps/backend/src/services/agent.service.ts`

```typescript
export const AgentService = {
  // Create agent account, generate invite code
  createAgent(telegramUsername: string): Promise<Agent>

  // Link telegram_id to Agent record (called from bot)
  linkAgent(agentId: string, telegramId: bigint): Promise<Agent>

  // Credit 10% commission atomically inside a Prisma tx
  creditCommission(
    tx: PrismaTx,
    agentId: string,
    playerId: string,
    depositId: string,
    depositAmount: Decimal
  ): Promise<void>

  // Dashboard statistics
  getDashboardStats(agentId: string): Promise<AgentDashboardStats>

  // List agents (admin)
  listAgents(): Promise<AgentSummary[]>

  // Get single agent detail (admin)
  getAgentDetail(agentId: string): Promise<AgentDetail>

  // Suspend / restore
  setAgentStatus(agentId: string, isActive: boolean): Promise<void>
}
```

### Deposit Claim Integration

In the existing deposit claim handler (bot `/txn` command and any admin deposit-claim route), after crediting the player's play wallet, call:

```typescript
const player = await tx.player.findUnique({ where: { id: playerId }, select: { agent_id: true } });
if (player?.agent_id) {
  const agent = await tx.agent.findUnique({ where: { id: player.agent_id }, select: { is_active: true } });
  if (agent?.is_active) {
    await AgentService.creditCommission(tx, player.agent_id, playerId, depositId, depositAmount);
  }
}
```

This runs inside the existing `prisma.$transaction` so it rolls back atomically on failure.

---

## API Endpoints

### Admin Endpoints (protected by `adminAuthMiddleware`)

| Method | Path | Body / Response |
|--------|------|----------------|
| `POST` | `/api/admin/agents` | `{ telegramUsername }` → `{ agent }` |
| `GET` | `/api/admin/agents` | `→ AgentSummary[]` |
| `GET` | `/api/admin/agents/:id` | `→ AgentDetail` |
| `PATCH` | `/api/admin/agents/:id/suspend` | `→ { ok: true }` |
| `PATCH` | `/api/admin/agents/:id/restore` | `→ { ok: true }` |

### Agent Endpoints (protected by `agentAuthMiddleware`)

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/api/agent/dashboard` | `AgentDashboardStats` |
| `GET` | `/api/agent/invite-link` | `{ playerInviteLink: string }` |

### Auth Extension

`POST /api/auth/login` response extended:
```typescript
{
  token: string;       // player JWT (unchanged)
  playerId: string;
  agentToken?: string; // present only if user is an active Agent
  agentId?: string;
}
```

---

## Response Shapes

### `AgentDashboardStats`

```typescript
interface AgentDashboardStats {
  totalPlayersInvited: number;
  totalCommission: number;
  weeklyCommission: number;   // UTC+3 current week Mon–Sun
  dailyCommission: number;    // UTC+3 today
  players: AgentPlayerRow[];
}

interface AgentPlayerRow {
  playerId: string;
  username: string;
  depositBalance: number;     // play wallet balance
  totalCommissionFromPlayer: number;
  joinedAt: string;           // ISO date
}
```

### `AgentSummary` (admin list)

```typescript
interface AgentSummary {
  id: string;
  telegramUsername: string;
  agentInviteLink: string;
  totalPlayersInvited: number;
  totalCommission: number;
  isActive: boolean;
  createdAt: string;
}
```

---

## Bot Changes

### Extended `/start` Handler

```
/start parameter routing:

1. No parameter       → normal new player flow
2. ref_<telegramId>   → existing player referral (unchanged)
3. ref_agent_<agentId> → new player referred by agent → set Player.agent_id
4. agent_<agentId>    → agent linking flow → link telegram_id to Agent record
```

### Agent Linking Flow (step 4)

```
User opens: t.me/<bot>?start=agent_<agentId>

Bot:
  1. Find Agent where id = agentId
  2. If not found: "Invalid agent link" → normal player flow
  3. If Agent.telegram_id already set (and != this user): "This link is already activated"
  4. If Agent.telegram_id == this user's telegram_id: show agent menu
  5. Otherwise: set Agent.telegram_id = user's telegram_id → confirm activation
               → show player invite link
```

### Agent Already Linked (`/start` with no param for agent user)

When an already-linked agent sends `/start`, show:
- Confirmation message with their player invite link
- Link to mini-app agent dashboard

---

## Mini-App Changes

### New Screen: `AgentDashboardScreen`

Route: `/agent/dashboard`

Displays:
- Summary cards: Total Players, Total Commission, Weekly, Daily
- Table: Username | Deposit Balance | Commission Earned | Join Date
- Player invite link with copy button

### Auth Flow Extension

In `apps/mini-app/src/lib/auth.ts`, after login:
- If response contains `agentToken`, store in `localStorage` as `agentJwt`
- Add `getAgentJwt()` helper
- Add `agentApiRequest()` that sends `agentJwt` as Bearer token

### API Functions (new)

```typescript
// apps/mini-app/src/lib/api.ts additions
export function getAgentDashboard(): Promise<AgentDashboardStats>
export function getAgentInviteLink(): Promise<{ playerInviteLink: string }>
```

### App Routing

In `apps/mini-app/src/App.tsx`, add:
```tsx
<Route path="/agent/dashboard" element={<AgentDashboardScreen />} />
```

Show an "Agent Dashboard" button on the main home screen when `agentJwt` is present in localStorage.

---

## Admin Panel Changes

### New Page: `AgentsPage`

Route: `/agents`

Features:
- Table listing all agents with columns per Req 6.1
- "Create Agent" button → modal with `telegramUsername` input
- On creation: show generated invite link in a success modal
- Per-row: Suspend / Restore toggle + link to detail view

### Agent Detail Modal/Page

Shows: invite link, total commission, weekly, daily, list of referred players.

### Admin API Functions (new)

```typescript
// apps/admin/src/lib/api.ts additions
export function createAgent(telegramUsername: string): Promise<AgentSummary>
export function listAgents(): Promise<AgentSummary[]>
export function getAgentDetail(id: string): Promise<AgentDetail>
export function suspendAgent(id: string): Promise<void>
export function restoreAgent(id: string): Promise<void>
```

### Admin Navigation

Add "Agents" link to `apps/admin/src/components/Layout.tsx` sidebar.

---

## Correctness Properties (PBT)

1. **Commission invariant**: For every agent, `Agent.commission_balance == SUM(AgentCommission.commission_amount WHERE agent_id = agent.id)`.

2. **No duplicate commission**: For every `deposit_id`, there is at most one `AgentCommission` record.

3. **Commission rate accuracy**: For every `AgentCommission` record, `commission_amount == ROUND(deposit_amount * 0.10, 2)`.

4. **Suspended agent skipped**: When `Agent.is_active == false`, no `AgentCommission` is created for subsequent deposits by that agent's referred players.

5. **Atomic rollback**: If commission credit fails, the deposit credit also rolls back — no partial state.

6. **Unique invite code**: `Agent.agent_invite_code` is unique across all agents.

---

## File Change Summary

| File | Change |
|------|--------|
| `apps/backend/prisma/schema.prisma` | Add `Agent`, `AgentCommission` models; add `agent_id` to `Player` |
| `apps/backend/prisma/migrations/...` | New migration SQL |
| `apps/backend/src/services/agent.service.ts` | New `AgentService` |
| `apps/backend/src/middleware/agent-auth.middleware.ts` | New agent JWT middleware |
| `apps/backend/src/routes/agent.router.ts` | New agent-authenticated routes |
| `apps/backend/src/routes/admin/agents.router.ts` | New admin agent routes |
| `apps/backend/src/routes/auth.router.ts` | Extend login response with `agentToken` |
| `apps/backend/src/bot/index.ts` | Extend `/start` handler for agent flows |
| `apps/backend/src/bot/index.ts` | Extend deposit claim to call `AgentService.creditCommission` |
| `apps/mini-app/src/lib/api.ts` | Add agent API functions |
| `apps/mini-app/src/lib/auth.ts` | Store `agentJwt` on login |
| `apps/mini-app/src/screens/AgentDashboardScreen.tsx` | New screen |
| `apps/mini-app/src/App.tsx` | Add agent route |
| `apps/admin/src/lib/api.ts` | Add agent admin API functions |
| `apps/admin/src/pages/AgentsPage.tsx` | New page |
| `apps/admin/src/components/Layout.tsx` | Add Agents nav link |
| `apps/backend/src/__tests__/properties/agent.property.test.ts` | PBT tests |
