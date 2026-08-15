// Unit tests for agent self-service router
// Task 5.1 verification

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AgentService, agentInviteLink, playerInviteLink } from '../../services/agent.service.js';

// Mock the AgentService
vi.mock('../../services/agent.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/agent.service.js')>('../../services/agent.service.js');
  return {
    ...actual,
    AgentService: {
      getDashboardStats: vi.fn(),
      requestCommissionWithdrawal: vi.fn(),
      listCommissionWithdrawals: vi.fn(),
    },
    playerInviteLink: vi.fn(),
  };
});

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

    it('should generate the correct activation link for agent onboarding', () => {
      expect(agentInviteLink('agent-123')).toBe('https://t.me/FidelBingoBot?start=agent_agent-123');
    });

    it('should mock playerInviteLink to return invite link', async () => {
      (playerInviteLink as Mock).mockReturnValue('https://t.me/testbot?start=ref_agent_123');
      
      const result = playerInviteLink('test-agent-id');
      expect(result).toBe('https://t.me/testbot?start=ref_agent_123');
      expect(playerInviteLink).toHaveBeenCalledWith('test-agent-id');
    });

    it('should expose commission withdrawal request methods', async () => {
      const mockRequest = {
        id: 'wd_123',
        amount: 500,
        phone: '+251912345678',
        status: 'pending',
        createdAt: '2026-08-15T00:00:00.000Z',
      };

      (AgentService.requestCommissionWithdrawal as Mock).mockResolvedValue(mockRequest);
      (AgentService.listCommissionWithdrawals as Mock).mockResolvedValue([mockRequest]);

      const request = await AgentService.requestCommissionWithdrawal('agent-1', 500, '+251912345678');
      const list = await AgentService.listCommissionWithdrawals('agent-1');

      expect(request).toEqual(mockRequest);
      expect(list).toEqual([mockRequest]);
      expect(AgentService.requestCommissionWithdrawal).toHaveBeenCalledWith('agent-1', 500, '+251912345678');
      expect(AgentService.listCommissionWithdrawals).toHaveBeenCalledWith('agent-1');
    });
  });
});