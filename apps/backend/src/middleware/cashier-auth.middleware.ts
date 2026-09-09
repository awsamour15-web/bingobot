// Cashier JWT authentication middleware

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      cashier?: { cashierId: string };
    }
  }
}

export function cashierAuthMiddleware(
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
  const jwtSecret = process.env['JWT_ADMIN_SECRET'] ?? process.env['JWT_SECRET'];

  if (!jwtSecret) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Server configuration error' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as { cashierId?: string; role?: string };
    if (!payload.cashierId || payload.role !== 'cashier') {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid cashier token' });
      return;
    }
    req.cashier = { cashierId: payload.cashierId };
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}
