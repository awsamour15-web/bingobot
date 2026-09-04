// apps/backend — Express + Socket.IO server entry point

// Load environment variables
import 'dotenv/config';

// BigInt serialization: Prisma returns telegram_id as BigInt; JSON.stringify
// doesn't handle BigInt natively, so we patch toJSON globally to convert to string.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

import { createServer } from 'node:http';
import express, { type Express } from 'express';
import authRouter from './routes/auth.router.js';
import playersRouter from './routes/players.router.js';
import roundsRouter from './routes/rounds.router.js';
import historyRouter from './routes/history.router.js';
import walletRouter from './routes/wallet.router.js';
import referralRouter from './routes/referral.router.js';
import systemRouter from './routes/system.router.js';
import leaderboardRouter from './routes/leaderboard.router.js';
import adminAuthRouter from './routes/admin/auth.admin.router.js';
import adminPlayersRouter from './routes/admin/players.admin.router.js';
import adminRoundsRouter from './routes/admin/rounds.admin.router.js';
import adminFinanceRouter from './routes/admin/finance.admin.router.js';
import adminConfigRouter from './routes/admin/config.admin.router.js';
import adminDepositsRouter from './routes/admin/deposits.admin.router.js';
import adminDepositAccountsRouter from './routes/admin/deposit-accounts.admin.router.js';
import adminAgentsRouter from './routes/admin/agents.router.js';
import agentRouter from './routes/agent.router.js';
import promotionsAdminRouter from './routes/admin/promotions.admin.router.js';
import adminCartelasRouter from './routes/admin/cartelas.admin.router.js';
import broadcastTargetsRouter from './routes/admin/broadcast-targets.admin.router.js';
import adminMockPlayersRouter from './routes/admin/mock-players.admin.router.js';
import adminGamesRouter from './routes/admin/games.admin.router.js';
import adminCouponsRouter from './routes/admin/coupons.admin.router.js';
import crashRouter from './routes/crash.router.js';
import slotsRouter from './routes/slots.router.js';
import kenoRouter from './routes/keno.router.js';
import plinkoRouter from './routes/plinko.router.js';
import { jwtAdminMiddleware } from './middleware/admin-auth.middleware.js';
import { setupWebSocket } from './websocket/index.js';
import { bot } from './bot/index.js';
import { RoundScheduler } from './services/round-scheduler.service.js';
import { CleanupService } from './services/cleanup.service.js';
import { PromotionScheduler } from './services/promotion-scheduler.service.js';
import { kenoEngine } from './services/keno-engine.service.js';
import { errorHandler, notFoundHandler, setupGlobalErrorHandlers } from './lib/error-handler.js';

// Setup global error handlers for unhandled rejections and exceptions
setupGlobalErrorHandlers();

const app: Express = express();

// Trust the first proxy (required on Render/Heroku/etc. for rate limiting and IP detection)
app.set('trust proxy', 1);

const allowedOrigins = process.env['CORS_ORIGIN']
  ? process.env['CORS_ORIGIN'].split(',').map((o) => o.trim())
  : [
      'https://bingobot-mini-app.vercel.app',
      'https://bingobot-admin.vercel.app',
      'https://fidelbingo-admin.pages.dev',
    ];

