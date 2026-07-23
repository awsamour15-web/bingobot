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

// ─── JWT Admin Middleware ─────────────────────────────────────────────────────

/**
 * Reads `Authorization: Bearer <token>`, verifies with JWT_SECRET, and
 * attaches `{ adminId, role }` to `req.admin`. Returns 401 on any failure.
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
  const jwtSecret = process.env['JWT_SECRET'];

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
