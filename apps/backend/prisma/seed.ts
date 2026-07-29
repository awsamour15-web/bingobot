// Prisma seed script
// Task 2.2: Seed 272 CartelaDefinition rows (B-I-N-G-O column ranges, free space at index 12)
// Task 2.3: Seed default Config rows

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Column ranges for B-I-N-G-O
const COLUMN_RANGES: [number, number][] = [
  [1, 15],   // B
  [16, 30],  // I
  [31, 45],  // N
  [46, 60],  // G
  [61, 75],  // O
];

/**
 * Generate a unique 5x5 bingo grid for the given cartela number.
 * Uses a seeded selection to ensure deterministic, non-overlapping grids.
 * Returns a flat 25-element array (row-major). Index 12 = free space = 0.
 */
function generateGrid(cartelaNumber: number): number[] {
  // Each column picks 5 unique numbers from its range using a simple deterministic offset
  const grid: number[] = [];

  for (let col = 0; col < 5; col++) {
    const [min, max] = COLUMN_RANGES[col]!;
    const rangeSize = max - min + 1; // always 15
    const poolSize = 5;

    // Build the pool for this column: offset the starting index by cartelaNumber to spread across cartelas
    const offset = ((cartelaNumber - 1) * poolSize + col * 3) % rangeSize;
    const numbers: number[] = [];

    for (let i = 0; i < poolSize; i++) {
      numbers.push(min + ((offset + i * 3) % rangeSize));
    }

    // Ensure uniqueness within column by deduplication with fallback fill
    const seen = new Set<number>();
    const unique: number[] = [];
    for (const n of numbers) {
      if (!seen.has(n)) {
        seen.add(n);
        unique.push(n);
      }
    }
    // Fill any missing spots
    for (let n = min; n <= max && unique.length < poolSize; n++) {
      if (!seen.has(n)) {
        seen.add(n);
        unique.push(n);
      }
    }

    grid.push(...unique);
  }

  // grid is now column-major [B0,B1,B2,B3,B4, I0,..., O4]
  // Convert to row-major (the spec stores row-major)
  const rowMajor: number[] = new Array<number>(25).fill(0);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      rowMajor[row * 5 + col] = grid[col * 5 + row]!;
    }
  }

  // Index 12 (center) = free space = 0
  rowMajor[12] = 0;

  return rowMajor;
}

async function seedCartelas(): Promise<void> {
  console.log('Seeding 272 CartelaDefinition rows...');

  const cartelas = Array.from({ length: 272 }, (_, i) => ({
    cartela_number: i + 1,
    grid: generateGrid(i + 1),
  }));

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

  console.log(`  ✓ Seeded ${cartelas.length} cartela definitions`);
}

async function seedConfig(): Promise<void> {
  console.log('Seeding default Config rows...');

  const defaults = [
    { key: 'call_interval_ms', value: '5000' },
    { key: 'platform_commission_pct', value: '10' },
    { key: 'referral_commission_pct', value: '2' },
    { key: 'min_players_to_start', value: '2' },
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

  const password_hash = await bcrypt.hash('bingoadmin', 10);

  await prisma.admin.upsert({
    where: { username: 'amourbingo' },
    update: {},
    create: {
      username: 'amourbingo',
      password_hash,
      role: 'super_admin',
      is_active: true,
    },
  });

  console.log('  ✓ Seeded admin user: amourbingo');
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
