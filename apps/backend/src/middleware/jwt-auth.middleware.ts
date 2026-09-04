// JWT authentication middleware for player routes
// Verifies the Bearer token issued by /api/auth/login and attaches req.player

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

// ─── Type augmentation ────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      player?: { playerId: string };
    }
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Reads `Authorization: Bearer <token>`, verifies with JWT_SECRET, and
 * attaches `{ playerId }` to `req.player`. Returns 401 on any failure.
 * Also checks that the player account is not suspended on every request —
 * this ensures suspension takes effect immediately without waiting for the
 * token to expire (up to 24h).
 */
export async function jwtAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing or malformed Authorization header',
    });
    return;
  }

  const token = authHeader.slice(7);
  const jwtSecret = process.env['JWT_SECRET'];

  if (!jwtSecret) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Server configuration error',
    });
    return;
  }

  let payload: { playerId: string };
  try {
    payload = jwt.verify(token, jwtSecret) as { playerId: string };
  } catch {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired token',
    });
    return;
  }

  // Per-request suspension check — ensures suspended players are blocked
  // immediately even if they hold a valid, non-expired JWT.
  const player = await prisma.player.findUnique({
    where: { id: payload.playerId },
    select: { id: true, is_suspended: true },
  });

  if (!player) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Player not found' });
    return;
  }

  if (player.is_suspended) {
    res.status(403).json({ error: 'PLAYER_SUSPENDED', message: 'Your account has been suspended.' });
    return;
  }

  req.player = { playerId: payload.playerId };
  next();
}
