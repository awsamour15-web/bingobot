// POST /api/cashier/auth/login — Cashier username/password authentication

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'username and password are required' });
    return;
  }

  const jwtSecret = process.env['JWT_ADMIN_SECRET'] ?? process.env['JWT_SECRET'];
  if (!jwtSecret) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Server configuration error' });
    return;
  }

  const cashier = await prisma.cashier.findUnique({
    where: { username },
    select: { id: true, password_hash: true, is_active: true, display_name: true },
  });

  if (!cashier || !cashier.is_active) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    return;
  }

  const valid = await bcrypt.compare(password, cashier.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    return;
  }

  const token = jwt.sign(
    { cashierId: cashier.id, role: 'cashier' },
    jwtSecret,
    { expiresIn: '12h' },
  );

  res.status(200).json({ token, cashierId: cashier.id, displayName: cashier.display_name });
});

export default router;
