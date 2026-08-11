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
// AGGRESSIVE: Force kill all existing polling and start fresh
if (bot) {
  let botStarted = false;
  
  async function forceKillAndStartBot(): Promise<void> {
    if (botStarted) return;
    
    try {
      console.log('[Bot] FORCE: Aggressive webhook/polling cleanup...');
      
      // Step 1: Delete webhook multiple times to ensure cleanup
      for (let i = 0; i < 3; i++) {
        try {
          await bot!.api.deleteWebhook({ drop_pending_updates: true });
          console.log(`[Bot] Webhook cleanup attempt ${i + 1}/3 success`);
        } catch (err: any) {
          console.log(`[Bot] Webhook cleanup attempt ${i + 1}/3 failed:`, err?.description || 'unknown');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Step 2: Get updates with high offset to clear ALL pending messages
      try {
        console.log('[Bot] Clearing all pending updates...');
        await bot!.api.getUpdates({ offset: 999999999, limit: 100 });
      } catch (err: any) {
        console.log('[Bot] Clear updates failed:', err?.description || 'unknown');
      }
      
      // Step 3: Wait and try polling
      console.log('[Bot] Starting fresh polling after cleanup...');
      await bot!.start({
        onStart: (info) => {
          console.log(`[Bot] 🎉 FRESH START SUCCESS as @${info.username}`);
          botStarted = true;
        },
        drop_pending_updates: true,
      });
      
    } catch (err: any) {
      const errorCode = err?.error_code;
      console.error(`[Bot] ❌ Fresh start failed (${errorCode}):`, err?.description || err);
      
      if (errorCode === 409 && !botStarted) {
        console.log('[Bot] STILL CONFLICT - waiting 60s for ALL old instances to timeout...');
        setTimeout(async () => {
          try {
            // Nuclear option: wait for all long-polls to timeout (60s) then retry
            console.log('[Bot] FINAL NUCLEAR ATTEMPT after 60s wait...');
            
            // Multiple cleanup attempts
            for (let i = 0; i < 5; i++) {
              try {
                await bot!.api.deleteWebhook({ drop_pending_updates: true });
                console.log(`[Bot] Nuclear cleanup attempt ${i + 1}/5 success`);
              } catch (cleanupErr: any) {
                console.log(`[Bot] Nuclear cleanup attempt ${i + 1}/5 failed:`, cleanupErr?.description);
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            await bot!.start({
              onStart: (info) => {
                console.log(`[Bot] 🚀 NUCLEAR SUCCESS as @${info.username}`);
                botStarted = true;
              },
              drop_pending_updates: true,
            });
          } catch (nuclearErr: any) {
            console.error('[Bot] 💥 NUCLEAR FAILED:', nuclearErr?.description || nuclearErr);
            console.error('[Bot] 🔥 MANUAL INTERVENTION REQUIRED - BOT POLLING IS COMPLETELY BROKEN');
          }
        }, 60_000); // Wait 60s for old long-polls to expire
      }
    }
  }

  // Start after brief server initialization delay
  setTimeout(() => forceKillAndStartBot(), 3_000);
}

export default app;
