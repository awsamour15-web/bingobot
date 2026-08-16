import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { BroadcastTargetService } from '../../services/broadcast-target.service.js';

const router: RouterType = Router();

router.get('/', async (_req, res: Response): Promise<void> => {
  res.json(await BroadcastTargetService.list());
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const target = await BroadcastTargetService.create(req.body);
    res.status(201).json(target);
  } catch (err) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: (err as Error).message });
  }
});

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const target = await BroadcastTargetService.update(req.params['id']!, req.body);
    res.json(target);
  } catch (err) {
    res.status(400).json({ error: 'UPDATE_FAILED', message: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  await BroadcastTargetService.delete(req.params['id']!);
  res.json({ success: true });
});

export default router;
