// Coupon Scheduler Service
// Reads coupon_schedules from SystemSetting and broadcasts coupon announcements
// to Telegram groups/channels at the scheduled time.

import prisma from '../lib/prisma.js';
import { bot } from '../bot/index.js';

export interface CouponSchedule {
  id: string;
  coupon_code: string;
  coupon_amount: number;
  coupon_description: string;
  target_ids: string[]; // Telegram channel/group IDs or '__bot_broadcast__'
  send_at: string;      // ISO string
  sent: boolean;
}

const SETTING_KEY = 'coupon_schedules';
const CHECK_INTERVAL_MS = 30_000;

async function loadSchedules(): Promise<CouponSchedule[]> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row?.value) return [];
  try { return JSON.parse(row.value as string) as CouponSchedule[]; } catch { return []; }
}

async function saveSchedules(schedules: CouponSchedule[]): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(schedules) },
    create: { key: SETTING_KEY, value: JSON.stringify(schedules) },
  });
}

async function sendCouponAnnouncement(schedule: CouponSchedule): Promise<void> {
  if (!bot) return;

  const botUsername = process.env['BOT_USERNAME'] ?? 'FidelBingoBot';
  const playLink = `https://t.me/${botUsername}`;

  const text =
    `🎟️ *COUPON ALERT!*\n\n` +
    `Use code: \`${schedule.coupon_code}\`\n` +
    `💵 *${schedule.coupon_amount} ETB* bonus${schedule.coupon_description ? `\n📝 ${schedule.coupon_description}` : ''}\n\n` +
    `Redeem it in the game lobby now! 🎮`;

  const keyboard = {
    inline_keyboard: [[{ text: '🎮 Claim Now', url: playLink }]],
  };

  // Resolve targets — if __bot_broadcast__ send to all players
  const chatIds: string[] = [];
  for (const t of schedule.target_ids) {
    if (t === '__bot_broadcast__') {
      let cursor: string | undefined;
      while (true) {
        const players = await prisma.player.findMany({
          where: { is_suspended: false },
          select: { telegram_id: true, id: true },
          take: 500,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (players.length === 0) break;
        for (const p of players) chatIds.push(String(p.telegram_id));
        if (players.length < 500) break;
        cursor = players[players.length - 1]!.id;
      }
    } else {
      chatIds.push(t);
    }
  }

  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (err) {
      console.error(`[CouponScheduler] Failed to send to ${chatId}:`, (err as Error).message);
    }
  }
}

async function tick(): Promise<void> {
  try {
    const schedules = await loadSchedules();
    const now = new Date();
    let changed = false;

    for (const s of schedules) {
      if (!s.sent && new Date(s.send_at) <= now) {
        await sendCouponAnnouncement(s);
        s.sent = true;
        changed = true;
        console.log(`[CouponScheduler] Sent announcement for coupon ${s.coupon_code}`);
      }
    }

    if (changed) await saveSchedules(schedules);
  } catch (err) {
    console.error('[CouponScheduler] tick error:', err);
  }
}

export const CouponScheduler = {
  _timer: undefined as ReturnType<typeof setInterval> | undefined,

  start(): void {
    console.log('[CouponScheduler] Starting');
    void tick();
    CouponScheduler._timer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
  },

  stop(): void {
    if (CouponScheduler._timer !== undefined) {
      clearInterval(CouponScheduler._timer);
      CouponScheduler._timer = undefined;
    }
  },

  loadSchedules,
  saveSchedules,
};
