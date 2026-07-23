// POST /api/admin/auth/login — Admin username/password authentication
// Requirements: 15.5

import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';

const router = Router();

/**
 * POST /api/admin/auth/login
 *
 * Body: { username: string, password: string }
 *
 * 1. Finds the admin by username.
 * 2. Verifies password with bcrypt.
 * 3. Returns a signed JWT containing { adminId, role }, expiring in 8 hours.
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'username and password are required' });
    return;
  }

  const jwtSecret = process.env['JWT_SECRET'];
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

  res.status(200).json({ token, adminId: admin.id, role: admin.role });
});

export default router;
