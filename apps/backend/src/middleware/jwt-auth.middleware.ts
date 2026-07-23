// JWT authentication middleware for player routes
// Verifies the Bearer token issued by /api/auth/login and attaches req.player

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
 */
export function jwtAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
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

  try {
    const payload = jwt.verify(token, jwtSecret) as { playerId: string };
    req.player = { playerId: payload.playerId };
    next();
  } catch {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired token',
    });
  }
}
