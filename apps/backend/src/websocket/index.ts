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

// ─── Types ────────────────────────────────────────────────────────────────────

interface JwtPayload {
  playerId: string;
}

// ─── Rate limiter for CLAIM_WIN (5 req/min per player) ───────────────────────

const claimTimestamps = new Map<string, number[]>();

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
    // Use polling + upgrade for Telegram WebView compatibility
    transports: ['polling', 'websocket'],
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
  });

  nce.setOnNumberCalled((roundId, payload) => {
    io.to(`round:${roundId}`).emit('NUMBER_CALLED', payload);
  });

  nce.setOnRoundVoid((roundId) => {
    io.to(`round:${roundId}`).emit('ROUND_VOID', { roundId });
    // Replenish — create a new pending round for this stake level
    void RoundScheduler.ensureRoundsExist();
  });

  GameRoundService.setOnRoundVoidEmpty((roundId) => {
    io.to(`round:${roundId}`).emit('ROUND_VOID', { roundId, reason: 'No players joined' });
    void RoundScheduler.ensureRoundsExist();
  });

  GameRoundService.setOnRoundCancelled((roundId) => {
    io.to(`round:${roundId}`).emit('ROUND_CANCELLED', { roundId });
    void RoundScheduler.ensureRoundsExist();
  });

  // ── Connection handler ─────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io.on('connection', (socket: any) => {
    const playerId = socket.data.playerId as string;

    // ── JOIN_ROUND ────────────────────────────────────────────────────────────
    socket.on(
      'JOIN_ROUND',
      async (data: { roundId: string }, ack?: (res: object) => void) => {
        const { roundId } = data;

        // Check if player has a RoundEntry (player) or is watching
        const entry = await prisma.roundEntry.findUnique({
          where: {
            round_id_player_id: { round_id: roundId, player_id: playerId },
          },
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
            code: 'RATE_LIMITED',
            message: 'Too many win claims. Please wait before trying again.',
          });
          if (ack) ack({ ok: false, code: 'RATE_LIMITED' });
          return;
        }

        const result = await WinDetectionService.validateClaim(playerId, roundId);

        if (result.valid) {
          // Fetch winner info for broadcast
          const player = await prisma.player.findUnique({
            where: { id: playerId },
            select: { username: true },
          });

          const round = await prisma.gameRound.findUnique({
            where: { id: roundId },
            select: { derash: true, winner_cartela_number: true },
          });

          io.to(`round:${roundId}`).emit('ROUND_WON', {
            winnerPlayerId: playerId,
            winnerUsername: player?.username ?? 'Unknown',
            cartelaNumber: round?.winner_cartela_number,
            derash: round?.derash ? Number(round.derash) : 0,
          });

          // Replenish — ensure a new pending round exists for this stake level
          void RoundScheduler.ensureRoundsExist();

          if (ack) ack({ ok: true });
        } else {
          socket.emit('WIN_REJECTED', {
            code: result.reason ?? 'INVALID_CLAIM',
            message: 'Win claim is not valid',
          });
          if (ack) ack({ ok: false, code: result.reason });
        }
      },
    );
  });

  return io;
}
