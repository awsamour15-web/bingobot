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
app.get('/bot-status', async (_req, res) => {
  try {
    if (!bot) {
      return res.json({ status: 'no_bot', message: 'Bot not initialized' });
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
// SIMPLIFIED: Force bot to start immediately after clearing webhook
if (bot) {
  console.log('[Bot] Immediate bot startup - bypassing wait');
  
  async function forceStartBot(): Promise<void> {
    try {
      console.log('[Bot] 1. Clearing any webhook...');
      await bot!.api.deleteWebhook({ drop_pending_updates: true });
      
      console.log('[Bot] 2. Getting pending updates to clear them...');
      await bot!.api.getUpdates({ offset: -1 });
      
      console.log('[Bot] 3. Starting polling...');
      await bot!.start({
        onStart: (info) => {
          console.log(`[Bot] ✅ Successfully started as @${info.username}`);
        },
        drop_pending_updates: false,
      });
    } catch (err: any) {
      console.error('[Bot] ❌ Failed to start:', err?.description || err?.message || err);
      
      // If it's a 409 conflict, wait and retry once
      if (err?.error_code === 409) {
        console.log('[Bot] 409 conflict detected - waiting 10s and retrying once...');
        setTimeout(async () => {
          try {
            await bot!.api.deleteWebhook({ drop_pending_updates: true });
            await bot!.start({ 
              onStart: (info) => console.log(`[Bot] ✅ Retry success as @${info.username}`)
            });
          } catch (retryErr: any) {
            console.error('[Bot] ❌ Retry also failed:', retryErr?.description || retryErr);
          }
        }, 10_000);
      }
    }
  }

  // Start immediately instead of waiting 35s
  forceStartBot();
}

export default app;
