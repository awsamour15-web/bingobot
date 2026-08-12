// Unit tests for PromotionService
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromotionService } from '../promotion.service.js';
import prisma from '../../lib/prisma.js';

vi.mock('../../lib/prisma.js', () => ({
  default: {
    promotion: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    promotionSchedule: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    promotionLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('PromotionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a text promotion with valid content', async () => {
      const mockPromotion = { id: '1', title: 'Test', content_type: 'text', text_content: 'Hello' };
      vi.mocked(prisma.promotion.create).mockResolvedValue(mockPromotion as any);

      const result = await PromotionService.create({
        title: 'Test',
        content_type: 'text',
        text_content: 'Hello',
      });

      expect(result).toEqual(mockPromotion);
      expect(prisma.promotion.create).toHaveBeenCalledWith({
        data: { title: 'Test', content_type: 'text', text_content: 'Hello' },
      });
    });

    it('should reject text content exceeding 4096 characters', async () => {
      const longText = 'a'.repeat(4097);
      await expect(
        PromotionService.create({
          title: 'Test',
          content_type: 'text',
          text_content: longText,
        })
      ).rejects.toThrow('text_content exceeds 4096 characters');
    });

    it('should accept text content of exactly 4096 characters', async () => {
      const exactText = 'a'.repeat(4096);
      const mockPromotion = { id: '1', title: 'Test', content_type: 'text', text_content: exactText };
      vi.mocked(prisma.promotion.create).mockResolvedValue(mockPromotion as any);

      await PromotionService.create({
        title: 'Test',
        content_type: 'text',
        text_content: exactText,
      });

      expect(prisma.promotion.create).toHaveBeenCalled();
    });

    it('should reject unsupported content types', async () => {
      await expect(
        PromotionService.create({
          title: 'Test',
          content_type: 'audio' as any,
        })
      ).rejects.toThrow('Unsupported content type: audio');
    });

    it('should require text_content for text promotions', async () => {
      await expect(
        PromotionService.create({
          title: 'Test',
          content_type: 'text',
        })
      ).rejects.toThrow('text_content is required for text promotions');
    });

    it('should require media_file_id for media promotions', async () => {
      await expect(
        PromotionService.create({
          title: 'Test',
          content_type: 'image',
        })
      ).rejects.toThrow('media_file_id is required for media promotions');
    });
  });

  describe('list', () => {
    it('should return promotions ordered by created_at desc', async () => {
      const mockPromotions = [
        { id: '2', created_at: new Date('2024-01-02') },
        { id: '1', created_at: new Date('2024-01-01') },
      ];
      vi.mocked(prisma.promotion.findMany).mockResolvedValue(mockPromotions as any);

      const result = await PromotionService.list();

      expect(result).toEqual(mockPromotions);
      expect(prisma.promotion.findMany).toHaveBeenCalledWith({
        orderBy: { created_at: 'desc' },
      });
    });
  });

  describe('update', () => {
    it('should update promotion with valid data', async () => {
      const mockPromotion = { id: '1', title: 'Updated' };
      vi.mocked(prisma.promotion.update).mockResolvedValue(mockPromotion as any);

      const result = await PromotionService.update('1', { title: 'Updated' });

      expect(result).toEqual(mockPromotion);
      expect(prisma.promotion.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { title: 'Updated' },
      });
    });

    it('should reject text content exceeding 4096 characters on update', async () => {
      const longText = 'a'.repeat(4097);
      await expect(
        PromotionService.update('1', { text_content: longText })
      ).rejects.toThrow('text_content exceeds 4096 characters');
    });
  });

  describe('setStatus', () => {
    it('should update promotion status', async () => {
      const mockPromotion = { id: '1', status: 'inactive' };
      vi.mocked(prisma.promotion.update).mockResolvedValue(mockPromotion as any);

      const result = await PromotionService.setStatus('1', 'inactive');

      expect(result).toEqual(mockPromotion);
      expect(prisma.promotion.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { status: 'inactive' },
      });
    });
  });

  describe('createSchedule', () => {
    it('should create schedule with next_run_at set to send_at', async () => {
      const sendAt = new Date('2024-12-25T10:00:00Z');
      const mockSchedule = {
        id: 's1',
        promotion_id: 'p1',
        channel_ids: ['ch1'],
        frequency: 'once',
        send_at: sendAt,
        next_run_at: sendAt,
      };
      vi.mocked(prisma.promotionSchedule.create).mockResolvedValue(mockSchedule as any);

      const result = await PromotionService.createSchedule('p1', {
        channel_ids: ['ch1'],
        frequency: 'once',
        send_at: sendAt,
      });

      expect(result).toEqual(mockSchedule);
      expect(prisma.promotionSchedule.create).toHaveBeenCalledWith({
        data: {
          promotion_id: 'p1',
          channel_ids: ['ch1'],
          frequency: 'once',
          send_at: sendAt,
          next_run_at: sendAt,
        },
      });
    });
  });

  describe('listSchedules', () => {
    it('should return schedules for a promotion ordered by created_at desc', async () => {
      const mockSchedules = [
        { id: 's2', promotion_id: 'p1', created_at: new Date('2024-01-02') },
        { id: 's1', promotion_id: 'p1', created_at: new Date('2024-01-01') },
      ];
      vi.mocked(prisma.promotionSchedule.findMany).mockResolvedValue(mockSchedules as any);

      const result = await PromotionService.listSchedules('p1');

      expect(result).toEqual(mockSchedules);
      expect(prisma.promotionSchedule.findMany).toHaveBeenCalledWith({
        where: { promotion_id: 'p1' },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  describe('cancelSchedule', () => {
    it('should set schedule is_active to false', async () => {
      const mockSchedule = { id: 's1', is_active: false };
      vi.mocked(prisma.promotionSchedule.update).mockResolvedValue(mockSchedule as any);

      const result = await PromotionService.cancelSchedule('s1');

      expect(result).toEqual(mockSchedule);
      expect(prisma.promotionSchedule.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { is_active: false },
      });
    });
  });

  describe('logDelivery', () => {
    it('should create a delivery log entry', async () => {
      const logEntry = {
        promotion_id: 'p1',
        schedule_id: 's1',
        channel_id: 'ch1',
        status: 'sent' as const,
      };
      const mockLog = { id: 'l1', ...logEntry };
      vi.mocked(prisma.promotionLog.create).mockResolvedValue(mockLog as any);

      const result = await PromotionService.logDelivery(logEntry);

      expect(result).toEqual(mockLog);
      expect(prisma.promotionLog.create).toHaveBeenCalledWith({ data: logEntry });
    });

    it('should create a failed delivery log with error message', async () => {
      const logEntry = {
        promotion_id: 'p1',
        channel_id: 'ch1',
        status: 'failed' as const,
        error_message: 'Network error',
      };
      const mockLog = { id: 'l1', ...logEntry };
      vi.mocked(prisma.promotionLog.create).mockResolvedValue(mockLog as any);

      const result = await PromotionService.logDelivery(logEntry);

      expect(result).toEqual(mockLog);
      expect(prisma.promotionLog.create).toHaveBeenCalledWith({ data: logEntry });
    });
  });

  describe('getLogs', () => {
    it('should return all logs when no promotionId is provided', async () => {
      const mockLogs = [
        { id: 'l2', sent_at: new Date('2024-01-02') },
        { id: 'l1', sent_at: new Date('2024-01-01') },
      ];
      vi.mocked(prisma.promotionLog.findMany).mockResolvedValue(mockLogs as any);

      const result = await PromotionService.getLogs();

      expect(result).toEqual(mockLogs);
      expect(prisma.promotionLog.findMany).toHaveBeenCalledWith({
        orderBy: { sent_at: 'desc' },
        take: 200,
      });
    });

    it('should filter logs by promotionId when provided', async () => {
      const mockLogs = [{ id: 'l1', promotion_id: 'p1', sent_at: new Date() }];
      vi.mocked(prisma.promotionLog.findMany).mockResolvedValue(mockLogs as any);

      const result = await PromotionService.getLogs('p1');

      expect(result).toEqual(mockLogs);
      expect(prisma.promotionLog.findMany).toHaveBeenCalledWith({
        orderBy: { sent_at: 'desc' },
        take: 200,
        where: { promotion_id: 'p1' },
      });
    });
  });
});
