// Singleton Prisma client instance
import { PrismaClient } from '@prisma/client';

// Cap Prisma's internal connection pool to 3.
// With Supabase PgBouncer (transaction mode), Prisma should use a small pool —
// PgBouncer handles the real connection multiplexing. On Render's 512MB free tier,
// a larger pool causes connection exhaustion under concurrent game rounds.
// The connection_limit param must be in the URL for Prisma to respect it.
function buildDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'] ?? '';
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('connection_limit', '3');
    parsed.searchParams.set('pool_timeout', '30');
    return parsed.toString();
  } catch {
    return url;
  }
}

const prisma = new PrismaClient({
  log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: { url: buildDatabaseUrl() },
  },
});

export default prisma;
