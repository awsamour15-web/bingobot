// Unit tests for PromotionScheduler
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import prisma from '../../lib/prisma.js';
import { bot } from '../../bot/index.js';
import { PromotionService } from '../promotion.service.js';

// Mock the dependencies
vi.mock('../../lib/prisma.js', () => ({
  default: {
    promotionSchedule: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../bot/index.js', () => ({
  bot: {
    api: {
      sendMessage: vi.fn(),
      sendPhoto: vi.fn(),
      sendVideo: vi.fn(),
      sendAnimation: vi.fn(),
    },
  },
}));

vi.mock('../promotion.service.js', () => ({
  PromotionService: {
    logDelivery: vi.fn(),
  },
}));

describe('PromotionScheduler', () => {
  let PromotionScheduler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamically import to get fresh instance
    const module = await import('../promotion-scheduler.service.js');
    PromotionScheduler = module.PromotionScheduler;
  });

  afterEach(() => {
    if (PromotionScheduler._timer) {
      PromotionScheduler.stop();
    }
  });

  describe('start/stop', () => {
    it('should start the scheduler with an interval timer', () => {
      PromotionScheduler.start();
      expect(PromotionScheduler._timer).toBeDefined();
    });

    it('should stop the scheduler and clear the timer', () => {
      PromotionScheduler.start();
      const timer = PromotionScheduler._timer;
      PromotionScheduler.stop();
      expect(PromotionScheduler._timer).toBeUndefined();
    });
  });

  describe('tick - schedule processing', () => {
    it('should query for due active schedules', async () => {
      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([]);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      // Access the internal tick function through start
      await PromotionScheduler.start();
      PromotionScheduler.stop();

      // The tick is called on start, so we should see the query
      expect(prisma.promotionSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            is_active: true,
            next_run_at: expect.objectContaining({ lte: expect.any(Date) }),
          },
        })
      );
    });

    it('should skip schedules with inactive promotions', async () => {
      const inactivePromoSchedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1'],
        frequency: 'once',
        next_run_at: new Date(),
        promotion: {
          id: 'promo1',
          status: 'inactive',
          content_type: 'text',
          text_content: 'Test',
          media_file_id: null,
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([inactivePromoSchedule] as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50)); // Let tick complete
      PromotionScheduler.stop();

      // Should not send message
      expect(bot?.api.sendMessage).not.toHaveBeenCalled();
      // Should not update schedule
      expect(prisma.promotionSchedule.update).not.toHaveBeenCalled();
    });

    it('should send text promotion to all channels', async () => {
      const activeSchedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1', 'ch2'],
        frequency: 'once',
        next_run_at: new Date(),
        promotion: {
          id: 'promo1',
          status: 'active',
          content_type: 'text',
          text_content: 'Hello World!',
          media_file_id: null,
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([activeSchedule] as any);
      vi.mocked(bot?.api.sendMessage).mockResolvedValue({} as any);
      vi.mocked(PromotionService.logDelivery).mockResolvedValue({} as any);
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();

      // Should send to both channels
      expect(bot?.api.sendMessage).toHaveBeenCalledTimes(2);
      expect(bot?.api.sendMessage).toHaveBeenCalledWith('ch1', 'Hello World!');
      expect(bot?.api.sendMessage).toHaveBeenCalledWith('ch2', 'Hello World!');

      // Should log 2 successful deliveries
      expect(PromotionService.logDelivery).toHaveBeenCalledTimes(2);
      expect(PromotionService.logDelivery).toHaveBeenCalledWith({
        promotion_id: 'promo1',
        schedule_id: 'sched1',
        channel_id: 'ch1',
        status: 'sent',
      });
    });

    it('should send image promotion using sendPhoto', async () => {
      const imageSchedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1'],
        frequency: 'once',
        next_run_at: new Date(),
        promotion: {
          id: 'promo1',
          status: 'active',
          content_type: 'image',
          text_content: null,
          media_file_id: 'FILE_ID_123',
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([imageSchedule] as any);
      vi.mocked(bot?.api.sendPhoto).mockResolvedValue({} as any);
      vi.mocked(PromotionService.logDelivery).mockResolvedValue({} as any);
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();

      expect(bot?.api.sendPhoto).toHaveBeenCalledWith('ch1', 'FILE_ID_123');
      expect(PromotionService.logDelivery).toHaveBeenCalledWith({
        promotion_id: 'promo1',
        schedule_id: 'sched1',
        channel_id: 'ch1',
        status: 'sent',
      });
    });

    it('should send video promotion using sendVideo', async () => {
      const videoSchedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1'],
        frequency: 'once',
        next_run_at: new Date(),
        promotion: {
          id: 'promo1',
          status: 'active',
          content_type: 'video',
          text_content: null,
          media_file_id: 'VIDEO_FILE_ID',
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([videoSchedule] as any);
      vi.mocked(bot?.api.sendVideo).mockResolvedValue({} as any);
      vi.mocked(PromotionService.logDelivery).mockResolvedValue({} as any);
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();

      expect(bot?.api.sendVideo).toHaveBeenCalledWith('ch1', 'VIDEO_FILE_ID');
    });

    it('should send gif promotion using sendAnimation', async () => {
      const gifSchedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1'],
        frequency: 'once',
        next_run_at: new Date(),
        promotion: {
          id: 'promo1',
          status: 'active',
          content_type: 'gif',
          text_content: null,
          media_file_id: 'GIF_FILE_ID',
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([gifSchedule] as any);
      vi.mocked(bot?.api.sendAnimation).mockResolvedValue({} as any);
      vi.mocked(PromotionService.logDelivery).mockResolvedValue({} as any);
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();

      expect(bot?.api.sendAnimation).toHaveBeenCalledWith('ch1', 'GIF_FILE_ID');
    });

    it('should deactivate "once" schedules after successful send', async () => {
      const onceSchedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1'],
        frequency: 'once',
        next_run_at: new Date(),
        promotion: {
          id: 'promo1',
          status: 'active',
          content_type: 'text',
          text_content: 'Test',
          media_file_id: null,
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([onceSchedule] as any);
      vi.mocked(bot?.api.sendMessage).mockResolvedValue({} as any);
      vi.mocked(PromotionService.logDelivery).mockResolvedValue({} as any);
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();

      expect(prisma.promotionSchedule.update).toHaveBeenCalledWith({
        where: { id: 'sched1' },
        data: {
          next_run_at: null,
          is_active: false,
        },
      });
    });

    it('should advance next_run_at for daily schedules', async () => {
      const now = new Date('2024-01-01T10:00:00Z');
      const dailySchedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1'],
        frequency: 'daily',
        next_run_at: now,
        promotion: {
          id: 'promo1',
          status: 'active',
          content_type: 'text',
          text_content: 'Daily promo',
          media_file_id: null,
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([dailySchedule] as any);
      vi.mocked(bot?.api.sendMessage).mockResolvedValue({} as any);
      vi.mocked(PromotionService.logDelivery).mockResolvedValue({} as any);
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();

      // Should advance by 1 day
      expect(prisma.promotionSchedule.update).toHaveBeenCalledWith({
        where: { id: 'sched1' },
        data: {
          next_run_at: new Date('2024-01-02T10:00:00Z'),
          is_active: true,
        },
      });
    });

    it('should advance next_run_at for weekly schedules', async () => {
      const now = new Date('2024-01-01T10:00:00Z');
      const weeklySchedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1'],
        frequency: 'weekly',
        next_run_at: now,
        promotion: {
          id: 'promo1',
          status: 'active',
          content_type: 'text',
          text_content: 'Weekly promo',
          media_file_id: null,
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([weeklySchedule] as any);
      vi.mocked(bot?.api.sendMessage).mockResolvedValue({} as any);
      vi.mocked(PromotionService.logDelivery).mockResolvedValue({} as any);
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();

      // Should advance by 7 days
      expect(prisma.promotionSchedule.update).toHaveBeenCalledWith({
        where: { id: 'sched1' },
        data: {
          next_run_at: new Date('2024-01-08T10:00:00Z'),
          is_active: true,
        },
      });
    });

    it('should advance next_run_at for monthly schedules', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const monthlySchedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1'],
        frequency: 'monthly',
        next_run_at: now,
        promotion: {
          id: 'promo1',
          status: 'active',
          content_type: 'text',
          text_content: 'Monthly promo',
          media_file_id: null,
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([monthlySchedule] as any);
      vi.mocked(bot?.api.sendMessage).mockResolvedValue({} as any);
      vi.mocked(PromotionService.logDelivery).mockResolvedValue({} as any);
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();

      // Should advance by 1 month
      expect(prisma.promotionSchedule.update).toHaveBeenCalledWith({
        where: { id: 'sched1' },
        data: {
          next_run_at: new Date('2024-02-15T10:00:00Z'),
          is_active: true,
        },
      });
    });

    it('should log failed deliveries with error message', async () => {
      const schedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1'],
        frequency: 'once',
        next_run_at: new Date(),
        promotion: {
          id: 'promo1',
          status: 'active',
          content_type: 'text',
          text_content: 'Test',
          media_file_id: null,
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([schedule] as any);
      vi.mocked(bot?.api.sendMessage).mockRejectedValue(new Error('Channel not found'));
      vi.mocked(PromotionService.logDelivery).mockResolvedValue({} as any);
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();

      // Should log failure
      expect(PromotionService.logDelivery).toHaveBeenCalledWith({
        promotion_id: 'promo1',
        schedule_id: 'sched1',
        channel_id: 'ch1',
        status: 'failed',
        error_message: 'Channel not found',
      });

      // Should still update schedule even after failure
      expect(prisma.promotionSchedule.update).toHaveBeenCalled();
    });

    it('should not crash when processing multiple schedules with failures', async () => {
      const schedules = [
        {
          id: 'sched1',
          promotion_id: 'promo1',
          channel_ids: ['ch1'],
          frequency: 'once',
          next_run_at: new Date(),
          promotion: {
            id: 'promo1',
            status: 'active',
            content_type: 'text',
            text_content: 'Test 1',
            media_file_id: null,
          },
        },
        {
          id: 'sched2',
          promotion_id: 'promo2',
          channel_ids: ['ch2'],
          frequency: 'once',
          next_run_at: new Date(),
          promotion: {
            id: 'promo2',
            status: 'active',
            content_type: 'text',
            text_content: 'Test 2',
            media_file_id: null,
          },
        },
      ];

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue(schedules as any);
      vi.mocked(bot?.api.sendMessage)
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({} as any);
      vi.mocked(PromotionService.logDelivery).mockResolvedValue({} as any);
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      PromotionScheduler.stop();

      // Should process both schedules despite first one failing
      expect(PromotionService.logDelivery).toHaveBeenCalledTimes(2);
      expect(prisma.promotionSchedule.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should not crash when prisma query fails', async () => {
      vi.mocked(prisma.promotionSchedule.findMany).mockRejectedValue(new Error('DB error'));

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      
      // Should not throw
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();
      
      // If we got here, it didn't crash
      expect(true).toBe(true);
    });

    it('should continue processing when logDelivery fails', async () => {
      const schedule = {
        id: 'sched1',
        promotion_id: 'promo1',
        channel_ids: ['ch1'],
        frequency: 'once',
        next_run_at: new Date(),
        promotion: {
          id: 'promo1',
          status: 'active',
          content_type: 'text',
          text_content: 'Test',
          media_file_id: null,
        },
      };

      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue([schedule] as any);
      vi.mocked(bot?.api.sendMessage).mockResolvedValue({} as any);
      vi.mocked(PromotionService.logDelivery).mockRejectedValue(new Error('Log failed'));
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue({} as any);

      const { PromotionScheduler } = await import('../promotion-scheduler.service.js');
      
      // Should not crash even if logging fails
      await PromotionScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      PromotionScheduler.stop();
      
      // If we got here, it didn't crash
      expect(true).toBe(true);
    });
  });
});
