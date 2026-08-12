// POST /api/auth/login — Telegram initData verification, player upsert, JWT issuance
// Requirements: 1.1, 1.2, 8.1, 8.2, 9.2

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';
import { verifyTelegramInitData, TelegramAuthError } from '../lib/telegram-auth.js';
import { authRateLimiter } from '../middleware/telegram-auth.middleware.js';
import prisma from '../lib/prisma.js';

type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

// Inline types matching shared package shapes to avoid build-order dependency
interface LoginRequest {
  initData: string;
  start?: string;
}
interface LoginResponse {
  token: string;
  playerId: string;
  agentToken?: string;
  agentId?: string;
}

const router: RouterType = Router();

/**
 * POST /api/auth/login
 *
 * Body: { initData: string, start?: string }
 *
 * 1. Verifies Telegram initData.
 * 2. Upserts the Player row keyed by telegram_id.
 * 3. On first creation: creates main + play wallets, attributes referral if present.
 * 4. Returns a signed JWT containing { playerId }.
 */
router.post(
  '/login',
  authRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as LoginRequest;

    if (!body?.initData || typeof body.initData !== 'string') {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'initData is required',
      });
      return;
    }

    const botToken = process.env['BOT_TOKEN'];
    const jwtSecret = process.env['JWT_SECRET'];

    if (!botToken || !jwtSecret) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Server configuration error',
      });
      return;
    }

    // ── Step 1: Verify initData ──────────────────────────────────────────────
    let telegramUser: { id: number; first_name: string; username?: string };
    
    // Development mode: accept mock initData for testing
    const isDevelopment = process.env['NODE_ENV'] === 'development';
    const isMockData = body.initData === 'mock_init_data_for_development';
    
    if (isDevelopment && isMockData) {
      // Mock user for development
      telegramUser = {
        id: 999999999,
        first_name: 'Dev User',
        username: 'devuser',
      };
    } else {
      try {
        telegramUser = verifyTelegramInitData(body.initData, botToken);
      } catch (err) {
        if (err instanceof TelegramAuthError) {
          res.status(401).json({
            error: 'INVALID_TELEGRAM_AUTH',
            message: err.message,
          });
          return;
        }
        throw err;
      }
    }

    // ── Step 2 & 3: Upsert player + wallets in a transaction ─────────────────
    const telegramId = BigInt(telegramUser.id);
    const username =
      telegramUser.username ?? telegramUser.first_name ?? `user_${telegramUser.id}`;

    // Parse optional referral start param: "ref_<telegramId>"
    const referralParam = body.start;
    let referrerId: string | undefined;

    if (referralParam?.startsWith('ref_')) {
      const referrerTelegramId = BigInt(referralParam.slice(4));
      // Lookup referrer — ignore if not found (don't block login)
      const referrer = await prisma.player.findUnique({
        where: { telegram_id: referrerTelegramId },
        select: { id: true },
      });
      referrerId = referrer?.id;
    }

    const player = await prisma.$transaction(async (tx: PrismaTx) => {
      // Try to find existing player
      const existing = await tx.player.findUnique({
        where: { telegram_id: telegramId },
        select: { id: true },
      });

      if (existing) {
        // Update username in case it changed in Telegram
        await tx.player.update({
          where: { telegram_id: telegramId },
          data: { username },
        });
        return existing;
      }

      // First-time registration
      const newPlayer = await tx.player.create({
        data: {
          telegram_id: telegramId,
          username,
          ...(referrerId ? { referrer_id: referrerId } : {}),
        },
        select: { id: true },
      });

      // Create main and play wallets
      await tx.wallet.createMany({
        data: [
          { player_id: newPlayer.id, type: 'main', balance: 0 },
          { player_id: newPlayer.id, type: 'play', balance: 0 },
        ],
      });

      return newPlayer;
    });

    // ── Step 4: Issue JWT ────────────────────────────────────────────────────
    const token = jwt.sign({ playerId: player.id }, jwtSecret, {
      expiresIn: '24h',
    });

    // ── Step 5: Check if this Telegram user is also an Agent ─────────────────
    const agentRecord = await prisma.agent.findUnique({
      where: { telegram_id: telegramId },
      select: { id: true, is_active: true },
    });

    const response: LoginResponse = { token, playerId: player.id };

    if (agentRecord) {
      const agentToken = jwt.sign(
        { agentId: agentRecord.id, role: 'agent' },
        jwtSecret,
        { expiresIn: '24h' },
      );
      response.agentToken = agentToken;
      response.agentId = agentRecord.id;
    }

    res.status(200).json(response);
  }
);

export default router;
