// Express middleware for Telegram Mini App authentication
// Requirements: 1.2, 1.3

import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyTelegramInitData, TelegramAuthError, type TelegramUser } from '../lib/telegram-auth.js';

// ─── Type augmentation ────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      telegramUser?: TelegramUser;
    }
  }
}

// ─── Rate limiter: 10 requests/min per IP on auth endpoint ───────────────────

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later.',
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Validates the `X-Telegram-Init-Data` header on every request.
 * On success, attaches the parsed Telegram user to `req.telegramUser`.
 * On failure, returns HTTP 401 with a typed JSON error.
 */
export function telegramAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const initData = req.headers['x-telegram-init-data'];

  if (!initData || typeof initData !== 'string') {
    res.status(401).json({
      error: 'INVALID_TELEGRAM_AUTH',
      message: 'Missing X-Telegram-Init-Data header',
    });
    return;
  }

  const botToken = process.env['BOT_TOKEN'];
  if (!botToken) {
    // Misconfiguration — never leak details to the client
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Server configuration error',
    });
    return;
  }

  try {
    req.telegramUser = verifyTelegramInitData(initData, botToken);
    next();
  } catch (err) {
    if (err instanceof TelegramAuthError) {
      res.status(401).json({
        error: 'INVALID_TELEGRAM_AUTH',
        message: err.message,
      });
      return;
    }
    // Unexpected error
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Authentication processing failed',
    });
  }
}
