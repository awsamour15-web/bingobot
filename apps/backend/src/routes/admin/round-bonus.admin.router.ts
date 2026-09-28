// Admin Round Bonus endpoints
// GET /api/admin/round-bonus — list recent bonus winners

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import prisma from '../../lib/prisma.js';

const router: RouterType = Router();

interface BonusWinnerRow {
  id: string;
  round_id: string;
  player_id: string;
  cartela_number: number;
  bonus_amount: string;
  created_at: Date;
  player_username: string;
  player_telegram_id: bigint;
  round_stake: string;
  round_status: string;
}

// GET /api/admin/round-bonus?limit=50&offset=0
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(parseInt((req.query['limit'] as string) ?? '50', 10) || 50, 200);
  const offset = parseInt((req.query['offset'] as string) ?? '0', 10) || 0;

  const [countResult, winners] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM round_bonus_winners`,
    prisma.$queryRaw<BonusWinnerRow[]>`
      SELECT
        rbw.id,
        rbw.round_id,
        rbw.player_id,
        rbw.cartela_number,
        rbw.bonus_amount,
        rbw.created_at,
        p.username   AS player_username,
        p.telegram_id AS player_telegram_id,
        gr.stake     AS round_stake,
        gr.status    AS round_status
      FROM round_bonus_winners rbw
      JOIN players   p  ON p.id  = rbw.player_id
      JOIN game_rounds gr ON gr.id = rbw.round_id
      ORDER BY rbw.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  res.json({
    total,
    limit,
    offset,
    items: winners.map((w) => ({
      id: w.id,
      round_id: w.round_id,
      round_stake: Number(w.round_stake),
      round_status: w.round_status,
      player_id: w.player_id,
      player_username: w.player_username,
      player_telegram_id: w.player_telegram_id.toString(),
      cartela_number: w.cartela_number,
      bonus_amount: Number(w.bonus_amount),
      created_at: w.created_at.toISOString(),
    })),
  });
});

export default router;
