// Admin cartela management endpoints — CRUD for CartelaDefinition

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

// GET /api/admin/cartelas?page=1&search=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1', 10));
  const search = (req.query['search'] as string) ?? '';
  const pageSize = 50;
  const skip = (page - 1) * pageSize;

  const parsedSearch = search ? parseInt(search, 10) : NaN;
  const where = !isNaN(parsedSearch)
    ? { cartela_number: parsedSearch }
    : {};

  const [items, total] = await Promise.all([
    prisma.cartelaDefinition.findMany({
      where,
      orderBy: { cartela_number: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.cartelaDefinition.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});

// GET /api/admin/cartelas/:num
router.get('/:num', async (req: Request, res: Response): Promise<void> => {
  const num = parseInt(req.params['num'] as string, 10);
  if (isNaN(num)) { res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid cartela number' }); return; }

  const cartela = await prisma.cartelaDefinition.findUnique({ where: { cartela_number: num } });
  if (!cartela) { res.status(404).json({ error: 'NOT_FOUND', message: 'Cartela not found' }); return; }

  res.json(cartela);
});

// POST /api/admin/cartelas — create a new cartela definition
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { cartela_number, grid } = req.body as { cartela_number?: number; grid?: number[] };

  if (!cartela_number || typeof cartela_number !== 'number') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'cartela_number is required' }); return;
  }
  if (!Array.isArray(grid) || grid.length !== 25) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'grid must be an array of 25 numbers' }); return;
  }

  const existing = await prisma.cartelaDefinition.findUnique({ where: { cartela_number } });
  if (existing) {
    res.status(409).json({ error: 'CONFLICT', message: `Cartela ${cartela_number} already exists` }); return;
  }

  const cartela = await prisma.cartelaDefinition.create({ data: { cartela_number, grid } });
  res.status(201).json(cartela);
});

// PUT /api/admin/cartelas/:num — update grid
router.put('/:num', async (req: Request, res: Response): Promise<void> => {
  const num = parseInt(req.params['num'] as string, 10);
  if (isNaN(num)) { res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid cartela number' }); return; }

  const { grid } = req.body as { grid?: number[] };
  if (!Array.isArray(grid) || grid.length !== 25) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'grid must be an array of 25 numbers' }); return;
  }

  const existing = await prisma.cartelaDefinition.findUnique({ where: { cartela_number: num } });
  if (!existing) { res.status(404).json({ error: 'NOT_FOUND', message: 'Cartela not found' }); return; }

  const cartela = await prisma.cartelaDefinition.update({ where: { cartela_number: num }, data: { grid } });
  res.json(cartela);
});

// DELETE /api/admin/cartelas/:num
router.delete('/:num', async (req: Request, res: Response): Promise<void> => {
  const num = parseInt(req.params['num'] as string, 10);
  if (isNaN(num)) { res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid cartela number' }); return; }

  const existing = await prisma.cartelaDefinition.findUnique({ where: { cartela_number: num } });
  if (!existing) { res.status(404).json({ error: 'NOT_FOUND', message: 'Cartela not found' }); return; }

  await prisma.cartelaDefinition.delete({ where: { cartela_number: num } });
  res.json({ success: true });
});

export default router;
