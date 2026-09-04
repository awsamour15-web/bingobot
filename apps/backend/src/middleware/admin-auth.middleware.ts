// Admin JWT authentication and role-guard middleware
// Requirements: 15.5

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ─── Type augmentation ────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      admin?: { adminId: string; role: string };
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the secret used to sign/verify admin JWTs.
 * Prefers JWT_ADMIN_SECRET (separate key for admin tokens) and falls back to
 * JWT_SECRET for backward compatibility during a rolling deployment.
 * Using a dedicated admin secret means a leaked player JWT cannot be replayed
 * against admin endpoints even if the token payload were manipulated.
 */
function getAdminJwtSecret(): string | undefined {
  return process.env['JWT_ADMIN_SECRET'] ?? process.env['JWT_SECRET'];
}

// ─── JWT Admin Middleware ─────────────────────────────────────────────────────

/**
 * Reads `Authorization: Bearer <token>`, verifies with JWT_ADMIN_SECRET
 * (falling back to JWT_SECRET), and attaches `{ adminId, role }` to
 * `req.admin`. Returns 401 on any failure.
 */
export function jwtAdminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const jwtSecret = getAdminJwtSecret();

  if (!jwtSecret) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Server configuration error' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as { adminId: string; role: string };
    if (!payload.adminId) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid admin token' });
      return;
    }
    req.admin = { adminId: payload.adminId, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}

// ─── Super Admin Role Guard ────────────────────────────────────────────────────

/**
 * Middleware that requires the authenticated admin to have `super_admin` role.
 * Must be used after `jwtAdminMiddleware`.
 */
export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.admin?.role !== 'super_admin') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Super admin role required' });
    return;
  }
  next();
}
