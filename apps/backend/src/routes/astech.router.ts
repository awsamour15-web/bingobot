// AS Tech API — player-facing routes
// GET  /api/astech/games      — list available games (cached)
// POST /api/astech/launch     — open a session and return game URL
// GET  /api/astech/sessions   — player's recent sessions

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../lib/prisma.js';
import { jwtAuthMiddleware } from '../middleware/jwt-auth.middleware.js';
import { getGameCatalog, openSession, ASTECH_CURRENCY } from '../services/astech.service.js';

const router: RouterType = Router();
router.use(jwtAuthMiddleware);

// ─── GET /api/astech/games ────────────────────────────────────────────────────

router.get('/games', async (req: Request, res: Response): Promise<void> => {
  const currency = (req.query['currency'] as string | undefined) ?? ASTECH_CURRENCY;
  const provider = req.query['provider'] as string | undefined;
  const category = req.query['category'] as string | undefined;

  try {
    const catalogArgs: { currency: string; provider?: string; category?: string } = { currency };
    if (provider !== undefined) catalogArgs.provider = provider;
    if (category !== undefined) catalogArgs.category = category;
    const games = await getGameCatalog(catalogArgs);
    res.json(games);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch games';
    console.error('[ASTech] getGameCatalog error:', msg);
    res.status(502).json({ error: 'UPSTREAM_ERROR', message: msg });
  }
});

// ─── POST /api/astech/launch ──────────────────────────────────────────────────

router.post('/launch', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;
  const { gameId, currency, language } = req.body as {
    gameId?:    string;
    currency?:  string;
    language?:  string;
  };

  if (!gameId) {
    res.status(400).json({ error: 'MISSING_GAME_ID', message: 'gameId is required' });
    return;
  }

  const player = await prisma.player.findUnique({
    where:  { id: playerId },
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

  try {
    const session = await openSession({
      playerLogin: playerId,          // use internal player UUID as the provider login
      gameId,
      currency: currency ?? ASTECH_CURRENCY,
      language: language ?? 'en',
    });

    // Resolve game title from catalog (best-effort, non-fatal)
    let gameTitle = gameId;
    try {
      const catalog = await getGameCatalog({ currency: currency ?? ASTECH_CURRENCY });
      gameTitle = catalog.find((g) => g.gameId === gameId)?.title ?? gameId;
    } catch { /* ignore */ }

    await prisma.asTechSession.create({
      data: {
        player_id:    playerId,
        session_id:   session.sessionId,
        game_id:      gameId,
        game_title:   gameTitle,
        currency:     currency ?? ASTECH_CURRENCY,
        player_login: playerId,
        embeddable:   session.embeddable,
        status:       'active',
      },
    });

    res.json({
      sessionId:  session.sessionId,
      gameUrl:    session.gameUrl,
      directUrl:  session.directUrl,
      embeddable: session.embeddable,
      gameTitle,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to launch game';
    console.error('[ASTech] launch error:', msg);
    res.status(502).json({ error: 'LAUNCH_FAILED', message: msg });
  }
});

// ─── GET /api/astech/sessions ─────────────────────────────────────────────────

router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  const playerId = req.player!.playerId;

  const sessions = await prisma.asTechSession.findMany({
    where:   { player_id: playerId },
    orderBy: { created_at: 'desc' },
    take:    20,
  });

  res.json(sessions.map((s) => ({
    id:         s.id,
    sessionId:  s.session_id,
    gameId:     s.game_id,
    gameTitle:  s.game_title,
    currency:   s.currency,
    embeddable: s.embeddable,
    status:     s.status,
    createdAt:  s.created_at.toISOString(),
    closedAt:   s.closed_at?.toISOString() ?? null,
  })));
});

export default router;
