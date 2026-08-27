// Admin config and admin account management endpoints
// Requirements: 15.1, 15.2, 15.3, 15.6

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma.js';
import { requireSuperAdmin } from '../../middleware/admin-auth.middleware.js';
import { AdminRole } from '@fidel/shared';

const router: RouterType = Router();

// GET /api/admin/config — list all config keys
router.get('/config', async (_req: Request, res: Response): Promise<void> => {
  const configs = await prisma.config.findMany({ orderBy: { key: 'asc' } });
  res.json(configs);
});

// PUT /api/admin/config/:key — update a config value
router.put('/config/:key', async (req: Request, res: Response): Promise<void> => {
  const key = req.params['key'] as string;
  const { value } = req.body as { value?: string };

  if (value === undefined) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'value is required' });
    return;
  }

  // Requirements: 8.3 — validate claim_window_ms range
  if (key === 'claim_window_ms') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1000 || parsed > 30000) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'claim_window_ms must be between 1000 and 30000 ms' });
      return;
    }
  }

  // Validate call_interval_ms — minimum 1000ms to prevent rapid-fire calling
  if (key === 'call_interval_ms') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1000 || parsed > 30000) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'call_interval_ms must be between 1000 and 30000 ms' });
      return;
    }
  }

  // Validate house edge keys — must be 5–50%
  if (key === 'house_edge_crash' || key === 'house_edge_slots' || key === 'house_edge_keno') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 5 || parsed > 50) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: `${key} must be between 5 and 50 (percent)` });
      return;
    }
  }

  const config = await prisma.config.upsert({
    where: { key },
    update: { value, updated_at: new Date() },
    create: { key, value },
  });

  res.json(config);
});

// GET /api/admin/admins — super_admin only: list all admins
router.get('/admins', requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  const admins = await prisma.admin.findMany({
    select: { id: true, username: true, role: true, is_active: true, created_at: true },
    orderBy: { created_at: 'desc' },
  });
  res.json(admins);
});

// POST /api/admin/admins — super_admin only: create a new admin
router.post('/admins', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const { username, password, role } = req.body as {
    username?: string;
    password?: string;
    role?: string;
  };

  if (!username || !password || !role) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'username, password, and role are required' });
    return;
  }

  if (!Object.values(AdminRole).includes(role as AdminRole)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid role' });
    return;
  }

  const password_hash = await bcrypt.hash(password, 12);

  try {
    const admin = await prisma.admin.create({
      data: { username, password_hash, role: role as AdminRole },
      select: { id: true, username: true, role: true, is_active: true, created_at: true },
    });
    res.status(201).json(admin);
  } catch {
    res.status(409).json({ error: 'CONFLICT', message: 'Username already exists' });
  }
});

// PATCH /api/admin/admins/:id — super_admin only: update an admin
router.patch('/admins/:id', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  const { password, role, is_active } = req.body as {
    password?: string;
    role?: string;
    is_active?: boolean;
  };

  const data: Record<string, unknown> = {};

  if (password) {
    data['password_hash'] = await bcrypt.hash(password, 12);
  }
  if (role) {
    if (!Object.values(AdminRole).includes(role as AdminRole)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid role' });
      return;
    }
    data['role'] = role;
  }
  if (is_active !== undefined) {
    data['is_active'] = is_active;
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'No updatable fields provided' });
    return;
  }

  const admin = await prisma.admin.update({
    where: { id },
    data,
    select: { id: true, username: true, role: true, is_active: true, created_at: true },
  }).catch(() => null);

  if (!admin) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Admin not found' });
    return;
  }

  res.json(admin);
});

export default router;
