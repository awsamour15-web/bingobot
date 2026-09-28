// POST /api/admin/auth/login — Admin username/password authentication
// Requirements: 15.5

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// Rate limit: max 10 login attempts per 15 minutes per IP
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Try again in 15 minutes.' },
});

/**
 * POST /api/admin/auth/login
 *
 * Body: { username: string, password: string }
 *
 * 1. Finds the admin by username.
 * 2. Verifies password with bcrypt.
 * 3. Returns a signed JWT containing { adminId, role }, expiring in 8 hours.
 */
router.post('/login', loginRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'username and password are required' });
    return;
  }

  // Use JWT_ADMIN_SECRET if set (separate key from player tokens), fall back to JWT_SECRET
  const jwtSecret = process.env['JWT_ADMIN_SECRET'] ?? process.env['JWT_SECRET'];
  if (!jwtSecret) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Server configuration error' });
    return;
  }

  const admin = await prisma.admin.findUnique({
    where: { username },
    select: { id: true, password_hash: true, role: true, is_active: true },
  });

  if (!admin || !admin.is_active) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    return;
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    return;
  }

  const token = jwt.sign(
    { adminId: admin.id, role: admin.role },
    jwtSecret,
    { expiresIn: '8h' },
  );

  // Set token as HttpOnly cookie (prevents XSS token theft)
  res.cookie('adminToken', token, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] !== 'development',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    path: '/',
  });

  res.status(200).json({ token, adminId: admin.id, role: admin.role });
});

// POST /api/admin/auth/logout — clear the admin session cookie
router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('adminToken', { path: '/' });
  res.status(200).json({ ok: true });
});

export default router;
