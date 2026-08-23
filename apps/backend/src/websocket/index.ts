// WebSocket server — Socket.IO on the shared HTTP server
// Requirements: 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 13.3

import { type Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { WinDetectionService } from '../services/win-detection.service.js';
import { nce } from '../services/nce.service.js';
import { GameRoundService } from '../services/game-round.service.js';
import { RoundScheduler } from '../services/round-scheduler.service.js';
import { MockPlayerBotService } from '../services/mock-player-bot.service.js';
import { GameStatus } from '@fidel/shared';
import { crashEngine } from '../services/crash-engine.service.js';

// ─── Module-level io reference for crash routes ───────────────────────────────
let _crashIo: InstanceType<typeof SocketIOServer> | null = null;
export function getCrashIo(): InstanceType<typeof SocketIOServer> | null { return _crashIo; }

// ─── Types ────────────────────────────────────────────────────────────────────

interface JwtPayload {
  playerId: string;
}

// ─── Rate limiter for CLAIM_WIN (5 req/min per player) ───────────────────────

const claimTimestamps = new Map<string, number[]>();

// Purge stale claim timestamps every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  const windowMs = 60_000;
  for (const [playerId, timestamps] of claimTimestamps) {
    const fresh = timestamps.filter((t) => now - t < windowMs);
    if (fresh.length === 0) claimTimestamps.delete(playerId);
    else claimTimestamps.set(playerId, fresh);
  }
}, 5 * 60_000);

function isClaimRateLimited(playerId: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const maxClaims = 5;

  const timestamps = (claimTimestamps.get(playerId) ?? []).filter(
    (t) => now - t < windowMs,
  );

  if (timestamps.length >= maxClaims) return true;

  timestamps.push(now);
  claimTimestamps.set(playerId, timestamps);
  return false;
}

// ─── Redis pub/sub helpers ────────────────────────────────────────────────────

function createRedisSubscriber(): Redis | null {
  const url = process.env['REDIS_URL'];
  if (!url) {
    console.warn('[WebSocket] REDIS_URL not set — Redis pub/sub disabled, single-instance mode only.');
    return null;
  }
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null, // don't retry
  });
  client.on('error', (err: Error) => {
    console.error('[ioredis] Connection error:', err.message);
  });
  return client;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

/**
 * Queries the DB for the current system-wide game state and broadcasts
 * SYSTEM_STATE to all connected clients so they can sync to the right screen.
 */
async function broadcastSystemState(io: InstanceType<typeof SocketIOServer>): Promise<void> {
  try {
    const [activeRound, pendingRound] = await Promise.all([
      prisma.gameRound.findFirst({
        where: { status: GameStatus.active },
        orderBy: { start_time: 'asc' },
        select: { id: true, stake: true },
      }),
      prisma.gameRound.findFirst({
        where: { status: GameStatus.pending },
        orderBy: { start_time: 'asc' },
        select: { id: true, stake: true },
      }),
    ]);

    if (activeRound) {
      io.emit('SYSTEM_STATE', { phase: 'live', roundId: activeRound.id, stake: Number(activeRound.stake) });
    } else if (pendingRound) {
      io.emit('SYSTEM_STATE', { phase: 'cartela', roundId: pendingRound.id, stake: Number(pendingRound.stake) });
    } else {
      io.emit('SYSTEM_STATE', { phase: 'idle', roundId: null, stake: null });
    }
  } catch (err) {
    console.error('[WebSocket] broadcastSystemState error:', err);
  }
}

/**
 * Attaches a Socket.IO server to the given HTTP server.
 *
 * - Configures CORS for the Mini App origin.
 * - Validates JWT on connection handshake; rejects unauthenticated sockets.
 * - Wires NCE and GameRoundService callbacks so game events fan-out to rooms.
 * - Subscribes to Redis pub/sub channels for cross-process fan-out.
 *
 * @returns the Socket.IO server instance (useful for testing / graceful shutdown)
 */
