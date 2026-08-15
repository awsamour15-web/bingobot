// Promotion Scheduler Service
// Sends scheduled promotions to Telegram channels via the bot.
import prisma from '../lib/prisma.js';
import { bot } from '../bot/index.js';
import { PromotionService } from './promotion.service.js';

const CHECK_INTERVAL_MS = 60_000; // check every 60 seconds

type PromotionRow = {
  id: string;
  content_type: string;
  text_content: string | null;
  media_file_id: string | null;
  caption?: string | null;
};

type ScheduleRow = { id: string; channel_ids: string[] };

function advanceNextRunAt(frequency: string, from: Date): Date | null {
  const d = new Date(from);
  switch (frequency) {
    case 'daily':   d.setDate(d.getDate() + 1); return d;
    case 'weekly':  d.setDate(d.getDate() + 7); return d;
    case 'monthly': d.setMonth(d.getMonth() + 1); return d;
    default:        return null; // 'once' — no next run
  }
}

/**
 * Send a single promotion to all given channel IDs.
 * Logs each delivery attempt individually.
 */
export async function sendPromotion(
  promotion: PromotionRow,
  schedule: ScheduleRow,
): Promise<{ sent: number; failed: number }> {
  if (!bot) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const channelId of schedule.channel_ids) {
    try {
      const caption = promotion.caption ?? undefined;

      if (promotion.content_type === 'text' && promotion.text_content) {
        await bot.api.sendMessage(channelId, promotion.text_content);
      } else if (promotion.content_type === 'image' && promotion.media_file_id) {
        await bot.api.sendPhoto(channelId, promotion.media_file_id, ...(caption ? [{ caption }] : []));
      } else if (promotion.content_type === 'video' && promotion.media_file_id) {
        await bot.api.sendVideo(channelId, promotion.media_file_id, ...(caption ? [{ caption }] : []));
      } else if (promotion.content_type === 'gif' && promotion.media_file_id) {
        await bot.api.sendAnimation(channelId, promotion.media_file_id, ...(caption ? [{ caption }] : []));
      }

      await PromotionService.logDelivery({
        promotion_id: promotion.id,
        schedule_id: schedule.id,
        channel_id: channelId,
        status: 'sent',
      });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PromotionScheduler] Failed to send to channel ${channelId}:`, message);
      await PromotionService.logDelivery({
        promotion_id: promotion.id,
        schedule_id: schedule.id,
        channel_id: channelId,
        status: 'failed',
        error_message: message,
      }).catch(() => {});
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Send a promotion immediately to a given list of channels (ad-hoc, no schedule).
 * Creates a virtual schedule_id of null in logs.
 */
export async function sendPromotionNow(
  promotionId: string,
  channelIds: string[],
): Promise<{ sent: number; failed: number }> {
  if (!bot) throw new Error('Bot is not initialized');

  const promotion = await prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } });
  if (promotion.status !== 'active') throw new Error('Promotion is not active');
  if (channelIds.length === 0) throw new Error('At least one channel_id is required');

  let sent = 0;
  let failed = 0;
  const caption = (promotion as typeof promotion & { caption?: string | null }).caption ?? undefined;

  for (const channelId of channelIds) {
    try {
      if (promotion.content_type === 'text' && promotion.text_content) {
        await bot.api.sendMessage(channelId, promotion.text_content);
      } else if (promotion.content_type === 'image' && promotion.media_file_id) {
        await bot.api.sendPhoto(channelId, promotion.media_file_id, ...(caption ? [{ caption }] : []));
      } else if (promotion.content_type === 'video' && promotion.media_file_id) {
        await bot.api.sendVideo(channelId, promotion.media_file_id, ...(caption ? [{ caption }] : []));
      } else if (promotion.content_type === 'gif' && promotion.media_file_id) {
        await bot.api.sendAnimation(channelId, promotion.media_file_id, ...(caption ? [{ caption }] : []));
      }

      await PromotionService.logDelivery({
        promotion_id: promotion.id,
        channel_id: channelId,
        status: 'sent',
      });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await PromotionService.logDelivery({
        promotion_id: promotion.id,
        channel_id: channelId,
        status: 'failed',
        error_message: message,
      }).catch(() => {});
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Retry all previously failed deliveries for a promotion.
 */
export async function retryFailedDeliveries(promotionId: string): Promise<{ sent: number; failed: number }> {
  if (!bot) throw new Error('Bot is not initialized');

  const failedLogs = await PromotionService.getFailedLogs(promotionId);
  if (failedLogs.length === 0) return { sent: 0, failed: 0 };

  const promotion = await prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } });
  const channelIds = [...new Set(failedLogs.map(l => l.channel_id))];

  return sendPromotionNow(promotion.id, channelIds);
}

async function tick(): Promise<void> {
  try {
    const dueSchedules = await prisma.promotionSchedule.findMany({
      where: {
        is_active: true,
        next_run_at: { lte: new Date() },
      },
      include: { promotion: true },
    });

    for (const schedule of dueSchedules) {
      if (schedule.promotion.status !== 'active') continue;

      await sendPromotion(schedule.promotion, schedule);

      const nextRunAt = advanceNextRunAt(schedule.frequency, schedule.next_run_at ?? new Date());
      await prisma.promotionSchedule.update({
        where: { id: schedule.id },
        data: {
          next_run_at: nextRunAt,
          is_active: nextRunAt !== null, // deactivate 'once' schedules
        },
      });
    }
  } catch (err) {
    console.error('[PromotionScheduler] tick error:', err);
  }
}

export const PromotionScheduler = {
  _timer: undefined as ReturnType<typeof setInterval> | undefined,

  start(): void {
    console.log('[PromotionScheduler] Starting');
    void tick();
    PromotionScheduler._timer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
  },

  stop(): void {
    if (PromotionScheduler._timer !== undefined) {
      clearInterval(PromotionScheduler._timer);
      PromotionScheduler._timer = undefined;
    }
  },
};
