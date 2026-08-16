// Promotion service — CRUD, scheduling, delivery, stats, and utilities
import prisma from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library.js';

const MAX_TEXT_LENGTH = 4096;
const MAX_CAPTION_LENGTH = 1024;
const VALID_CONTENT_TYPES = ['text', 'image', 'video', 'gif'] as const;
type PromotionContentType = typeof VALID_CONTENT_TYPES[number];
type PromotionStatus = 'active' | 'inactive';
type PromotionScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

export interface BonusCriteria {
  /** Minimum main-wallet balance required (ETB) */
  minBalance?: number;
  /** Maximum main-wallet balance allowed (ETB) */
  maxBalance?: number;
  /** Minimum total deposited amount (ETB) */
  minDeposits?: number;
  /** Player must have played at least one round */
  hasPlayedRounds?: boolean;
  /** Player account must be at least X days old */
  daysRegistered?: number;
  /** Only players belonging to this agent */
  agentId?: string;
}

export interface CreatePromotionInput {
  title: string;
  content_type: PromotionContentType;
  text_content?: string;
  media_file_id?: string;
  caption?: string;
  bonus_amount?: number;
  bonus_wallet?: 'main' | 'play';
  bonus_criteria?: BonusCriteria;
}

export interface CreateScheduleInput {
  channel_ids: string[];
  frequency: PromotionScheduleFrequency;
  send_at: Date;
}

export interface LogDeliveryInput {
  promotion_id: string;
  schedule_id?: string;
  channel_id: string;
  status: 'sent' | 'failed';
  error_message?: string;
}

export interface PromotionStats {
  total_sent: number;
  total_failed: number;
  unique_channels: number;
  last_sent_at: Date | null;
}

