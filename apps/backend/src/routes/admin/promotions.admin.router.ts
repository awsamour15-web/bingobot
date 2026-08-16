// Admin promotion management endpoints
import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { PromotionService } from '../../services/promotion.service.js';
import { sendPromotionNow, retryFailedDeliveries } from '../../services/promotion-scheduler.service.js';

type PromotionContentType = 'text' | 'image' | 'video' | 'gif';
type PromotionStatus = 'active' | 'inactive';
type PromotionScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

const router: RouterType = Router();

// ── Static routes MUST come before /:id ───────────────────────────────────────

// GET /logs — delivery logs (supports ?promotionId= filter, ?limit=)
router.get('/logs', async (req: Request, res: Response): Promise<void> => {
  const promotionId = req.query['promotionId'] as string | undefined;
  const limit = parseInt(req.query['limit'] as string) || 200;
  const logs = await PromotionService.getLogs(promotionId, limit);
  res.json(logs);
});

// GET /stats/global — aggregate KPI stats across all promotions
router.get('/stats/global', async (_req: Request, res: Response): Promise<void> => {
  const stats = await PromotionService.getGlobalStats();
  res.json(stats);
});

// DELETE /schedules/:scheduleId — cancel schedule
router.delete('/schedules/:scheduleId', async (req: Request, res: Response): Promise<void> => {
  await PromotionService.cancelSchedule(req.params['scheduleId'] as string);
  res.json({ success: true });
});

// ── Collection routes ──────────────────────────────────────────────────────────

// GET / — list all promotions
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const promotions = await PromotionService.list();
  res.json(promotions);
});

// POST / — create promotion
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const promotion = await PromotionService.create(req.body as {
      title: string;
      content_type: PromotionContentType;
      text_content?: string;
      media_file_id?: string;
      caption?: string;
    });
    res.status(201).json(promotion);
  } catch (err) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: (err as Error).message });
  }
});

// ── Per-promotion routes (:id) ────────────────────────────────────────────────

// GET /:id — get single promotion
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const promotion = await PromotionService.getById(req.params['id'] as string);
  if (!promotion) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json(promotion);
});

// PATCH /:id — update promotion content
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const promotion = await PromotionService.update(req.params['id'] as string, req.body);
    res.json(promotion);
  } catch (err) {
    res.status(400).json({ error: 'UPDATE_FAILED', message: (err as Error).message });
  }
});

// PATCH /:id/status — toggle active/inactive
router.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body as { status: PromotionStatus };
  if (!status) { res.status(400).json({ error: 'STATUS_REQUIRED' }); return; }
  const promotion = await PromotionService.setStatus(req.params['id'] as string, status);
  res.json(promotion);
});

// POST /:id/duplicate — clone a promotion
router.post('/:id/duplicate', async (req: Request, res: Response): Promise<void> => {
  try {
    const copy = await PromotionService.duplicate(req.params['id'] as string);
    res.status(201).json(copy);
  } catch (err) {
    res.status(400).json({ error: 'DUPLICATE_FAILED', message: (err as Error).message });
  }
});

// POST /:id/send-now — immediately send to selected targets
router.post('/:id/send-now', async (req: Request, res: Response): Promise<void> => {
  try {
    const { targets } = req.body as { targets: import('../../services/promotion-scheduler.service.js').SendTarget[] };
    if (!Array.isArray(targets) || targets.length === 0) {
      res.status(400).json({ error: 'TARGETS_REQUIRED', message: 'Provide at least one target' });
      return;
    }
    const result = await sendPromotionNow(req.params['id'] as string, targets);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'SEND_FAILED', message: (err as Error).message });
  }
});

// POST /:id/retry-failed — retry all failed deliveries
router.post('/:id/retry-failed', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await retryFailedDeliveries(req.params['id'] as string);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'RETRY_FAILED', message: (err as Error).message });
  }
});

// GET /:id/stats — per-promotion delivery stats
router.get('/:id/stats', async (req: Request, res: Response): Promise<void> => {
  const stats = await PromotionService.getStats(req.params['id'] as string);
  res.json(stats);
});

// GET /:id/schedules — list schedules
router.get('/:id/schedules', async (req: Request, res: Response): Promise<void> => {
  const schedules = await PromotionService.listSchedules(req.params['id'] as string);
  res.json(schedules);
});

// POST /:id/schedules — create schedule
router.post('/:id/schedules', async (req: Request, res: Response): Promise<void> => {
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

// GET /:id/bonus/eligible — preview eligible players (dry run)
router.get('/:id/bonus/eligible', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await PromotionService.getEligiblePlayers(req.params['id'] as string);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'ELIGIBILITY_CHECK_FAILED', message: (err as Error).message });
  }
});

// POST /:id/bonus/apply — apply bonus to all eligible players
router.post('/:id/bonus/apply', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await PromotionService.applyBonusToEligiblePlayers(req.params['id'] as string);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'BONUS_APPLY_FAILED', message: (err as Error).message });
  }
});

// GET /:id/bonus/distributions — list who received this bonus
router.get('/:id/bonus/distributions', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await PromotionService.getBonusDistributions(req.params['id'] as string);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'FETCH_FAILED', message: (err as Error).message });
  }
});

export default router;
