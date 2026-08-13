// Admin deposit accounts management
import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// GET /api/admin/deposit-accounts
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const accounts = await prisma.depositAccount.findMany({ orderBy: { created_at: 'desc' } });
  res.json(accounts);
});

// POST /api/admin/deposit-accounts
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { phone, name } = req.body as { phone?: string; name?: string };
  if (!phone?.trim() || !name?.trim()) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'phone and name are required' });
    return;
  }
  try {
    const account = await prisma.depositAccount.create({
      data: { phone: phone.trim(), name: name.trim() },
    });
    res.status(201).json(account);
  } catch {
    res.status(409).json({ error: 'DUPLICATE_PHONE', message: 'This phone number already exists' });
  }
});

// PATCH /api/admin/deposit-accounts/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  const { phone, name, is_active } = req.body as { phone?: string; name?: string; is_active?: boolean };

  const data: Record<string, unknown> = {};
  if (phone !== undefined) data['phone'] = phone.trim();
  if (name !== undefined) data['name'] = name.trim();
  if (is_active !== undefined) data['is_active'] = is_active;

  if (!Object.keys(data).length) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'No fields to update' });
    return;
  }

  const account = await prisma.depositAccount.update({ where: { id }, data }).catch(() => null);
  if (!account) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Deposit account not found' });
    return;
  }
  res.json(account);
});

// DELETE /api/admin/deposit-accounts/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params['id'] as string;
  const deleted = await prisma.depositAccount.delete({ where: { id } }).catch(() => null);
  if (!deleted) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Deposit account not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
