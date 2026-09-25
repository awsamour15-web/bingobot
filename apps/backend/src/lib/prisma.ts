// Singleton Prisma client instance
import { PrismaClient } from '@prisma/client';

// Cap Prisma's internal connection pool to 5 for Neon's connection pooler.
// Neon uses pgBouncer in transaction mode — keep the pool small on Render's
// 512MB free tier to avoid connection exhaustion under concurrent game rounds.
function buildDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'] ?? '';
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('connection_limit', '5');
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
