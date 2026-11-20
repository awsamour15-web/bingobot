// POST /api/auth/web-login — phone-based login for web (non-Telegram) users
//
// A player must have already registered via the Telegram bot and verified their
// phone number. The phone number is their identity proof here.
//
// Flow:
//  1. Client sends { phone: "09xxxxxxxx" }
//  2. We find the player by their verified phone number
//  3. We issue a JWT (same as Telegram login) and return it

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';

const router: RouterType = Router();

// Rate limit: 5 attempts per minute per IP to slow brute-force enumeration
const webLoginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts. Try again in a minute.' },
});

interface WebLoginRequest {
  phone?: string;
}

interface WebLoginResponse {
  token: string;
  playerId: string;
  phoneVerified: boolean;
  username: string;
  agentToken?: string;
  agentId?: string;
}

router.post('/web-login', webLoginRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as WebLoginRequest;

  if (!body?.phone || typeof body.phone !== 'string' || !body.phone.trim()) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'phone is required' });
    return;
  }

  const phone = body.phone.trim();

  // Accept Ethiopian format: 09xxxxxxxx, 07xxxxxxxx, or +2519xxxxxxxx / +2517xxxxxxxx
  const normalised = phone.startsWith('+251')
    ? '0' + phone.slice(4)   // +251911234567 → 0911234567
    : phone.startsWith('251')
      ? '0' + phone.slice(3) // 251911234567 → 0911234567
      : phone;

  if (!/^(09|07)\d{8}$/.test(normalised)) {
    res.status(400).json({
      error: 'INVALID_PHONE',
      message: 'Please enter a valid Ethiopian phone number (09xxxxxxxx or 07xxxxxxxx)',
    });
    return;
  }

  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Server configuration error' });
    return;
  }

  // Look up by verified phone — also try +251 prefix variant
  const plus251 = '+251' + normalised.slice(1);
  const player = await prisma.player.findFirst({
    where: {
      phone_verified: true,
      is_suspended: false,
      is_mock: false,
      OR: [
        { phone: normalised },
        { phone: plus251 },
      ],
    },
    select: { id: true, phone_verified: true, username: true, telegram_id: true },
  });

  if (!player) {
    // Return the same message regardless of whether the phone exists or is unverified
    // so we don't leak which phones are registered.
    res.status(401).json({
      error: 'PHONE_NOT_FOUND',
      message: 'No verified account found for this phone number. Please register first via the Telegram bot @MadaBingoBot.',
    });
    return;
  }

  const token = jwt.sign({ playerId: player.id }, jwtSecret, { expiresIn: '7d' });

  // Check if this player is also an agent
  const agentRecord = await prisma.agent.findUnique({
    where: { telegram_id: player.telegram_id },
    select: { id: true, is_active: true },
  });

  const response: WebLoginResponse = {
    token,
    playerId: player.id,
    phoneVerified: player.phone_verified,
    username: player.username,
  };

  if (agentRecord?.is_active) {
    const agentToken = jwt.sign(
      { agentId: agentRecord.id, role: 'agent' },
      jwtSecret,
      { expiresIn: '7d' },
    );
    response.agentToken = agentToken;
    response.agentId = agentRecord.id;
  }

  res.status(200).json(response);
});

export default router;
