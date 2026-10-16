// JWT authentication middleware for player routes
// Verifies the Bearer token issued by /api/auth/login and attaches req.player

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

// ─── Short-lived suspension cache ─────────────────────────────────────────────
// Caches { exists, suspended } per playerId for 30s to avoid a DB round-trip
// on every authenticated request. Suspension changes take effect within 30s.
const SUSPENSION_CACHE_TTL_MS = 30_000;
const suspensionCache = new Map<string, { suspended: boolean; expiresAt: number }>();

export function getCachedSuspension(playerId: string): boolean | null {
  const entry = suspensionCache.get(playerId);
  if (!entry || Date.now() > entry.expiresAt) {
    suspensionCache.delete(playerId);
    return null;
  }
  return entry.suspended;
}

export function setCachedSuspension(playerId: string, suspended: boolean): void {
  suspensionCache.set(playerId, { suspended, expiresAt: Date.now() + SUSPENSION_CACHE_TTL_MS });
}

/** Immediately evict a player from the suspension cache (call after admin suspends a player). */
export function invalidateSuspensionCache(playerId: string): void {
  suspensionCache.delete(playerId);
}

// Periodically purge expired entries so the map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of suspensionCache) {
    if (now > entry.expiresAt) suspensionCache.delete(id);
  }
}, 60_000).unref();

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
  // Uses a 30s in-memory cache to avoid a DB hit on every request.
  const cached = getCachedSuspension(payload.playerId);
  if (cached === null) {
    // Cache miss — query DB and populate cache
    const player = await prisma.player.findUnique({
      where: { id: payload.playerId },
      select: { id: true, is_suspended: true },
    });

    if (!player) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Player not found' });
      return;
    }

    setCachedSuspension(payload.playerId, player.is_suspended);

    if (player.is_suspended) {
      res.status(403).json({ error: 'PLAYER_SUSPENDED', message: 'Your account has been suspended.' });
      return;
    }
  } else if (cached === true) {
    res.status(403).json({ error: 'PLAYER_SUSPENDED', message: 'Your account has been suspended.' });
    return;
  }

  req.player = { playerId: payload.playerId };
  next();
}
