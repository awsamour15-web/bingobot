// Promotion Scheduler Service
// Sends scheduled promotions to Telegram channels via the bot.
import prisma from '../lib/prisma.js';
import { bot } from '../bot/index.js';
import { PromotionService } from './promotion.service.js';

const CHECK_INTERVAL_MS = 60_000; // check every 60 seconds

function advanceNextRunAt(frequency: string, from: Date): Date | null {
  const d = new Date(from);
  switch (frequency) {
    case 'daily':   d.setDate(d.getDate() + 1); return d;
    case 'weekly':  d.setDate(d.getDate() + 7); return d;
    case 'monthly': d.setMonth(d.getMonth() + 1); return d;
    default:        return null; // 'once' — no next run
  }
}

async function sendPromotion(
  promotion: { id: string; content_type: string; text_content: string | null; media_file_id: string | null },
  schedule: { id: string; channel_ids: string[] },
): Promise<void> {
  if (!bot) return;

  for (const channelId of schedule.channel_ids) {
    try {
      if (promotion.content_type === 'text' && promotion.text_content) {
        await bot.api.sendMessage(channelId, promotion.text_content);
      } else if (promotion.content_type === 'image' && promotion.media_file_id) {
        await bot.api.sendPhoto(channelId, promotion.media_file_id);
      } else if (promotion.content_type === 'video' && promotion.media_file_id) {
        await bot.api.sendVideo(channelId, promotion.media_file_id);
      } else if (promotion.content_type === 'gif' && promotion.media_file_id) {
        await bot.api.sendAnimation(channelId, promotion.media_file_id);
      }

      await PromotionService.logDelivery({
        promotion_id: promotion.id,
        schedule_id: schedule.id,
        channel_id: channelId,
        status: 'sent',
      });
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
    }
  }
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
