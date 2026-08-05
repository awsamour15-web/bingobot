import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  // Check existing migrations
  const migrations = await prisma.$queryRaw`
    SELECT migration_name, finished_at, applied_steps_count 
    FROM _prisma_migrations 
    ORDER BY started_at
  `;
  console.log('MIGRATIONS:', JSON.stringify(migrations, null, 2));

  // Check round_winners table structure
  const cols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_name = 'round_winners' AND table_schema = 'public'
    ORDER BY ordinal_position
  `;
  console.log('\nround_winners COLUMNS:', JSON.stringify(cols, null, 2));

  // Check indexes on round_winners
  const indexes = await prisma.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'round_winners'
  `;
  console.log('\nround_winners INDEXES:', JSON.stringify(indexes, null, 2));

  // Check FK constraints on round_winners
  const fks = await prisma.$queryRaw`
    SELECT 
      tc.constraint_name,
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'round_winners'
  `;
  console.log('\nround_winners FKs:', JSON.stringify(fks, null, 2));
} catch(e) {
  console.log('ERROR:', e.message);
} finally {
  await prisma.$disconnect();
}
