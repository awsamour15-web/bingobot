// Prisma seed script
// Task 2.2: Seed CartelaDefinition rows from pre-defined cards in cartela.js
// Task 2.3: Seed default Config rows

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { bingoCards } = require('./cartela.js') as {
  bingoCards: Record<string, (number | string)[][]>;
};

const prisma = new PrismaClient();

/**
 * Convert a 5×5 cartela card from cartela.js into a flat 25-element row-major
 * integer array. The FREE cell (any case) becomes 0 at index 12.
 */
function cardToGrid(rows: (number | string)[][]): number[] {
  const flat: number[] = [];
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell === 'string') {
        flat.push(0); // FREE space
      } else {
        flat.push(cell);
      }
    }
  }
  // Guarantee index 12 is 0 (free space) regardless of position
  flat[12] = 0;
  return flat;
}

async function seedCartelas(): Promise<void> {
  // Use all 800 cards from the pre-defined bingoCards set
  const TOTAL = 800;
  console.log(`Seeding ${TOTAL} CartelaDefinition rows from cartela.js...`);

  const cartelas = Array.from({ length: TOTAL }, (_, i) => {
    const num = i + 1;
    const card = bingoCards[String(num)];
    if (!card) throw new Error(`Missing cartela card #${num} in cartela.js`);
    return { cartela_number: num, grid: cardToGrid(card) };
  });

  // Upsert all cartelas in one batch
  await prisma.$transaction(
    cartelas.map((c) =>
      prisma.cartelaDefinition.upsert({
        where: { cartela_number: c.cartela_number },
        update: { grid: c.grid },
        create: c,
      })
    )
  );

  console.log(`  ✓ Seeded ${cartelas.length} cartela definitions from cartela.js`);
}

async function seedConfig(): Promise<void> {
  console.log('Seeding default Config rows...');

  const defaults = [
    { key: 'call_interval_ms', value: '4000' },
    { key: 'platform_commission_pct', value: '20' },
    { key: 'referral_commission_pct', value: '2' },
    { key: 'min_players_to_start', value: '1' },
    { key: 'deposit_telebirr_number', value: '0934942672' },
    { key: 'support_contact', value: '@FidelBingoSupport' },
    { key: 'channel_link', value: 'https://t.me/FidelBingo_public' },
    { key: 'claim_window_ms', value: '5000' },
    // Channel membership gate — set to @YourChannel or a numeric ID to enforce joining.
    // Leave empty to disable the gate.
    { key: 'required_channel', value: '' },
    // Mock player bot — auto-fills rounds with bot players
    { key: 'mock_bot_enabled', value: 'false' },
    { key: 'mock_bot_win_enabled', value: 'false' },
    { key: 'mock_bot_count', value: '3' },
    { key: 'mock_bot_balance', value: '0' },
  ];

  for (const row of defaults) {
    await prisma.config.upsert({
      where: { key: row.key },
      update: {},          // Don't overwrite if already customized
      create: row,
    });
  }

  console.log(`  ✓ Seeded ${defaults.length} config keys`);
}

async function seedAdmin(): Promise<void> {
  console.log('Seeding default admin user...');

  // Use SEED_ADMIN_PASSWORD env var if set, otherwise generate a random password.
  // A hardcoded default password is a security risk — the generated password is
  // printed once to stdout so it can be noted and then changed via the admin panel.
  const envPassword = process.env['SEED_ADMIN_PASSWORD'];
  const password = envPassword ?? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!9';
  const password_hash = await bcrypt.hash(password, 12);

  const existing = await prisma.admin.findUnique({ where: { username: 'amourbingo' } });

  if (!existing) {
    await prisma.admin.create({
      data: {
        username: 'amourbingo',
        password_hash,
        role: 'super_admin',
        is_active: true,
      },
    });
    if (!envPassword) {
      console.log(`  ✓ Created admin user: amourbingo`);
      console.log(`  ⚠️  Generated password (change this immediately): ${password}`);
    } else {
      console.log('  ✓ Created admin user: amourbingo (password from SEED_ADMIN_PASSWORD)');
    }
  } else {
    console.log('  ✓ Admin user already exists — skipping (password unchanged)');
  }
}

async function main(): Promise<void> {
  await seedCartelas();
  await seedConfig();
  await seedAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