export const PromotionService = {
  async create(data: CreatePromotionInput) {
    if (!VALID_CONTENT_TYPES.includes(data.content_type)) {
      throw new Error(`Unsupported content type: ${data.content_type}`);
    }
    if (data.content_type === 'text') {
      if (!data.text_content) throw new Error('text_content is required for text promotions');
      if (data.text_content.length > MAX_TEXT_LENGTH) {
        throw new Error(`text_content exceeds ${MAX_TEXT_LENGTH} characters`);
      }
    } else {
      if (!data.media_file_id) throw new Error('media_file_id is required for media promotions');
      if (data.caption && data.caption.length > MAX_CAPTION_LENGTH) {
        throw new Error(`caption exceeds ${MAX_CAPTION_LENGTH} characters`);
      }
    }
    return prisma.promotion.create({
      data: {
        title: data.title,
        content_type: data.content_type,
        ...(data.text_content !== undefined ? { text_content: data.text_content ?? null } : {}),
        ...(data.media_file_id !== undefined ? { media_file_id: data.media_file_id ?? null } : {}),
        ...(data.caption !== undefined ? { caption: data.caption ?? null } : {}),
        ...(data.bonus_amount != null ? { bonus_amount: new Decimal(data.bonus_amount) } : {}),
        ...(data.bonus_wallet !== undefined ? { bonus_wallet: data.bonus_wallet } : {}),
        ...(data.bonus_criteria !== undefined ? { bonus_criteria: data.bonus_criteria as Prisma.InputJsonValue } : {}),
      },
    });
  },

  async list() {
    return prisma.promotion.findMany({ orderBy: { created_at: 'desc' } });
  },

  async getById(id: string) {
    return prisma.promotion.findUnique({ where: { id } });
  },

  async update(id: string, data: Partial<CreatePromotionInput>) {
    if (data.text_content && data.text_content.length > MAX_TEXT_LENGTH) {
      throw new Error(`text_content exceeds ${MAX_TEXT_LENGTH} characters`);
    }
    if (data.caption && data.caption.length > MAX_CAPTION_LENGTH) {
      throw new Error(`caption exceeds ${MAX_CAPTION_LENGTH} characters`);
    }
    const { bonus_amount, bonus_wallet, bonus_criteria } = data;
    return prisma.promotion.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.content_type !== undefined ? { content_type: data.content_type } : {}),
        ...(data.text_content !== undefined ? { text_content: data.text_content ?? null } : {}),
        ...(data.media_file_id !== undefined ? { media_file_id: data.media_file_id ?? null } : {}),
        ...(data.caption !== undefined ? { caption: data.caption ?? null } : {}),
        ...(bonus_amount != null ? { bonus_amount: new Decimal(bonus_amount) } : {}),
        ...(bonus_wallet !== undefined ? { bonus_wallet } : {}),
        ...(bonus_criteria !== undefined ? { bonus_criteria: bonus_criteria as Prisma.InputJsonValue } : {}),
      },
    });
  },

  async setStatus(id: string, status: PromotionStatus) {
    return prisma.promotion.update({ where: { id }, data: { status } });
  },

  /** Duplicate a promotion (without schedules or logs) */
  async duplicate(id: string) {
    const source = await prisma.promotion.findUniqueOrThrow({ where: { id } });
    return prisma.promotion.create({
      data: {
        title: `${source.title} (copy)`,
        content_type: source.content_type,
        ...(source.text_content !== null ? { text_content: source.text_content ?? null } : {}),
        ...(source.media_file_id !== null ? { media_file_id: source.media_file_id ?? null } : {}),
        ...(source.caption !== null ? { caption: source.caption ?? null } : {}),
        ...(source.bonus_amount != null ? { bonus_amount: source.bonus_amount } : {}),
        ...(source.bonus_wallet !== null ? { bonus_wallet: source.bonus_wallet ?? undefined } : {}),
        ...(source.bonus_criteria !== null ? { bonus_criteria: source.bonus_criteria as Prisma.InputJsonValue } : {}),
        status: 'inactive', // start copies as inactive
      },
    });
  },

  // ── Schedules ──────────────────────────────────────────────────────────────

  async createSchedule(promotionId: string, data: CreateScheduleInput) {
    if (data.channel_ids.length === 0) throw new Error('At least one channel_id is required');
    return prisma.promotionSchedule.create({
      data: {
        promotion_id: promotionId,
        channel_ids: data.channel_ids,
        frequency: data.frequency,
        send_at: data.send_at,
        next_run_at: data.send_at,
      },
    });
  },

  async listSchedules(promotionId: string) {
    return prisma.promotionSchedule.findMany({
      where: { promotion_id: promotionId },
      orderBy: { created_at: 'desc' },
    });
  },

  async cancelSchedule(scheduleId: string) {
    return prisma.promotionSchedule.update({
      where: { id: scheduleId },
      data: { is_active: false },
    });
  },

  // ── Logs ───────────────────────────────────────────────────────────────────

  async logDelivery(entry: LogDeliveryInput) {
    return prisma.promotionLog.create({ data: entry });
  },

  async getLogs(promotionId?: string, limit = 200) {
    const where = promotionId ? { promotion_id: promotionId } : undefined;

    return prisma.promotionLog.findMany({
      ...(where ? { where } : {}),
      orderBy: { sent_at: 'desc' },
      take: limit,
    });
  },

  /** Retry all failed log entries for a promotion, optionally filtered by scheduleId */
  async getFailedLogs(promotionId: string, scheduleId?: string) {
    return prisma.promotionLog.findMany({
      where: {
        promotion_id: promotionId,
        status: 'failed',
        ...(scheduleId ? { schedule_id: scheduleId } : {}),
      },
      orderBy: { sent_at: 'desc' },
    });
  },

  // ── Stats ──────────────────────────────────────────────────────────────────

  async getStats(promotionId: string): Promise<PromotionStats> {
    const [sent, failed, lastLog] = await Promise.all([
      prisma.promotionLog.count({ where: { promotion_id: promotionId, status: 'sent' } }),
      prisma.promotionLog.count({ where: { promotion_id: promotionId, status: 'failed' } }),
      prisma.promotionLog.findFirst({
        where: { promotion_id: promotionId, status: 'sent' },
        orderBy: { sent_at: 'desc' },
        select: { sent_at: true, channel_id: true },
      }),
    ]);

    const channels = await prisma.promotionLog.findMany({
      where: { promotion_id: promotionId, status: 'sent' },
      select: { channel_id: true },
      distinct: ['channel_id'],
    });

    return {
      total_sent: sent,
      total_failed: failed,
      unique_channels: channels.length,
      last_sent_at: lastLog?.sent_at ?? null,
    };
  },

  /** Aggregate stats across all promotions for dashboard KPIs */
  async getGlobalStats() {
    const [totalSent, totalFailed, activeSchedules] = await Promise.all([
      prisma.promotionLog.count({ where: { status: 'sent' } }),
      prisma.promotionLog.count({ where: { status: 'failed' } }),
      prisma.promotionSchedule.count({ where: { is_active: true } }),
    ]);
    return { totalSent, totalFailed, activeSchedules };
  },

  // ── Bonus Distribution ─────────────────────────────────────────────────────

  /**
   * Find all players who meet the bonus criteria for a promotion.
   * Returns player IDs + telegram IDs (for notification).
   */
  async getEligiblePlayers(promotionId: string) {
    const promotion = await prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } });
    if (!promotion.bonus_amount || !promotion.bonus_wallet) {
      throw new Error('This promotion has no bonus configured');
    }

    const criteria = (promotion.bonus_criteria ?? {}) as BonusCriteria;

    // IDs already distributed — skip them
    const alreadyDone = await prisma.promotionBonusDistribution.findMany({
      where: { promotion_id: promotionId },
      select: { player_id: true },
    });
    const skipIds = new Set(alreadyDone.map((d) => d.player_id));

    const players = await prisma.player.findMany({
      where: {
        is_suspended: false,
        ...(criteria.agentId ? { agent_id: criteria.agentId } : {}),
        ...(criteria.daysRegistered != null
          ? { created_at: { lte: new Date(Date.now() - criteria.daysRegistered * 86400_000) } }
          : {}),
      },
      include: {
        wallets: true,
        round_entries: criteria.hasPlayedRounds ? { take: 1 } : false,
      },
    });

    const eligible: { id: string; telegram_id: string; username: string }[] = [];

    for (const player of players) {
      if (skipIds.has(player.id)) continue;

      const mainWallet = player.wallets.find((w) => w.type === 'main');
      const playWallet = player.wallets.find((w) => w.type === 'play');
      const mainBalance = Number(mainWallet?.balance ?? 0);
      const playBalance = Number(playWallet?.balance ?? 0);
      const totalBalance = mainBalance + playBalance;

      if (criteria.minBalance != null && totalBalance < criteria.minBalance) continue;
      if (criteria.maxBalance != null && totalBalance > criteria.maxBalance) continue;

      if (criteria.minDeposits != null) {
        const deposits = await prisma.transaction.aggregate({
          where: { wallet: { player_id: player.id }, type: 'deposit' },
          _sum: { amount: true },
        });
        if (Number(deposits._sum.amount ?? 0) < criteria.minDeposits) continue;
      }

      if (criteria.hasPlayedRounds && (!('round_entries' in player) || (player.round_entries as unknown[]).length === 0)) continue;

      eligible.push({ id: player.id, telegram_id: String(player.telegram_id), username: player.username });
    }

    return {
      eligible,
      total: eligible.length,
      bonus_amount: Number(promotion.bonus_amount),
      bonus_wallet: promotion.bonus_wallet as 'main' | 'play',
    };
  },

  /**
   * Apply the promotion bonus to all eligible players (idempotent).
   * Returns counts of applied/skipped/failed.
   */
  async applyBonusToEligiblePlayers(promotionId: string) {
    const promotion = await prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } });
    if (!promotion.bonus_amount || !promotion.bonus_wallet) {
      throw new Error('This promotion has no bonus configured');
    }

    const { eligible, bonus_amount, bonus_wallet } = await PromotionService.getEligiblePlayers(promotionId);

    let applied = 0;
    let failed = 0;
    const errors: { player_id: string; error: string }[] = [];

    for (const player of eligible) {
      try {
        await prisma.$transaction(async (tx) => {
          const wallet = await tx.wallet.findFirst({
            where: { player_id: player.id, type: bonus_wallet },
          });
          if (!wallet) throw new Error(`Wallet not found for player ${player.id}`);

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: new Decimal(bonus_amount) } },
          });

          await tx.transaction.create({
            data: {
              wallet_id: wallet.id,
              type: 'admin_credit',
              amount: new Decimal(bonus_amount),
              note: `Promotion bonus: ${promotion.title}`,
              reference_id: promotionId,
            },
          });

          await tx.promotionBonusDistribution.create({
            data: {
              promotion_id: promotionId,
              player_id: player.id,
              amount: new Decimal(bonus_amount),
              wallet: bonus_wallet,
            },
          });
        });
        applied++;
      } catch (err) {
        failed++;
        errors.push({ player_id: player.id, error: (err as Error).message });
      }
    }

    return { applied, failed, errors };
  },

  /** List all bonus distributions for a promotion */
  async getBonusDistributions(promotionId: string) {
    return prisma.promotionBonusDistribution.findMany({
      where: { promotion_id: promotionId },
      include: { player: { select: { username: true, telegram_id: true } } },
      orderBy: { distributed_at: 'desc' },
    });
  },
};
