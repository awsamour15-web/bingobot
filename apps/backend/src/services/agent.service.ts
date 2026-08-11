// Agent service — agent account management and commission logic
// Requirements: 1.1–1.4, 2.2, 3.1, 4.1–4.6, 5.1–5.7, 6.1–6.7, 9.1–9.5

import { randomUUID } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../lib/prisma.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentPlayerRow {
  playerId: string;
  username: string;
  depositBalance: number;
  totalCommissionFromPlayer: number;
  joinedAt: string; // ISO date string
}

export interface AgentDashboardStats {
  totalPlayersInvited: number;
  totalCommission: number;
  weeklyCommission: number; // UTC+3 current week Mon–Sun
  dailyCommission: number;  // UTC+3 today
  players: AgentPlayerRow[];
}

export interface AgentSummary {
  id: string;
  telegramUsername: string;
  agentInviteLink: string;
  totalPlayersInvited: number;
  totalCommission: number;
  isActive: boolean;
  createdAt: string;
}

export interface AgentDetail extends AgentSummary {
  players: AgentPlayerRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the agent self-activation deep-link (for linking telegram_id).
 * Format: https://t.me/<BOT_USERNAME>?start=agent_<agentId>
 */
function agentInviteLink(agentId: string): string {
  return `https://t.me/${process.env.BOT_USERNAME}?start=agent_${agentId}`;
}

/**
 * Build the player invitation link (to be shared with recruits).
 * Format: https://t.me/<BOT_USERNAME>?start=ref_agent_<agentId>
 */
export function playerInviteLink(agentId: string): string {
  return `https://t.me/${process.env.BOT_USERNAME}?start=ref_agent_${agentId}`;
}

/**
 * Compute the start (Monday 00:00) and end (Sunday 23:59:59.999) of the
 * current calendar week in UTC+3, expressed as UTC Date objects for DB queries.
 *
 * Strategy: shift "now" forward by +3 h to get the local date, determine
 * Mon/Sun boundaries in that shifted space, then shift back to UTC.
 */
function getUtc3WeekRange(): { weekStart: Date; weekEnd: Date } {
  const OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 in milliseconds
  const nowUtc = Date.now();
  const localMs = nowUtc + OFFSET_MS;
  const localDate = new Date(localMs);

  // Day-of-week in UTC+3 local time (0=Sun, 1=Mon, …, 6=Sat)
  const dow = localDate.getUTCDay();
  // Days since Monday (Monday=0, …, Sunday=6)
  const daysSinceMon = (dow + 6) % 7;

  // Monday 00:00 local
  const monStartLocal = new Date(localMs);
  monStartLocal.setUTCHours(0, 0, 0, 0);
  monStartLocal.setUTCDate(monStartLocal.getUTCDate() - daysSinceMon);

  // Sunday 23:59:59.999 local = Monday + 7 days - 1 ms
  const sunEndLocal = new Date(monStartLocal.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

  // Convert back to UTC
  return {
    weekStart: new Date(monStartLocal.getTime() - OFFSET_MS),
    weekEnd: new Date(sunEndLocal.getTime() - OFFSET_MS),
  };
}

/**
 * Compute the start (00:00) and end (23:59:59.999) of the current calendar
 * day in UTC+3, expressed as UTC Date objects for DB queries.
 */
function getUtc3DayRange(): { dayStart: Date; dayEnd: Date } {
  const OFFSET_MS = 3 * 60 * 60 * 1000;
  const nowUtc = Date.now();
  const localMs = nowUtc + OFFSET_MS;

  const localMidnight = new Date(localMs);
  localMidnight.setUTCHours(0, 0, 0, 0);

  const localEndOfDay = new Date(localMidnight.getTime() + 24 * 60 * 60 * 1000 - 1);

  return {
    dayStart: new Date(localMidnight.getTime() - OFFSET_MS),
    dayEnd: new Date(localEndOfDay.getTime() - OFFSET_MS),
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const AgentService = {
  /**
   * Task 2.1 — Create a new Agent account.
   * Generates a unique agent_invite_code and stores the agent in the DB.
   * Requirements: 1.1, 1.2, 1.3, 1.4
   */
  async createAgent(telegramUsername: string) {
    const id = randomUUID();
    const agentInviteCode = `agent_${id}`;

    const agent = await prisma.agent.create({
      data: {
        id,
        telegram_username: telegramUsername,
        agent_invite_code: agentInviteCode,
      },
    });

    return agent;
  },

  /**
   * Task 2.2 — Link an Agent's Telegram account to their Agent record.
   * Called from the bot when the agent opens their activation deep-link.
   * Requirements: 2.2, 2.3, 2.5
   */
  async linkAgent(agentId: string, telegramId: bigint) {
    const agent = await prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
    });

    // If already linked to a *different* telegram_id, reject
    if (agent.telegram_id !== null && agent.telegram_id !== telegramId) {
      throw new Error('ALREADY_LINKED');
    }

    // Idempotent: if already linked to the same telegram_id, just return
    if (agent.telegram_id === telegramId) {
      return agent;
    }

    const updated = await prisma.agent.update({
      where: { id: agentId },
      data: { telegram_id: telegramId },
    });

    return updated;
  },

  /**
   * Task 2.3 — Credit 10% commission atomically inside a provided Prisma tx.
   * Creates an AgentCommission record and increments the agent's balance.
   * Requirements: 4.1, 4.2, 4.3, 9.1, 9.3, 9.4
   */
  async creditCommission(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    agentId: string,
    playerId: string,
    depositId: string,
    depositAmount: Decimal,
  ): Promise<void> {
    const rate = new Decimal('0.10');
    // ROUND(depositAmount * 0.10, 2)
    const commissionAmount = depositAmount.mul(rate).toDecimalPlaces(2);

    await tx.agentCommission.create({
      data: {
        agent_id: agentId,
        player_id: playerId,
        deposit_id: depositId,
        deposit_amount: depositAmount,
        commission_amount: commissionAmount,
      },
    });

    await tx.agent.update({
      where: { id: agentId },
      data: {
        commission_balance: { increment: commissionAmount },
      },
    });
  },

  /**
   * Task 2.4 — Get dashboard statistics for an agent.
   * Requirements: 5.1–5.7
   */
  async getDashboardStats(agentId: string): Promise<AgentDashboardStats> {
    const { weekStart, weekEnd } = getUtc3WeekRange();
    const { dayStart, dayEnd } = getUtc3DayRange();

    // Count of players invited by this agent
    const totalPlayersInvited = await prisma.player.count({
      where: { agent_id: agentId },
    });

    // Sum of all commission amounts for this agent
    const totalCommissionAgg = await prisma.agentCommission.aggregate({
      where: { agent_id: agentId },
      _sum: { commission_amount: true },
    });

    // Weekly commission (UTC+3 Mon–Sun)
    const weeklyAgg = await prisma.agentCommission.aggregate({
      where: {
        agent_id: agentId,
        created_at: { gte: weekStart, lte: weekEnd },
      },
      _sum: { commission_amount: true },
    });

    // Daily commission (UTC+3 today)
    const dailyAgg = await prisma.agentCommission.aggregate({
      where: {
        agent_id: agentId,
        created_at: { gte: dayStart, lte: dayEnd },
      },
      _sum: { commission_amount: true },
    });

    // Per-player rows: player info + their play wallet balance + commission earned
    const players = await prisma.player.findMany({
      where: { agent_id: agentId },
      include: {
        wallets: {
          where: { type: 'play' },
          select: { balance: true },
        },
        agent_commissions: {
          where: { agent_id: agentId },
          select: { commission_amount: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const playerRows: AgentPlayerRow[] = players.map((p) => {
      const depositBalance = p.wallets[0]?.balance ?? new Decimal(0);
      const totalCommissionFromPlayer = p.agent_commissions.reduce(
        (sum, c) => sum.add(c.commission_amount),
        new Decimal(0),
      );
      return {
        playerId: p.id,
        username: p.username,
        depositBalance: Number(depositBalance),
        totalCommissionFromPlayer: Number(totalCommissionFromPlayer),
        joinedAt: p.created_at.toISOString(),
      };
    });

    return {
      totalPlayersInvited,
      totalCommission: Number(totalCommissionAgg._sum.commission_amount ?? 0),
      weeklyCommission: Number(weeklyAgg._sum.commission_amount ?? 0),
      dailyCommission: Number(dailyAgg._sum.commission_amount ?? 0),
      players: playerRows,
    };
  },

  /**
   * Task 2.5 — List all agents with aggregate stats.
   * Requirements: 6.1
   */
  async listAgents(): Promise<AgentSummary[]> {
    const agents = await prisma.agent.findMany({
      include: {
        _count: { select: { players: true } },
        referred_players: { select: { commission_amount: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return agents.map((a) => {
      const totalCommission = a.referred_players.reduce(
        (sum, c) => sum.add(c.commission_amount),
        new Decimal(0),
      );
      return {
        id: a.id,
        telegramUsername: a.telegram_username,
        agentInviteLink: agentInviteLink(a.id),
        totalPlayersInvited: a._count.players,
        totalCommission: Number(totalCommission),
        isActive: a.is_active,
        createdAt: a.created_at.toISOString(),
      };
    });
  },

  /**
   * Task 2.6 — Get full agent detail including players array.
   * Requirements: 6.7
   */
  async getAgentDetail(agentId: string): Promise<AgentDetail> {
    const agent = await prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
      include: {
        _count: { select: { players: true } },
        referred_players: { select: { commission_amount: true } },
      },
    });

    const totalCommission = agent.referred_players.reduce(
      (sum, c) => sum.add(c.commission_amount),
      new Decimal(0),
    );

    // Fetch players with their play wallet balance and per-player commission
    const players = await prisma.player.findMany({
      where: { agent_id: agentId },
      include: {
        wallets: {
          where: { type: 'play' },
          select: { balance: true },
        },
        agent_commissions: {
          where: { agent_id: agentId },
          select: { commission_amount: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const playerRows: AgentPlayerRow[] = players.map((p) => {
      const depositBalance = p.wallets[0]?.balance ?? new Decimal(0);
      const totalCommissionFromPlayer = p.agent_commissions.reduce(
        (sum, c) => sum.add(c.commission_amount),
        new Decimal(0),
      );
      return {
        playerId: p.id,
        username: p.username,
        depositBalance: Number(depositBalance),
        totalCommissionFromPlayer: Number(totalCommissionFromPlayer),
        joinedAt: p.created_at.toISOString(),
      };
    });

    return {
      id: agent.id,
      telegramUsername: agent.telegram_username,
      agentInviteLink: agentInviteLink(agent.id),
      totalPlayersInvited: agent._count.players,
      totalCommission: Number(totalCommission),
      isActive: agent.is_active,
      createdAt: agent.created_at.toISOString(),
      players: playerRows,
    };
  },

  /**
   * Task 2.7 — Suspend or restore an agent account.
   * Requirements: 6.4, 6.5
   */
  async setAgentStatus(agentId: string, isActive: boolean): Promise<void> {
    await prisma.agent.update({
      where: { id: agentId },
      data: { is_active: isActive },
    });
  },
};
