// Promotion service — CRUD, scheduling, delivery, stats, and utilities
import prisma from '../lib/prisma.js';

const MAX_TEXT_LENGTH = 4096;
const MAX_CAPTION_LENGTH = 1024;
const VALID_CONTENT_TYPES = ['text', 'image', 'video', 'gif'] as const;
type PromotionContentType = typeof VALID_CONTENT_TYPES[number];
type PromotionStatus = 'active' | 'inactive';
type PromotionScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

export interface CreatePromotionInput {
  title: string;
  content_type: PromotionContentType;
  text_content?: string;
  media_file_id?: string;
  caption?: string;
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
    return prisma.promotion.create({ data });
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
    return prisma.promotion.update({ where: { id }, data });
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
        text_content: source.text_content,
        media_file_id: source.media_file_id,
        caption: source.caption,
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
    return prisma.promotionLog.findMany({
      where: promotionId ? { promotion_id: promotionId } : undefined,
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
};
