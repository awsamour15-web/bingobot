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

export default router;
