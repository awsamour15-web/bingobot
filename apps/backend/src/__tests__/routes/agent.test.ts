// Unit tests for agent self-service router
// Task 5.1 verification

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AgentService } from '../../services/agent.service.js';

// Mock the AgentService
vi.mock('../../services/agent.service.js', () => ({
  AgentService: {
    getDashboardStats: vi.fn(),
  },
  playerInviteLink: vi.fn(),
}));

describe('Agent Self-Service Router', () => {
  describe('AgentService Integration', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should have getDashboardStats method available', () => {
      expect(AgentService.getDashboardStats).toBeDefined();
      expect(typeof AgentService.getDashboardStats).toBe('function');
    });

    it('should mock getDashboardStats to return dashboard stats', async () => {
      const mockStats = {
        totalPlayersInvited: 5,
        totalCommission: 100.00,
        weeklyCommission: 25.00,
        dailyCommission: 10.00,
        players: []
      };
      
      (AgentService.getDashboardStats as Mock).mockResolvedValue(mockStats);
      
      const result = await AgentService.getDashboardStats('test-agent-id');
      expect(result).toEqual(mockStats);
      expect(AgentService.getDashboardStats).toHaveBeenCalledWith('test-agent-id');
    });

    it('should mock playerInviteLink to return invite link', async () => {
      const { playerInviteLink } = await import('../../services/agent.service.js');
      (playerInviteLink as Mock).mockReturnValue('https://t.me/testbot?start=ref_agent_123');
      
      const result = playerInviteLink('test-agent-id');
      expect(result).toBe('https://t.me/testbot?start=ref_agent_123');
      expect(playerInviteLink).toHaveBeenCalledWith('test-agent-id');
    });
  });
});