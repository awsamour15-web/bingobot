// Promotion service — CRUD, scheduling, and delivery logging
import prisma from '../lib/prisma.js';

const MAX_TEXT_LENGTH = 4096;
const VALID_CONTENT_TYPES = ['text', 'image', 'video', 'gif'] as const;
type PromotionContentType = typeof VALID_CONTENT_TYPES[number];
type PromotionStatus = 'active' | 'inactive';
type PromotionScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

export interface CreatePromotionInput {
  title: string;
  content_type: PromotionContentType;
  text_content?: string;
  media_file_id?: string;
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
    }
    return prisma.promotion.create({ data });
  },

  async list() {
    return prisma.promotion.findMany({ orderBy: { created_at: 'desc' } });
  },

  async update(id: string, data: Partial<CreatePromotionInput>) {
    if (data.text_content && data.text_content.length > MAX_TEXT_LENGTH) {
      throw new Error(`text_content exceeds ${MAX_TEXT_LENGTH} characters`);
    }
    return prisma.promotion.update({ where: { id }, data });
  },

  async setStatus(id: string, status: PromotionStatus) {
    return prisma.promotion.update({ where: { id }, data: { status } });
  },

  async createSchedule(promotionId: string, data: CreateScheduleInput) {
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

  async logDelivery(entry: LogDeliveryInput) {
    return prisma.promotionLog.create({ data: entry });
  },

  async getLogs(promotionId?: string) {
    return prisma.promotionLog.findMany({
      where: promotionId ? { promotion_id: promotionId } : undefined,
      orderBy: { sent_at: 'desc' },
      take: 200,
    });
  },
};