// Manually set CORS headers on every response to ensure they are always present,
// including on error responses (401, 502, etc.) that would otherwise strip them.
app.use((req, res, next) => {
  const origin = req.headers['origin'];
  
  // Allow Telegram WebView origins (they don't send standard Origin headers)
  // Also allow configured origins
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin || origin === 'null') {
    // Telegram WebView and some mobile browsers don't send Origin header
    // Allow requests without origin (common in Telegram Mini Apps)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Cache-Control');

  // Respond immediately to preflight
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json());

// ─── Player Routes ────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/players', playersRouter);
app.use('/api/rounds', roundsRouter);
app.use('/api/history', historyRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/referral', referralRouter);
app.use('/api/system', systemRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/crash', crashRouter);
app.use('/api/slots', slotsRouter);
app.use('/api/keno', kenoRouter);
app.use('/api/plinko', plinkoRouter);

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin/players', jwtAdminMiddleware, adminPlayersRouter);
app.use('/api/admin/rounds', jwtAdminMiddleware, adminRoundsRouter);
app.use('/api/admin/deposits', jwtAdminMiddleware, adminDepositsRouter);
app.use('/api/admin/deposit-accounts', jwtAdminMiddleware, adminDepositAccountsRouter);
app.use('/api/admin/agents', jwtAdminMiddleware, adminAgentsRouter);
app.use('/api/admin', jwtAdminMiddleware, adminFinanceRouter);
app.use('/api/admin', jwtAdminMiddleware, adminConfigRouter);
app.use('/api/agent', agentRouter);
app.use('/api/admin/promotions', jwtAdminMiddleware, promotionsAdminRouter);
app.use('/api/admin/cartelas', jwtAdminMiddleware, adminCartelasRouter);
app.use('/api/admin/broadcast-targets', jwtAdminMiddleware, broadcastTargetsRouter);
app.use('/api/admin/mock-players', jwtAdminMiddleware, adminMockPlayersRouter);
app.use('/api/admin/games', jwtAdminMiddleware, adminGamesRouter);
app.use('/api/admin/coupons', jwtAdminMiddleware, adminCouponsRouter);
// broadcast-targets v2

// ─── Health check endpoint ────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Telegram Bot webhook route (must be registered before 404 handler) ──────
if (process.env['RENDER_EXTERNAL_URL'] && bot) {
  const webhookPath = '/telegram-webhook';
  let botReady = false;

  app.post(webhookPath, express.json(), (req, res) => {
    if (!botReady) {
      res.sendStatus(503);
      return;
    }
    bot!.handleUpdate(req.body)
      .then(() => res.sendStatus(200))
      .catch((err) => {
        console.error('[Bot] Webhook handler error:', err);
        res.sendStatus(200);
      });
  });

  setTimeout(async () => {
    try {
      await bot!.init();
      botReady = true;
      const fullUrl = `${process.env['RENDER_EXTERNAL_URL']}${webhookPath}`;
      await bot!.api.setWebhook(fullUrl, { drop_pending_updates: true });
      const info = await bot!.api.getMe();
      console.log(`[Bot] 🎉 Webhook set: ${fullUrl} as @${info.username}`);
    } catch (err: any) {
      console.error('[Bot] ❌ Failed to set webhook:', err?.description || err);
    }
  }, 3_000);
}

// ─── 404 Handler (must be after all routes) ──────────────────────────────────
app.use(notFoundHandler);

// ─── Global Error Handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

// ─── Bot health check endpoint ─────────────────────────────────────────────────
app.get('/bot-status', async (_req, res): Promise<void> => {
  try {
    if (!bot) {
      res.json({ status: 'no_bot', message: 'Bot not initialized' });
      return;
    }
    
    const me = await bot.api.getMe();
    
    // Try to get recent updates to test if polling is actually working
    let pollingStatus = 'unknown';
    try {
      await bot.api.getUpdates({ limit: 1, timeout: 1 });
      pollingStatus = 'active';
    } catch (pollErr: any) {
      pollingStatus = pollErr?.error_code === 409 ? 'conflict' : 'error';
    }
    
    res.json({ 
      status: 'ok', 
      bot_username: me.username,
      bot_id: me.id,
      polling_status: pollingStatus,
      message: 'Bot API is responsive',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.json({ 
      status: 'error', 
      message: error?.description || error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// ─── Force bot restart endpoint (emergency use) ────────────────────────────────
app.post('/force-restart-bot', async (_req, res): Promise<void> => {
  try {
    if (!bot) {
      res.json({ status: 'no_bot', message: 'Bot not initialized' });
      return;
    }
    
    console.log('[API] Force restart requested via endpoint');
    
    // Try to stop current bot
    try {
      await bot.stop();
      console.log('[API] Bot stopped');
    } catch (stopErr) {
      console.log('[API] Bot stop failed or already stopped');
    }
    
    // Force clear everything
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Restart
    await bot.start({
      onStart: (info) => {
        console.log(`[API] Force restart success as @${info.username}`);
      }
    });
    
    res.json({ 
      status: 'restarted', 
      message: 'Bot force restart completed',
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[API] Force restart failed:', error);
    res.json({ 
      status: 'error', 
      message: error?.description || error?.message || 'Restart failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ─── Self-ping to prevent Render free tier from sleeping ─────────────────────
const SELF_URL = process.env['RENDER_EXTERNAL_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3000}`;
setInterval(() => {
  fetch(`${SELF_URL}/health`)
    .then(() => console.log('[KeepAlive] Pinged self'))
    .catch(() => {}); // silently ignore errors
}, 4 * 60 * 1000); // every 4 minutes (keep Render free tier awake)

// ─── HTTP server (shared with Socket.IO) ─────────────────────────────────────
const httpServer = createServer(app);

// ─── WebSocket ────────────────────────────────────────────────────────────────
setupWebSocket(httpServer);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`Backend listening on port ${PORT}`);
  // Seed default config values if not already set
  void (async () => {
    try {
      const prismaLib = await import('./lib/prisma.js');
      const db = prismaLib.default;
      const defaults: { key: string; value: string }[] = [
        { key: 'crash_max_multiplier', value: '40' },
        { key: 'house_edge_crash',     value: '15' },
      ];
      for (const { key, value } of defaults) {
        await db.config.upsert({
          where: { key },
          update: {},          // don't overwrite if already set by admin
          create: { key, value },
        });
      }
    } catch { /* non-fatal */ }
  })();
  // Start auto-round scheduler after server is up
  RoundScheduler.start();
  // Start cleanup service for expired reservations
  CleanupService.start();
  // Start promotion scheduler
  PromotionScheduler.start();
});

// ─── Telegram Bot — polling for local dev (webhook handled above for production) ───
if (bot && !process.env['RENDER_EXTERNAL_URL']) {
  // ── Local dev: use long polling
  let botStarted = false;

  async function startPolling(): Promise<void> {
    if (botStarted) return;
    try {
      console.log('[Bot] Starting long polling...');
      await bot!.api.deleteWebhook({ drop_pending_updates: true });
      await bot!.start({
        onStart: (info) => {
          console.log(`[Bot] 🎉 Polling started as @${info.username}`);
          botStarted = true;
        },
        drop_pending_updates: true,
      });
    } catch (err: any) {
      const errorCode = err?.error_code;
      console.error(`[Bot] ❌ Polling failed (${errorCode}):`, err?.description || err);
      if (errorCode === 409) {
        console.log('[Bot] Conflict — retrying in 65s...');
        setTimeout(() => startPolling(), 65_000);
      }
    }
  }

  setTimeout(() => startPolling(), 3_000);
}

export default app;
