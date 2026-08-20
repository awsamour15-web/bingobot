// Promotion Scheduler Service
// Sends scheduled promotions to Telegram channels/users via the bot.
import prisma from '../lib/prisma.js';
import { bot } from '../bot/index.js';
import { PromotionService } from './promotion.service.js';

type TargetType = 'channel' | 'bot_broadcast';

export interface SendTarget {
  id: string;
  name: string;
  type: TargetType;
  channel_id?: string | null;
}

/** Send a single message to one destination (channel ID or user telegram_id) */
async function sendToOne(
  promotion: { content_type: string; text_content: string | null; media_file_id: string | null; caption?: string | null },
  chatId: string,
): Promise<void> {
  if (!bot) throw new Error('Bot not initialized');
  
  const botUsername = process.env['BOT_USERNAME'] ?? 'FidelBingoBot';
  const playLink = `https://t.me/${botUsername}`;
  
  // Create inline keyboard with Play button
  const keyboard = {
    inline_keyboard: [[
      { text: '🎮 Play Now', url: playLink }
    ]]
  };
  
  const caption = promotion.caption ?? undefined;
  
  if (promotion.content_type === 'text' && promotion.text_content) {
    await bot.api.sendMessage(chatId, promotion.text_content, { reply_markup: keyboard });
  } else if (promotion.content_type === 'image' && promotion.media_file_id) {
    await bot.api.sendPhoto(chatId, promotion.media_file_id, {
      ...(caption ? { caption } : {}),
      reply_markup: keyboard,
    });
  } else if (promotion.content_type === 'video' && promotion.media_file_id) {
    await bot.api.sendVideo(chatId, promotion.media_file_id, {
      ...(caption ? { caption } : {}),
      reply_markup: keyboard,
    });
  } else if (promotion.content_type === 'gif' && promotion.media_file_id) {
    await bot.api.sendAnimation(chatId, promotion.media_file_id, {
      ...(caption ? { caption } : {}),
      reply_markup: keyboard,
    });
  }
}

/** Resolve targets to a list of chat IDs to send to - uses cursor pagination to avoid loading all players into memory */
async function resolveTargets(targets: SendTarget[]): Promise<string[]> {
  const ids: string[] = [];
  for (const t of targets) {
    if (t.type === 'channel' && t.channel_id) {
      ids.push(t.channel_id);
    } else if (t.type === 'bot_broadcast') {
      // Stream players in batches to avoid OOM on large player bases
      let cursor: string | undefined;
      const BATCH_SIZE = 1000;
      
      while (true) {
        const players = await prisma.player.findMany({
          where: { is_suspended: false },
          select: { id: true, telegram_id: true },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        
        if (players.length === 0) break;
        
        for (const p of players) ids.push(String(p.telegram_id));
        
        if (players.length < BATCH_SIZE) break;
        cursor = players[players.length - 1]!.id;
      }
    }
  }
  return ids;
}

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

/**
 * Send a promotion to a list of chat IDs (used by scheduler tick).
 */
export async function sendPromotion(
  promotion: { id: string; content_type: string; text_content: string | null; media_file_id: string | null; caption?: string | null },
  schedule: { id: string; channel_ids: string[] },
): Promise<{ sent: number; failed: number }> {
  if (!bot) return { sent: 0, failed: 0 };
  let sent = 0, failed = 0;
  for (const channelId of schedule.channel_ids) {
    try {
      await sendToOne(promotion, channelId);
      await PromotionService.logDelivery({ promotion_id: promotion.id, schedule_id: schedule.id, channel_id: channelId, status: 'sent' });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PromotionScheduler] Failed to send to ${channelId}:`, message);
      await PromotionService.logDelivery({ promotion_id: promotion.id, schedule_id: schedule.id, channel_id: channelId, status: 'failed', error_message: message }).catch(() => {});
      failed++;
    }
  }
  return { sent, failed };
}

/**
 * Send a promotion immediately to selected targets.
 * targets: list of SavedTarget objects (channel or bot_broadcast)
 */
export async function sendPromotionNow(
  promotionId: string,
  targets: SendTarget[],
): Promise<{ sent: number; failed: number }> {
  if (!bot) throw new Error('Bot is not initialized');
  const promotion = await prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } });
  if (promotion.status !== 'active') throw new Error('Promotion is not active');
  if (targets.length === 0) throw new Error('At least one target is required');

  const chatIds = await resolveTargets(targets);
  let sent = 0, failed = 0;

  for (const chatId of chatIds) {
    try {
      await sendToOne(promotion, chatId);
      await PromotionService.logDelivery({ promotion_id: promotion.id, channel_id: chatId, status: 'sent' });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await PromotionService.logDelivery({ promotion_id: promotion.id, channel_id: chatId, status: 'failed', error_message: message }).catch(() => {});
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
  const uniqueChannelIds = [...new Set(failedLogs.map(l => l.channel_id))];

  // Convert raw channel IDs back to SendTarget objects for reuse
  const targets: SendTarget[] = uniqueChannelIds.map(id => ({
    id,
    name: id,
    type: 'channel' as const,
    channel_id: id,
  }));

  return sendPromotionNow(promotion.id, targets);
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
