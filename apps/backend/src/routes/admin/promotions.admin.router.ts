// Admin promotion management endpoints
import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { PromotionService } from '../../services/promotion.service.js';

type PromotionContentType = 'text' | 'image' | 'video' | 'gif';
type PromotionStatus = 'active' | 'inactive';
type PromotionScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

const router: RouterType = Router();

// GET /promotions
router.get('/promotions', async (_req: Request, res: Response): Promise<void> => {
  const promotions = await PromotionService.list();
  res.json(promotions);
});

// POST /promotions
router.post('/promotions', async (req: Request, res: Response): Promise<void> => {
  try {
    const promotion = await PromotionService.create(req.body as {
      title: string;
      content_type: PromotionContentType;
      text_content?: string;
      media_file_id?: string;
    });
    res.status(201).json(promotion);
  } catch (err) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: (err as Error).message });
  }
});

// PATCH /promotions/:id
router.patch('/promotions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const promotion = await PromotionService.update(req.params['id'] as string, req.body);
    res.json(promotion);
  } catch (err) {
    res.status(400).json({ error: 'UPDATE_FAILED', message: (err as Error).message });
  }
});

// PATCH /promotions/:id/status
router.patch('/promotions/:id/status', async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body as { status: PromotionStatus };
  if (!status) { res.status(400).json({ error: 'STATUS_REQUIRED' }); return; }
  const promotion = await PromotionService.setStatus(req.params['id'] as string, status);
  res.json(promotion);
});

// GET /promotions/:id/schedules
router.get('/promotions/:id/schedules', async (req: Request, res: Response): Promise<void> => {
  const schedules = await PromotionService.listSchedules(req.params['id'] as string);
  res.json(schedules);
});

// POST /promotions/:id/schedules
router.post('/promotions/:id/schedules', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { channel_ids: string[]; frequency: PromotionScheduleFrequency; send_at: string };
    const schedule = await PromotionService.createSchedule(req.params['id'] as string, {
      channel_ids: body.channel_ids,
      frequency: body.frequency,
      send_at: new Date(body.send_at),
    });
    res.status(201).json(schedule);
  } catch (err) {
    res.status(400).json({ error: 'SCHEDULE_FAILED', message: (err as Error).message });
  }
});

// DELETE /promotions/schedules/:scheduleId
router.delete('/promotions/schedules/:scheduleId', async (req: Request, res: Response): Promise<void> => {
  await PromotionService.cancelSchedule(req.params['scheduleId'] as string);
  res.json({ success: true });
});

// GET /promotions/logs
router.get('/promotions/logs', async (req: Request, res: Response): Promise<void> => {
  const promotionId = req.query['promotionId'] as string | undefined;
  const logs = await PromotionService.getLogs(promotionId);
  res.json(logs);
});

export default router;
