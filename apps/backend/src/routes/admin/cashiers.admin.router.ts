// Admin cashier management routes

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byId = (id: string) => ({ id } as unknown as any);

// GET / — list all cashiers
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const cashiers = await prisma.cashier.findMany({
    orderBy: { created_at: 'desc' },
    select: { id: true, username: true, display_name: true, is_active: true, created_at: true },
  });
  res.json({ cashiers });
});

// POST / — create cashier
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { username, password, displayName } = req.body as {
    username?: string;
    password?: string;
    displayName?: string;
  };

  if (!username?.trim() || !password?.trim()) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'username and password are required' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters' });
    return;
  }

  const password_hash = await bcrypt.hash(password, 12);

  try {
    const cashier = await prisma.cashier.create({
      data: {
        username: username.trim().toLowerCase(),
        password_hash,
        display_name: displayName?.trim() ?? username.trim(),
      },
      select: { id: true, username: true, display_name: true, is_active: true, created_at: true },
    });
    res.status(201).json({ cashier });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      res.status(409).json({ error: 'DUPLICATE_USERNAME', message: 'Username already exists' });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: String(err) });
  }
});

// PATCH /:id/suspend
router.patch('/:id/suspend', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  try {
    await prisma.cashier.update({ where: byId(id), data: { is_active: false } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Cashier not found' });
  }
});

// PATCH /:id/restore
router.patch('/:id/restore', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  try {
    await prisma.cashier.update({ where: byId(id), data: { is_active: true } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Cashier not found' });
  }
});

// PATCH /:id/reset-password
router.patch('/:id/reset-password', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  const { password } = req.body as { password?: string };

  if (!password || password.length < 6) {
    res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters' });
    return;
  }

  const password_hash = await bcrypt.hash(password, 12);
  try {
    await prisma.cashier.update({ where: byId(id), data: { password_hash } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Cashier not found' });
  }
});

// GET /link/:id — get the Telegram deep-link for a cashier to open the cashier app
router.get('/link/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  const cashier = await prisma.cashier.findUnique({
    where: byId(id),
    select: { id: true, username: true },
  });
  if (!cashier) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Cashier not found' });
    return;
  }
  const botUsername = process.env['BOT_USERNAME'];
  if (!botUsername) {
    res.status(503).json({ error: 'NOT_CONFIGURED', message: 'BOT_USERNAME not set' });
    return;
  }
  res.json({
    deepLink: `https://t.me/${botUsername}?start=cashier`,
    miniAppUrl: `${process.env['MINI_APP_URL'] ?? ''}#/cashier`,
  });
});

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  try {
    await prisma.cashier.delete({ where: byId(id) });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Cashier not found' });
  }
});

export default router;
