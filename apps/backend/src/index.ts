// apps/backend — Express + Socket.IO server entry point

import { createServer } from 'node:http';
import express, { type Express } from 'express';
import cors from 'cors';
import authRouter from './routes/auth.router.js';
import playersRouter from './routes/players.router.js';
import roundsRouter from './routes/rounds.router.js';
import historyRouter from './routes/history.router.js';
import walletRouter from './routes/wallet.router.js';
import referralRouter from './routes/referral.router.js';
import adminAuthRouter from './routes/admin/auth.admin.router.js';
import adminPlayersRouter from './routes/admin/players.admin.router.js';
import adminRoundsRouter from './routes/admin/rounds.admin.router.js';
import adminFinanceRouter from './routes/admin/finance.admin.router.js';
import adminConfigRouter from './routes/admin/config.admin.router.js';
import { jwtAdminMiddleware } from './middleware/admin-auth.middleware.js';
import { setupWebSocket } from './websocket/index.js';
import { bot } from './bot/index.js';

const app: Express = express();

app.use(cors({
  origin: process.env['CORS_ORIGIN'] ?? '*',
  credentials: true,
}));
app.use(express.json());

// ─── Player Routes ────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/players', playersRouter);
app.use('/api/rounds', roundsRouter);
app.use('/api/history', historyRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/referral', referralRouter);

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin/players', jwtAdminMiddleware, adminPlayersRouter);
app.use('/api/admin/rounds', jwtAdminMiddleware, adminRoundsRouter);
app.use('/api/admin', jwtAdminMiddleware, adminFinanceRouter);
app.use('/api/admin', jwtAdminMiddleware, adminConfigRouter);

// ─── HTTP server (shared with Socket.IO) ─────────────────────────────────────
const httpServer = createServer(app);

// ─── WebSocket ────────────────────────────────────────────────────────────────
setupWebSocket(httpServer);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env['PORT'] ?? 3000;

httpServer.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

// ─── Telegram Bot (long polling) ─────────────────────────────────────────────
// Start the bot in the background — errors are caught inside the bot instance.
if (bot) {
  bot.start({
    onStart: (info) => {
      console.log(`[Bot] Started as @${info.username}`);
    },
    drop_pending_updates: false,
  }).catch((err) => {
    console.error('[Bot] Failed to start long polling:', err);
  });
}

export default app;
