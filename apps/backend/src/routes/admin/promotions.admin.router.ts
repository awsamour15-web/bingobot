// Admin promotion management endpoints
import { Router, type Request, type Response, type Router as RouterType } from 'express';
import multer from 'multer';
import { InputFile } from 'grammy';
import { bot } from '../../bot/index.js';
import { PromotionService } from '../../services/promotion.service.js';
import { sendPromotionNow, retryFailedDeliveries } from '../../services/promotion-scheduler.service.js';

type PromotionContentType = 'text' | 'image' | 'video' | 'gif';
type PromotionStatus = 'active' | 'inactive';
type PromotionScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'interval';

const router: RouterType = Router();

// ─── File magic byte signatures for validation ────────────────────────────────
// MIME type from the client can be spoofed — verify actual file content.
const MAGIC_BYTES: Record<string, { bytes: number[]; mask?: number[] }[]> = {
  'image/jpeg': [{ bytes: [0xFF, 0xD8, 0xFF] }],
  'image/png':  [{ bytes: [0x89, 0x50, 0x4E, 0x47] }],
  'image/webp': [{ bytes: [0x52, 0x49, 0x46, 0x46] }], // RIFF....WEBP
  'image/gif':  [{ bytes: [0x47, 0x49, 0x46, 0x38] }], // GIF8
  'video/mp4':  [
    { bytes: [0x66, 0x74, 0x79, 0x70], mask: [0, 0, 0, 0, 0xFF, 0xFF, 0xFF, 0xFF] }, // ftyp at offset 4
  ],
};

function validateMagicBytes(buffer: Buffer, mime: string): boolean {
  const sigs = MAGIC_BYTES[mime];
  if (!sigs) return false;
  for (const sig of sigs) {
    const offset = sig.mask ? sig.mask.findIndex((b) => b === 0) : 0;
    const slice = buffer.slice(offset, offset + sig.bytes.length);
    if (sig.bytes.every((b, i) => slice[i] === b)) return true;
  }
  // mp4 special case: ftyp box appears at offset 4
  if (mime === 'video/mp4' && buffer.length >= 8) {
    const ftyp = buffer.slice(4, 8);
    if (ftyp.toString('ascii') === 'ftyp') return true;
  }
  return false;
}

// Multer — memory storage, 10 MB limit, images/video/gif only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /upload-media — upload a file to Telegram and return its file_id
// Requires MEDIA_UPLOAD_CHAT_ID env var (any chat/channel the bot is a member of)
router.post('/upload-media', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'NO_FILE', message: 'No file provided' }); return; }

    // Validate actual file content against magic bytes (MIME type from client can be spoofed)
    if (!validateMagicBytes(req.file.buffer, req.file.mimetype)) {
      res.status(400).json({ error: 'INVALID_FILE', message: 'File content does not match declared type' });
      return;
    }

    if (!bot) { res.status(503).json({ error: 'BOT_UNAVAILABLE', message: 'Bot not initialized' }); return; }

    const chatId = process.env['MEDIA_UPLOAD_CHAT_ID'];
    if (!chatId) { res.status(503).json({ error: 'NO_UPLOAD_CHAT', message: 'MEDIA_UPLOAD_CHAT_ID not configured' }); return; }

    const inputFile = new InputFile(req.file.buffer, req.file.originalname);
    const mime = req.file.mimetype;

    let file_id: string;
    let content_type: 'image' | 'video' | 'gif';

    if (mime === 'image/gif') {
      const msg = await bot.api.sendAnimation(chatId, inputFile);
      file_id = msg.animation.file_id;
      content_type = 'gif';
    } else if (mime === 'video/mp4') {
      const msg = await bot.api.sendVideo(chatId, inputFile);
      file_id = msg.video.file_id;
      content_type = 'video';
    } else {
      const msg = await bot.api.sendPhoto(chatId, inputFile);
      file_id = msg.photo[msg.photo.length - 1]!.file_id;
      content_type = 'image';
    }

    res.json({ file_id, content_type });
  } catch (err) {
    const message = (err as Error).message;
    console.error('[upload-media] Telegram upload failed:', message);
    res.status(500).json({ error: 'UPLOAD_FAILED', message });
  }
});

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

// DELETE /:id/schedules/used — purge inactive/completed schedules for a promotion
router.delete('/:id/schedules/used', async (req: Request, res: Response): Promise<void> => {
  const deleted = await PromotionService.deleteUsedSchedules(req.params['id'] as string);
  res.json({ deleted });
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

// DELETE /:id — delete a promotion
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await PromotionService.deletePromotion(req.params['id'] as string);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'DELETE_FAILED', message: (err as Error).message });
  }
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

// POST /:id/send-now — send promotion to selected targets
router.post('/:id/send-now', async (req: Request, res: Response): Promise<void> => {
  try {
    const { targets } = req.body as { targets: import('../../services/promotion-scheduler.service.js').SendTarget[] };
    if (!Array.isArray(targets) || targets.length === 0) {
      res.status(400).json({ error: 'TARGETS_REQUIRED', message: 'Provide at least one target' });
      return;
    }
    const promotionId = req.params['id'] as string;
    const hasBroadcast = targets.some(t => t.type === 'bot_broadcast');

    if (hasBroadcast) {
      // bot_broadcast can take minutes for large player bases — respond immediately
      // and run in background to avoid Render proxy timeouts.
      res.json({ status: 'queued', message: 'Broadcast started in background. Check delivery logs for results.' });
      sendPromotionNow(promotionId, targets).then((result) => {
        console.log(`[send-now] ${promotionId} done — sent: ${result.sent}, failed: ${result.failed}`);
      }).catch((err) => {
        console.error(`[send-now] ${promotionId} failed — ${(err as Error).message}`);
      });
    } else {
      // Channel sends are fast (1–few targets) — wait and return real results.
      const result = await sendPromotionNow(promotionId, targets);
      res.json(result);
    }
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
    const body = req.body as { channel_ids: string[]; frequency: PromotionScheduleFrequency; send_at: string; interval_minutes?: number };
    const schedule = await PromotionService.createSchedule(req.params['id'] as string, {
      channel_ids: body.channel_ids,
      frequency: body.frequency,
      send_at: new Date(body.send_at),
      ...(body.interval_minutes != null ? { interval_minutes: body.interval_minutes } : {}),
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
