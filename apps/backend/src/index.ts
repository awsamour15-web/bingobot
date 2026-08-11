// apps/backend — Express + Socket.IO server entry point

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
import adminAuthRouter from './routes/admin/auth.admin.router.js';
import adminPlayersRouter from './routes/admin/players.admin.router.js';
import adminRoundsRouter from './routes/admin/rounds.admin.router.js';
import adminFinanceRouter from './routes/admin/finance.admin.router.js';
import adminConfigRouter from './routes/admin/config.admin.router.js';
import adminDepositsRouter from './routes/admin/deposits.admin.router.js';
import adminAgentsRouter from './routes/admin/agents.router.js';
import agentRouter from './routes/agent.router.js';
import { jwtAdminMiddleware } from './middleware/admin-auth.middleware.js';
import { setupWebSocket } from './websocket/index.js';
import { bot } from './bot/index.js';
import { RoundScheduler } from './services/round-scheduler.service.js';
import { CleanupService } from './services/cleanup.service.js';

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
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

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

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin/players', jwtAdminMiddleware, adminPlayersRouter);
app.use('/api/admin/rounds', jwtAdminMiddleware, adminRoundsRouter);
app.use('/api/admin/deposits', jwtAdminMiddleware, adminDepositsRouter);
app.use('/api/admin/agents', jwtAdminMiddleware, adminAgentsRouter);
app.use('/api/admin', jwtAdminMiddleware, adminFinanceRouter);
app.use('/api/admin', jwtAdminMiddleware, adminConfigRouter);
app.use('/api/agent', agentRouter);

// ─── Health check endpoint ────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Bot health check endpoint ─────────────────────────────────────────────────
app.get('/bot-status', async (_req, res): Promise<void> => {
  try {
    if (!bot) {
      res.json({ status: 'no_bot', message: 'Bot not initialized' });
      return;
    }
    
    const me = await bot.api.getMe();
    res.json({ 
      status: 'ok', 
      bot_username: me.username,
      bot_id: me.id,
      message: 'Bot API is responsive' 
    });
  } catch (error: any) {
    res.json({ 
      status: 'error', 
      message: error?.description || error?.message || 'Unknown error' 
    });
  }
});

// ─── Self-ping to prevent Render free tier from sleeping ─────────────────────
const SELF_URL = process.env['RENDER_EXTERNAL_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3000}`;
setInterval(() => {
  fetch(`${SELF_URL}/health`)
    .then(() => console.log('[KeepAlive] Pinged self'))
    .catch(() => {}); // silently ignore errors
}, 10 * 60 * 1000); // every 10 minutes

// ─── HTTP server (shared with Socket.IO) ─────────────────────────────────────
const httpServer = createServer(app);

// ─── WebSocket ────────────────────────────────────────────────────────────────
setupWebSocket(httpServer);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env['PORT'] ?? 3000;

httpServer.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
  // Start auto-round scheduler after server is up
  RoundScheduler.start();
  // Start cleanup service for expired reservations
  CleanupService.start();
});

// ─── Telegram Bot (long polling) ─────────────────────────────────────────────
// FIXED: Single bot polling attempt with proper conflict handling
if (bot) {
  let botStarted = false;
  
  async function startBotOnce(): Promise<void> {
    if (botStarted) {
      console.log('[Bot] Already started, skipping...');
      return;
    }
    
    try {
      console.log('[Bot] Starting bot polling...');
      
      // Clear any existing webhook/polling locks
      await bot!.api.deleteWebhook({ drop_pending_updates: true });
      
      // Start polling
      await bot!.start({
        onStart: (info) => {
          console.log(`[Bot] ✅ Polling active as @${info.username}`);
          botStarted = true;
        },
        drop_pending_updates: true, // Clear old messages
      });
      
    } catch (err: any) {
      const errorCode = err?.error_code;
      const errorDesc = err?.description || err?.message || 'Unknown error';
      
      console.error(`[Bot] ❌ Start failed (${errorCode}): ${errorDesc}`);
      
      // For 409 conflicts, wait and try ONE more time only
      if (errorCode === 409 && !botStarted) {
        console.log('[Bot] 409 conflict - waiting 15s for cleanup...');
        setTimeout(async () => {
          try {
            console.log('[Bot] Final retry attempt...');
            await bot!.api.deleteWebhook({ drop_pending_updates: true });
            await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause
            await bot!.start({
              onStart: (info) => {
                console.log(`[Bot] ✅ Retry successful as @${info.username}`);
                botStarted = true;
              },
              drop_pending_updates: true,
            });
          } catch (retryErr: any) {
            console.error('[Bot] ❌ Final retry failed:', retryErr?.description || retryErr);
            console.error('[Bot] ❌ Bot polling is completely broken - manual intervention required');
          }
        }, 15_000);
      }
    }
  }

  // Start bot after a brief delay to ensure server is ready
  setTimeout(() => startBotOnce(), 2_000);
}

export default app;
