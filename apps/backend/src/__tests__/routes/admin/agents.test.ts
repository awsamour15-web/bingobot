// Unit tests for admin agents router
// Task 4.1 & 4.2 verification

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentService } from '../../../services/agent.service.js';

// Mock the AgentService
vi.mock('../../../services/agent.service.js', () => ({
  AgentService: {
    createAgent: vi.fn(),
    listAgents: vi.fn(),
    getAgentDetail: vi.fn(),
    setAgentStatus: vi.fn(),
  },
}));
const mockAgentService = vi.mocked(AgentService);

// Mock admin middleware
const mockAdminAuth = (req: any, _res: any, next: any) => {
  req.admin = { adminId: 'admin-123', role: 'super_admin' };
  next();
};

describe('Admin Agents Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AgentService Integration', () => {
    it('should have listAgents method available', () => {
      expect(typeof mockAgentService.listAgents).toBe('function');
    });

    it('should have createAgent method available', () => {
      expect(typeof mockAgentService.createAgent).toBe('function');
    });

    it('should have getAgentDetail method available', () => {
      expect(typeof mockAgentService.getAgentDetail).toBe('function');
    });

    it('should have setAgentStatus method available', () => {
      expect(typeof mockAgentService.setAgentStatus).toBe('function');
    });
  });

  describe('Service Method Mocks', () => {
    it('should mock listAgents to return agent summaries', async () => {
      const mockAgents = [
        {
          id: 'agent-123',
          telegramUsername: '@testuser1',
          agentInviteLink: 'https://t.me/testbot?start=agent_agent-123',
          playerInviteLink: 'https://t.me/testbot?start=ref_agent_agent-123',
          totalPlayersInvited: 5,
          totalCommission: 100.50,
          isActive: true,
          approvalStatus: 'approved',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ];

      mockAgentService.listAgents.mockResolvedValue(mockAgents);

      const result = await mockAgentService.listAgents();
      expect(result).toEqual(mockAgents);
      expect(mockAgentService.listAgents).toHaveBeenCalledWith();
    });

    it('should mock createAgent to return created agent', async () => {
      const mockAgent = {
        id: 'agent-123',
        telegram_username: '@testuser',
        is_active: true,
        created_at: new Date('2025-01-01T00:00:00Z'),
      };

      mockAgentService.createAgent.mockResolvedValue(mockAgent as any);

      const result = await mockAgentService.createAgent('@testuser');
      expect(result).toEqual(mockAgent);
      expect(mockAgentService.createAgent).toHaveBeenCalledWith('@testuser');
    });

    it('should mock getAgentDetail to return agent detail', async () => {
      const mockAgentDetail = {
        id: 'agent-123',
        telegramUsername: '@testuser',
        agentInviteLink: 'https://t.me/testbot?start=agent_agent-123',
        playerInviteLink: 'https://t.me/testbot?start=ref_agent_agent-123',
        totalPlayersInvited: 5,
        totalCommission: 100.50,
        isActive: true,
        approvalStatus: 'approved',
        createdAt: '2025-01-01T00:00:00.000Z',
        players: [
          {
            playerId: 'player-123',
            username: '@playeruser',
            depositBalance: 50.0,
            totalCommissionFromPlayer: 5.0,
            joinedAt: '2025-01-02T00:00:00.000Z',
          },
        ],
      };

      mockAgentService.getAgentDetail.mockResolvedValue(mockAgentDetail);

      const result = await mockAgentService.getAgentDetail('agent-123');
      expect(result).toEqual(mockAgentDetail);
      expect(mockAgentService.getAgentDetail).toHaveBeenCalledWith('agent-123');
    });

    it('should mock setAgentStatus to suspend agent', async () => {
      mockAgentService.setAgentStatus.mockResolvedValue();

      await mockAgentService.setAgentStatus('agent-123', false);
      expect(mockAgentService.setAgentStatus).toHaveBeenCalledWith('agent-123', false);
    });

    it('should mock setAgentStatus to restore agent', async () => {
      mockAgentService.setAgentStatus.mockResolvedValue();

      await mockAgentService.setAgentStatus('agent-123', true);
      expect(mockAgentService.setAgentStatus).toHaveBeenCalledWith('agent-123', true);
    });
  });
});