// Agent self-service routes
// Requirements: 7.5, 7.6, 5.1–5.7

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { agentAuthMiddleware } from '../middleware/agent-auth.middleware.js';
import { AgentService, playerInviteLink } from '../services/agent.service.js';

const router: RouterType = Router();

// All routes require agent JWT
router.use(agentAuthMiddleware);

// GET /dashboard — agent stats
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await AgentService.getDashboardStats(req.agent!.agentId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// GET /invite-link — player invitation URL
router.get('/invite-link', (req: Request, res: Response): void => {
  res.json({ playerInviteLink: playerInviteLink(req.agent!.agentId) });
});

// GET /withdrawals — agent commission withdrawal requests
router.get('/withdrawals', async (req: Request, res: Response): Promise<void> => {
  try {
    const withdrawals = await AgentService.listCommissionWithdrawals(req.agent!.agentId);
    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// POST /withdrawals — request commission withdrawal to admin
router.post('/withdrawals', async (req: Request, res: Response): Promise<void> => {
  const { amount, phone } = req.body as { amount?: number; phone?: string };

  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    res.status(400).json({ error: 'INVALID_AMOUNT', message: 'A valid withdrawal amount is required' });
    return;
  }

  if (!phone || typeof phone !== 'string' || phone.trim() === '') {
    res.status(400).json({ error: 'PHONE_REQUIRED', message: 'Phone number is required' });
    return;
  }

  try {
    const withdrawal = await AgentService.requestCommissionWithdrawal(req.agent!.agentId, amount, phone);
    res.status(201).json({
      success: true,
      message: 'Commission withdrawal request sent to admin for approval.',
      withdrawal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to request withdrawal';
    const status = message.includes('minimum') || message.includes('Insufficient') || message.includes('suspended') || message.includes('not found') ? 422 : 400;
    res.status(status).json({ error: 'WITHDRAWAL_REQUEST_FAILED', message });
  }
});

export default router;