export function setupWebSocket(httpServer: HttpServer): InstanceType<typeof SocketIOServer> {
  const miniAppOrigin = process.env['MINI_APP_ORIGIN'] ?? '*';
  const jwtSecret = process.env['JWT_SECRET'] ?? '';

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: miniAppOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Prefer WebSocket for lower latency; fall back to polling for restrictive networks
    transports: ['websocket', 'polling'],
    // Connection timeout
    connectTimeout: 10000,
  }) as InstanceType<typeof SocketIOServer>;

  // ── JWT auth middleware on every socket connection ──────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io.use((socket: any, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error('MISSING_TOKEN'));
    }

    try {
      const payload = jwt.verify(token, jwtSecret) as JwtPayload;
      socket.data.playerId = payload.playerId as string;
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  // ── Redis subscriber for cross-process pub/sub fan-out ──────────────────────
  const subscriber = createRedisSubscriber();

  if (subscriber) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscriber.on('message', (channel: string, message: string) => {
    // game:{roundId}:number  → NUMBER_CALLED
    const numberMatch = channel.match(/^game:(.+):number$/);
    if (numberMatch) {
      const roundId = numberMatch[1] as string;
      io.to(`round:${roundId}`).emit('NUMBER_CALLED', JSON.parse(message) as object);
      return;
    }

    // round:{roundId}:void → ROUND_VOID
    const voidMatch = channel.match(/^round:(.+):void$/);
    if (voidMatch) {
      const roundId = voidMatch[1] as string;
      io.to(`round:${roundId}`).emit('ROUND_VOID', JSON.parse(message) as object);
      return;
    }

    // round:{roundId}:cancelled → ROUND_CANCELLED
    const cancelledMatch = channel.match(/^round:(.+):cancelled$/);
    if (cancelledMatch) {
      const roundId = cancelledMatch[1] as string;
      io.to(`round:${roundId}`).emit('ROUND_CANCELLED', JSON.parse(message) as object);
    }
  });
  }

  // ── Wire NCE callbacks so in-process events also fan-out ───────────────────

  nce.setOnRoundStarted((roundId, payload) => {
    io.to(`round:${roundId}`).emit('ROUND_STARTED', { ...payload, roundId });
    // Sync all clients to the live game page
    void broadcastSystemState(io);
  });

  nce.setOnNumberCalled((roundId, payload) => {
    io.to(`round:${roundId}`).emit('NUMBER_CALLED', payload);
    // Feed called numbers to mock bot win injector
    void prisma.calledNumber.findMany({ where: { round_id: roundId }, select: { number: true } })
      .then((rows) => MockPlayerBotService.onNumberCalled(roundId, rows.map((r) => r.number)));
  });

  nce.setOnRoundVoid((roundId) => {
    MockPlayerBotService.onRoundEnded(roundId);
    io.to(`round:${roundId}`).emit('ROUND_VOID', { roundId });
    // Replenish — create a new pending round for this stake level
    void RoundScheduler.ensureRoundsExist().then(() => broadcastSystemState(io));
  });

  GameRoundService.setOnRoundVoidEmpty((roundId) => {
    io.to(`round:${roundId}`).emit('ROUND_VOID', { roundId, reason: 'No players joined' });
    void RoundScheduler.ensureRoundsExist().then(() => broadcastSystemState(io));
  });

  GameRoundService.setOnRoundCancelled((roundId) => {
    MockPlayerBotService.onRoundEnded(roundId);
    io.to(`round:${roundId}`).emit('ROUND_CANCELLED', { roundId });
    void RoundScheduler.ensureRoundsExist().then(() => broadcastSystemState(io));
  });

  GameRoundService.setOnCartelaTaken((roundId, cartelaNumbers, playerCount, excludePlayerId) => {
    const payload = { roundId, cartelaNumbers, playerCount };
    if (excludePlayerId) {
      // Find and exclude the picker's socket(s) — they manage their own UI
      const sockets = io.sockets.sockets;
      const excludeSocketIds: string[] = [];
      for (const [id, s] of sockets) {
        if ((s as any).data?.playerId === excludePlayerId) excludeSocketIds.push(id);
      }
      if (excludeSocketIds.length > 0) {
        io.to(`round:${roundId}`).except(excludeSocketIds).emit('CARTELA_TAKEN', payload);
      } else {
        io.to(`round:${roundId}`).emit('CARTELA_TAKEN', payload);
      }
    } else {
      io.to(`round:${roundId}`).emit('CARTELA_TAKEN', payload);
    }
  });

  GameRoundService.setOnCartelaReserved((roundId, cartelaNumbers) => {
    io.to(`round:${roundId}`).emit('CARTELA_RESERVED', { cartelaNumbers });
  });

  GameRoundService.setOnCartelaUnreserved((roundId, cartelaNumbers) => {
    io.to(`round:${roundId}`).emit('CARTELA_UNRESERVED', { cartelaNumbers });
  });

  // Broadcast system state whenever the scheduler creates a new pending round
  RoundScheduler.setOnRoundsReplenished(() => {
    void broadcastSystemState(io);
  });

  // ── Wire WinDetectionService ROUND_WON callback ────────────────────────────
  WinDetectionService.setOnRoundWon((roundId, payload) => {
    io.to(`round:${roundId}`).emit('ROUND_WON', payload);
  });

  // ── Wire Crash Engine callbacks ────────────────────────────────────────────
  _crashIo = io;

  crashEngine.onBettingOpen = (roundId, countdownMs) => {
    io.emit('CRASH_BETTING_OPEN', { roundId, countdownMs });
  };
  crashEngine.onStarted = (roundId, startedAt) => {
    io.emit('CRASH_STARTED', { roundId, startedAt });
  };
  crashEngine.onTick = (multiplier) => {
    io.emit('CRASH_TICK', { multiplier });
  };
  crashEngine.onCashedOut = (playerId, username, multiplier, payout) => {
    io.emit('CRASH_CASHED_OUT', { playerId, username, multiplier, payout });
  };
  crashEngine.onEnded = (roundId, crashPoint) => {
    io.emit('CRASH_ENDED', { roundId, crashPoint });
  };

  crashEngine.start();

  // ── Connection handler ─────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io.on('connection', (socket: any) => {
    const playerId = socket.data.playerId as string;

    // Send current system state immediately so new clients sync to correct screen
    void broadcastSystemState(io);

    // ── LEAVE_ROUND ───────────────────────────────────────────────────────────
    socket.on('LEAVE_ROUND', async (data: { roundId: string }) => {
      await socket.leave(`round:${data.roundId}`);
    });

    // ── JOIN_ROUND ────────────────────────────────────────────────────────────
    socket.on(
      'JOIN_ROUND',
      async (data: { roundId: string }, ack?: (res: object) => void) => {
        const { roundId } = data;

        // Check if player has a RoundEntry (player) or is watching
        const entry = await prisma.roundEntry.findFirst({
          where: { round_id: roundId, player_id: playerId, is_watching: false },
        });

        // Always allow joining the socket room — watchers get live updates too
        await socket.join(`round:${roundId}`);

        if (subscriber) {
          await subscriber.subscribe(
            `game:${roundId}:number`,
            `round:${roundId}:void`,
            `round:${roundId}:cancelled`,
          );
        }

        // Only broadcast player count if the player actually has an entry
        if (entry) {
          const playerCount = await prisma.roundEntry.count({
            where: { round_id: roundId },
          });
          io.to(`round:${roundId}`).emit('PLAYER_JOINED', { playerCount });
        }

        if (ack) ack({ ok: true });
      },
    );

    // ── CLAIM_WIN ─────────────────────────────────────────────────────────────
    socket.on(
      'CLAIM_WIN',
      async (
        data: { roundId: string; cartelaId?: number },
        ack?: (res: object) => void,
      ) => {
        const { roundId } = data;

        // Rate limit: 5 claims/min per player
        if (isClaimRateLimited(playerId)) {
          socket.emit('WIN_REJECTED', {
            reason: 'RATE_LIMITED',
          });
          if (ack) ack({ ok: false, code: 'RATE_LIMITED' });
          return;
        }

        const result = await WinDetectionService.validateClaim(playerId, roundId);

        if (result.valid) {
          // Claim accepted — distribution happens after claim window expires
          if (ack) ack({ ok: true });
        } else {
          socket.emit('WIN_REJECTED', {
            reason: result.reason ?? 'INVALID_CLAIM',
          });
          if (ack) ack({ ok: false, code: result.reason });
        }
      },
    );

    // ── CRASH_CASHOUT ─────────────────────────────────────────────────────────
    socket.on('CRASH_CASHOUT', async (data: { roundId: string }, ack?: (res: object) => void) => {
      try {
        const { multiplier, payout } = await crashEngine.cashout(data.roundId, playerId);
        socket.emit('CRASH_CASHOUT_ACK', { multiplier, payout });
        if (ack) ack({ ok: true, multiplier, payout });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Cashout failed';
        if (ack) ack({ ok: false, error: msg });
      }
    });
  });

  return io;
}
