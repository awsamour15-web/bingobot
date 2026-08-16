// Admin agent management routes
// Task 4.1: Create admin agents router with POST / endpoint

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { AgentService } from '../../services/agent.service.js';

const router: RouterType = Router();

// GET / — list all agents with summary information
// Protected by adminAuthMiddleware (applied in index.ts)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const agents = await AgentService.listAgents();
    res.status(200).json({ agents });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// GET /pending — list pending agent applications
// Protected by adminAuthMiddleware (applied in index.ts)
// NOTE: must be defined BEFORE GET /:id to avoid being shadowed by the param route
router.get('/pending', async (req: Request, res: Response): Promise<void> => {
  try {
    const pendingAgents = await AgentService.getPendingAgents();
    res.status(200).json({ agents: pendingAgents });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// GET /withdrawals — list pending agent commission withdrawals
router.get('/withdrawals', async (_req: Request, res: Response): Promise<void> => {
  try {
    const withdrawals = await AgentService.listPendingCommissionWithdrawals();
    res.status(200).json({ withdrawals });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// POST /withdrawals/:id/approve — approve an agent commission withdrawal request
router.post('/withdrawals/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'];
  const { txNumber } = req.body as { txNumber?: string };

  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Withdrawal ID is required' });
    return;
  }

  if (!txNumber || typeof txNumber !== 'string' || !txNumber.trim()) {
    res.status(400).json({ error: 'TX_NUMBER_REQUIRED', message: 'Transaction number is required' });
    return;
  }

  try {
    const withdrawal = await AgentService.approveAgentCommissionWithdrawal(id, txNumber);
    res.status(200).json({ success: true, withdrawal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Approval failed';
    res.status(404).json({ error: 'WITHDRAWAL_NOT_FOUND', message });
  }
});

// POST /withdrawals/:id/reject — reject an agent commission withdrawal request
router.post('/withdrawals/:id/reject', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'];

  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Withdrawal ID is required' });
    return;
  }

  try {
    const result = await AgentService.rejectAgentCommissionWithdrawal(id);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rejection failed';
    res.status(404).json({ error: 'WITHDRAWAL_NOT_FOUND', message });
  }
});

// GET /:id — get agent detail
// Protected by adminAuthMiddleware (applied in index.ts)
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Agent ID is required' });
    return;
  }

  try {
    const agentDetail = await AgentService.getAgentDetail(id);
    res.status(200).json({ agent: agentDetail });
  } catch (err) {
    // Check if this is a "not found" error from Prisma
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
      res.status(404).json({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// POST / — create new agent
// Protected by adminAuthMiddleware (applied in index.ts)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { telegramUsername } = req.body as { telegramUsername?: string };
  
  if (!telegramUsername || typeof telegramUsername !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'telegramUsername is required' });
    return;
  }

  try {
    const agent = await AgentService.createAgent(telegramUsername);
    const botUsername = process.env['BOT_USERNAME'] ?? '';
    
    res.status(201).json({
      agent: {
        id: agent.id,
        telegramUsername: agent.telegram_username,
        agentInviteLink: `https://t.me/${botUsername}?start=agent_${agent.id}`,
        playerInviteLink: `https://t.me/${botUsername}?start=ref_agent_${agent.id}`,
        isActive: agent.is_active,
        createdAt: agent.created_at.toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// PATCH /:id/suspend — suspend an agent (set is_active to false)
// Protected by adminAuthMiddleware (applied in index.ts)
router.patch('/:id/suspend', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Agent ID is required' });
    return;
  }

  try {
    await AgentService.setAgentStatus(id, false);
    res.status(200).json({ ok: true });
  } catch (err) {
    // Check if this is a "not found" error from Prisma
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
      res.status(404).json({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// PATCH /:id/restore — restore/activate an agent (set is_active to true)
// Protected by adminAuthMiddleware (applied in index.ts)
router.patch('/:id/restore', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Agent ID is required' });
    return;
  }

  try {
    await AgentService.setAgentStatus(id, true);
    res.status(200).json({ ok: true });
  } catch (err) {
    // Check if this is a "not found" error from Prisma
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
      res.status(404).json({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// POST /:id/approve — approve pending agent application
// Protected by adminAuthMiddleware (applied in index.ts)
router.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Agent ID is required' });
    return;
  }

  try {
    const adminId = req.admin?.adminId || 'system';
    const agent = await AgentService.approveAgent(id, adminId);
    res.status(200).json({ 
      ok: true,
      agent: {
        id: agent.id,
        approvalStatus: agent.approval_status,
        approvedAt: agent.approved_at?.toISOString(),
      }
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
      res.status(404).json({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// POST /:id/reject — reject pending agent application
// Protected by adminAuthMiddleware (applied in index.ts)
router.post('/:id/reject', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Agent ID is required' });
    return;
  }

  try {
    const adminId = req.admin?.adminId || 'system';
    const agent = await AgentService.rejectAgent(id, adminId);
    res.status(200).json({ 
      ok: true,
      agent: {
        id: agent.id,
        approvalStatus: agent.approval_status,
      }
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
      res.status(404).json({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

export default router;