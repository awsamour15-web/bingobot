// Agent JWT authentication middleware
// Requirements: 8.1, 8.3, 8.4

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

// ─── Type augmentation ────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      agent?: { agentId: string };
    }
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Reads `Authorization: Bearer <agentToken>`, verifies with JWT_SECRET,
 * checks payload.role === 'agent', and attaches `{ agentId }` to `req.agent`.
 * Returns 401 if token is missing/invalid, 403 if agent is suspended.
 */
export async function agentAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const jwtSecret = process.env['JWT_SECRET'];

  if (!jwtSecret) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Server configuration error' });
    return;
  }

  let payload: { agentId: string; role: string };
  try {
    payload = jwt.verify(token, jwtSecret) as { agentId: string; role: string };
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    return;
  }

  if (payload.role !== 'agent') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Agent token required' });
    return;
  }

  // Check agent exists, is active, and is approved
  const agent = await prisma.agent.findUnique({
    where: { id: payload.agentId },
    select: { is_active: true, approval_status: true },
  });

  if (!agent) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Agent not found' });
    return;
  }

  if (!agent.is_active) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Agent account is suspended' });
    return;
  }

  if (agent.approval_status !== 'approved') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Agent application is pending approval' });
    return;
  }

  req.agent = { agentId: payload.agentId };
  next();
}
