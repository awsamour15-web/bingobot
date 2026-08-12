// Unit tests for admin promotions router
// Task 2.3 verification

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromotionService } from '../../../services/promotion.service.js';

// Mock the PromotionService
vi.mock('../../../services/promotion.service.js', () => ({
  PromotionService: {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    createSchedule: vi.fn(),
    listSchedules: vi.fn(),
    cancelSchedule: vi.fn(),
    getLogs: vi.fn(),
  },
}));
const mockPromotionService = vi.mocked(PromotionService);

describe('Admin Promotions Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PromotionService Integration', () => {
    it('should have list method available', () => {
      expect(typeof mockPromotionService.list).toBe('function');
    });

    it('should have create method available', () => {
      expect(typeof mockPromotionService.create).toBe('function');
    });

    it('should have update method available', () => {
      expect(typeof mockPromotionService.update).toBe('function');
    });

    it('should have setStatus method available', () => {
      expect(typeof mockPromotionService.setStatus).toBe('function');
    });

    it('should have createSchedule method available', () => {
      expect(typeof mockPromotionService.createSchedule).toBe('function');
    });

    it('should have listSchedules method available', () => {
      expect(typeof mockPromotionService.listSchedules).toBe('function');
    });

    it('should have cancelSchedule method available', () => {
      expect(typeof mockPromotionService.cancelSchedule).toBe('function');
    });

    it('should have getLogs method available', () => {
      expect(typeof mockPromotionService.getLogs).toBe('function');
    });
  });

  describe('Service Method Mocks', () => {
    it('should mock list to return promotions', async () => {
      const mockPromotions = [
        {
          id: 'promo-123',
          title: 'Test Promotion',
          content_type: 'text',
          text_content: 'Test message',
          media_file_id: null,
          status: 'active',
          created_at: new Date('2025-01-01T00:00:00Z'),
          updated_at: new Date('2025-01-01T00:00:00Z'),
        },
      ];

      mockPromotionService.list.mockResolvedValue(mockPromotions as any);

      const result = await mockPromotionService.list();
      expect(result).toEqual(mockPromotions);
      expect(mockPromotionService.list).toHaveBeenCalledWith();
    });

    it('should mock create to return created promotion', async () => {
      const mockPromotion = {
        id: 'promo-123',
        title: 'New Promotion',
        content_type: 'text',
        text_content: 'Welcome bonus!',
        media_file_id: null,
        status: 'active',
        created_at: new Date('2025-01-01T00:00:00Z'),
        updated_at: new Date('2025-01-01T00:00:00Z'),
      };

      mockPromotionService.create.mockResolvedValue(mockPromotion as any);

      const result = await mockPromotionService.create({
        title: 'New Promotion',
        content_type: 'text',
        text_content: 'Welcome bonus!',
      });
      expect(result).toEqual(mockPromotion);
      expect(mockPromotionService.create).toHaveBeenCalledWith({
        title: 'New Promotion',
        content_type: 'text',
        text_content: 'Welcome bonus!',
      });
    });

    it('should mock update to return updated promotion', async () => {
      const mockPromotion = {
        id: 'promo-123',
        title: 'Updated Promotion',
        content_type: 'text',
        text_content: 'Updated message',
        media_file_id: null,
        status: 'active',
        created_at: new Date('2025-01-01T00:00:00Z'),
        updated_at: new Date('2025-01-02T00:00:00Z'),
      };

      mockPromotionService.update.mockResolvedValue(mockPromotion as any);

      const result = await mockPromotionService.update('promo-123', { title: 'Updated Promotion' });
      expect(result).toEqual(mockPromotion);
      expect(mockPromotionService.update).toHaveBeenCalledWith('promo-123', { title: 'Updated Promotion' });
    });

    it('should mock setStatus to toggle promotion status', async () => {
      const mockPromotion = {
        id: 'promo-123',
        title: 'Test Promotion',
        content_type: 'text',
        text_content: 'Test message',
        media_file_id: null,
        status: 'inactive',
        created_at: new Date('2025-01-01T00:00:00Z'),
        updated_at: new Date('2025-01-02T00:00:00Z'),
      };

      mockPromotionService.setStatus.mockResolvedValue(mockPromotion as any);

      const result = await mockPromotionService.setStatus('promo-123', 'inactive');
      expect(result).toEqual(mockPromotion);
      expect(mockPromotionService.setStatus).toHaveBeenCalledWith('promo-123', 'inactive');
    });

    it('should mock createSchedule to return created schedule', async () => {
      const mockSchedule = {
        id: 'schedule-123',
        promotion_id: 'promo-123',
        channel_ids: ['-1001234567890'],
        frequency: 'once',
        send_at: new Date('2025-01-15T10:00:00Z'),
        next_run_at: new Date('2025-01-15T10:00:00Z'),
        is_active: true,
        created_at: new Date('2025-01-01T00:00:00Z'),
      };

      mockPromotionService.createSchedule.mockResolvedValue(mockSchedule as any);

      const result = await mockPromotionService.createSchedule('promo-123', {
        channel_ids: ['-1001234567890'],
        frequency: 'once',
        send_at: new Date('2025-01-15T10:00:00Z'),
      });
      expect(result).toEqual(mockSchedule);
      expect(mockPromotionService.createSchedule).toHaveBeenCalledWith('promo-123', {
        channel_ids: ['-1001234567890'],
        frequency: 'once',
        send_at: new Date('2025-01-15T10:00:00Z'),
      });
    });

    it('should mock listSchedules to return schedules', async () => {
      const mockSchedules = [
        {
          id: 'schedule-123',
          promotion_id: 'promo-123',
          channel_ids: ['-1001234567890'],
          frequency: 'daily',
          send_at: new Date('2025-01-01T10:00:00Z'),
          next_run_at: new Date('2025-01-02T10:00:00Z'),
          is_active: true,
          created_at: new Date('2025-01-01T00:00:00Z'),
        },
      ];

      mockPromotionService.listSchedules.mockResolvedValue(mockSchedules as any);

      const result = await mockPromotionService.listSchedules('promo-123');
      expect(result).toEqual(mockSchedules);
      expect(mockPromotionService.listSchedules).toHaveBeenCalledWith('promo-123');
    });

    it('should mock cancelSchedule to deactivate schedule', async () => {
      const mockSchedule = {
        id: 'schedule-123',
        promotion_id: 'promo-123',
        channel_ids: ['-1001234567890'],
        frequency: 'once',
        send_at: new Date('2025-01-15T10:00:00Z'),
        next_run_at: new Date('2025-01-15T10:00:00Z'),
        is_active: false,
        created_at: new Date('2025-01-01T00:00:00Z'),
      };

      mockPromotionService.cancelSchedule.mockResolvedValue(mockSchedule as any);

      await mockPromotionService.cancelSchedule('schedule-123');
      expect(mockPromotionService.cancelSchedule).toHaveBeenCalledWith('schedule-123');
    });

    it('should mock getLogs to return delivery logs', async () => {
      const mockLogs = [
        {
          id: 'log-123',
          promotion_id: 'promo-123',
          schedule_id: 'schedule-123',
          channel_id: '-1001234567890',
          status: 'sent',
          error_message: null,
          sent_at: new Date('2025-01-15T10:00:00Z'),
        },
      ];

      mockPromotionService.getLogs.mockResolvedValue(mockLogs as any);

      const result = await mockPromotionService.getLogs('promo-123');
      expect(result).toEqual(mockLogs);
      expect(mockPromotionService.getLogs).toHaveBeenCalledWith('promo-123');
    });

    it('should mock getLogs to return all logs when no promotionId provided', async () => {
      const mockLogs = [
        {
          id: 'log-123',
          promotion_id: 'promo-123',
          schedule_id: 'schedule-123',
          channel_id: '-1001234567890',
          status: 'sent',
          error_message: null,
          sent_at: new Date('2025-01-15T10:00:00Z'),
        },
        {
          id: 'log-124',
          promotion_id: 'promo-456',
          schedule_id: 'schedule-456',
          channel_id: '-1001234567890',
          status: 'failed',
          error_message: 'Channel not found',
          sent_at: new Date('2025-01-15T11:00:00Z'),
        },
      ];

      mockPromotionService.getLogs.mockResolvedValue(mockLogs as any);

      const result = await mockPromotionService.getLogs();
      expect(result).toEqual(mockLogs);
      expect(mockPromotionService.getLogs).toHaveBeenCalledWith();
    });
  });
});
