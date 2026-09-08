// Gregmorn Hub — player-facing routes
// GET  /api/gregmorn/games       — list available games
// POST /api/gregmorn/launch      — create session and return game URL
// GET  /api/gregmorn/sessions    — player's recent game sessions

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import {
  getGameCatalog,
  openGame,
  GREGMORN_CURRENCY,
  GREGMORN_USER_ID,
} from '../services/gregmorn.service.js';

const router: RouterType = Router();
router.use(jwtAuthMiddleware);

// ─── GET /api/gregmorn/games ─────────────────────────────────────────────────

router.get('/games', async (req: Request, res: Response): Promise<void> => {
  const currency = (req.query['currency'] as string | undefined) ?? GREGMORN_CURRENCY;
  try {
    const games = await getGameCatalog(currency);
    res.json(games.filter((g) => g.isEnabled));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch games';
    res.status(502).json({ error: 'UPSTREAM_ERROR', message: msg });
  }
});

// ─── POST /api/gregmorn/launch ────────────────────────────────────────────────

router.post('/launch', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;
  const { gameId, demo, language, currency } = req.body as {
    gameId?: string;
    demo?: '0' | '1';
    language?: string;
    currency?: string;
  };

  if (!gameId) {
    res.status(400).json({ error: 'MISSING_GAME_ID', message: 'gameId is required' });
    return;
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { username: true, is_suspended: true },
  });

  if (!player) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
    return;
  }

  if (player.is_suspended) {
    res.status(403).json({ error: 'PLAYER_SUSPENDED', message: 'Your account has been suspended.' });
    return;
  }

  const sessionCurrency = currency ?? GREGMORN_CURRENCY;

  try {
    const { gameUrl, sessionId } = await openGame({
      gameId,
      playerLogin: player.username,
      currency: sessionCurrency,
      language: language ?? 'en',
      demo: demo ?? '0',
    });

    // Resolve game title from catalog (best-effort)
    let gameTitle = gameId;
    try {
      const catalog = await getGameCatalog(sessionCurrency);
      gameTitle = catalog.find((g) => g.id === gameId)?.title ?? gameId;
    } catch { /* non-fatal */ }

    // Persist session
    await prisma.gregmornSession.create({
      data: {
        player_id: playerId,
        session_id: sessionId,
        game_id: gameId,
        game_title: gameTitle,
        currency: sessionCurrency,
        player_login: player.username,
        status: 'active',
      },
    });

    res.json({ gameUrl, sessionId, gameTitle });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to launch game';
    res.status(502).json({ error: 'LAUNCH_FAILED', message: msg });
  }
});

// ─── GET /api/gregmorn/sessions ───────────────────────────────────────────────

router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;

  const sessions = await prisma.gregmornSession.findMany({
    where: { player_id: playerId },
    orderBy: { created_at: 'desc' },
    take: 20,
  });

  res.json(sessions.map((s) => ({
    id: s.id,
    sessionId: s.session_id,
    gameId: s.game_id,
    gameTitle: s.game_title,
    currency: s.currency,
    status: s.status,
    createdAt: s.created_at.toISOString(),
    closedAt: s.closed_at?.toISOString() ?? null,
  })));
});

export default router;
